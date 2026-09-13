/**
 * 备份校验核心逻辑。
 *
 * 抽成独立模块的原因：备份恢复路径是「用户数据的唯一副本」，而它此前**零测试**。
 * 这里既供 scripts/verify-backup.mjs 使用，也供 test/ 直接单测（无需网络）。
 *
 * 解密实现**必须**与 scripts/decrypt-backup.mjs 保持一致：
 *   MAGIC(8) | [':' + keyid(12hex)]? | IV(12) | ciphertext
 *   带 keyid → 派生 `DuckImg backup v1\0k1\0<secret>`
 *   无 keyid → 派生 `DuckImg backup v1\0<secret>`（历史格式），兜底再试 `v1\0\0<secret>`
 */
import { createHash, webcrypto } from 'node:crypto';

const MAGIC = 'DUCKIMG1';

/** 密钥指纹（与 src/functions/utils/backup.js 的 keyFingerprint 一致） */
export async function keyFingerprint(secret) {
  const h = new Uint8Array(await webcrypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('DuckImg backup keyid v1\0' + secret),
  ));
  return Buffer.from(h.subarray(0, 6)).toString('hex');
}

/** 解析备份文件头（不解密） */
export function parseBackupHeader(data) {
  const magic = Buffer.from(data.subarray(0, 8)).toString('utf8');
  if (magic !== MAGIC) return { ok: false, reason: `magic 不是 ${MAGIC}（读到 "${magic}"）` };
  if (data.length < 8 + 12 + 16) return { ok: false, reason: '文件过短，不可能是有效备份' };
  let offset = 8;
  let keyId = '';
  if (data[8] === 0x3a /* ':' */) {
    keyId = Buffer.from(data.subarray(9, 21)).toString('utf8');
    offset = 21;
  }
  return { ok: true, keyId, offset, hasKeyId: offset === 21 };
}

/**
 * 解密备份。
 * @returns {Promise<{ok: true, plaintext: Uint8Array, keyId: string, usedDerivation: number}
 *                  | {ok: false, reason: string, keyId?: string, fingerprintMismatch?: boolean}>}
 */
export async function decryptBackup(data, secret) {
  const header = parseBackupHeader(data);
  if (!header.ok) return { ok: false, reason: header.reason };

  const { keyId, offset } = header;
  const iv = data.subarray(offset, offset + 12);
  const ciphertext = data.subarray(offset + 12);

  // 带 keyid 时先核对指纹，给出「用错钥匙」这种可操作的报错，而不是笼统的解密失败
  if (header.hasKeyId) {
    const actual = await keyFingerprint(secret);
    if (actual !== keyId) {
      return {
        ok: false,
        keyId,
        fingerprintMismatch: true,
        reason: `密钥指纹不匹配：该备份由 ${keyId} 加密，当前密钥是 ${actual}。请使用生成该备份时所用的密钥。`,
      };
    }
  }

  const derivations = header.hasKeyId
    ? [`DuckImg backup v1\0k1\0${secret}`]
    : [`DuckImg backup v1\0${secret}`, `DuckImg backup v1\0\0${secret}`];

  for (let i = 0; i < derivations.length; i++) {
    const keyBytes = createHash('sha256').update(derivations[i]).digest();
    const key = await webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    try {
      const plaintext = new Uint8Array(
        await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext),
      );
      return { ok: true, plaintext, keyId, usedDerivation: i };
    } catch { /* 试下一个派生式 */ }
  }

  return { ok: false, keyId, reason: '解密失败：密钥不正确，或文件已损坏/被截断' };
}

/** 该字节流是否是 gzip（备份超过阈值会先 gzip 再加密） */
export function isGzip(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** 解 gzip；非 gzip 原样返回 */
export async function maybeGunzip(bytes) {
  if (!isGzip(bytes)) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 备份应当包含的表（缺任何一个都会让恢复不完整） */
export const REQUIRED_TABLES = [
  'd1_migrations', 'users', 'images', 'upload_counts', 'kv_store',
];

/**
 * 校验解密后的 SQL 内容是否像一份完整的可恢复备份。
 * @param {string} sql
 * @param {Record<string, number>} [expectedCounts] 历史记录里的 counts，用于核对行数
 */
export function verifyBackupSql(sql, expectedCounts = null) {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

  add('非空', sql.length > 0, `${sql.length} 字符`);

  for (const t of REQUIRED_TABLES) {
    // 备份用 CREATE TABLE IF NOT EXISTS 导出，两种写法都认
    const re = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+"?${t}"?|CREATE TABLE\\s+"?${t}"?`, 'i');
    add(`包含表 ${t}`, re.test(sql));
  }

  // users 表的关键列必须存在（token_version 来自 0002 迁移）
  add('users 含 token_version 列', /token_version/i.test(sql));
  add('含站点配置行 config:settings', sql.includes('config:settings'));

  // 完整性：不能以半条语句结尾
  const tail = sql.trimEnd().slice(-200);
  add('结尾未被截断', /(?:;|\))\s*$/.test(tail), `结尾: ${JSON.stringify(sql.trimEnd().slice(-30))}`);

  add('不含 INSERT OR REPLACE 之外的非法标记', !/\bundefined\b/.test(tail));

  if (expectedCounts && typeof expectedCounts === 'object') {
    for (const t of REQUIRED_TABLES) {
      if (typeof expectedCounts[t] !== 'number') continue;
      if (expectedCounts[t] === 0) continue; // 瞬态表（限流/验证码）本来就不导数据
      const re = new RegExp(`INSERT INTO\\s+"?${t}"?`, 'i');
      add(`表 ${t} 有数据行（历史记录 ${expectedCounts[t]} 行）`, re.test(sql));
    }
  }

  return { checks, ok: checks.every((c) => c.ok) };
}
