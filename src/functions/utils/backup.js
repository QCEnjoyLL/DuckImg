/**
 * D1 备份：把业务表 dump 成可回灌的 .sql，压缩（可选）并经 AES-GCM 加密后，
 * 用现有 Bot 以文档形式发到 Telegram 存储频道（备份和图片睡同一个频道）。
 *
 * 触发方式：
 * - 自动：cron 每天调 maybeRunScheduledBackup，按后台设置的频率（off/daily/weekly/monthly）决定是否执行；
 * - 手动：管理后台「立即备份」调 runDbBackup(env, { trigger: 'manual' })。
 * 每次执行（含失败）都会写入 kv_store 的 backup:history，供后台查看与下载。
 *
 * 恢复 / 迁移（空库可直接执行，dump 自带建表语句；gz 备份先解压）：
 *   npx wrangler d1 execute duckimg --remote --file=duckimg-backup-YYYY-MM-DD.sql
 *
 * 设计约束：
 * - INSERT OR REPLACE 幂等，同一份备份重复回灌不报错；
 * - 不输出 BEGIN/COMMIT/PRAGMA（wrangler d1 execute 会拒绝事务语句）；
 * - 单条 INSERT 限行数与字符数，避免导入时 "Statement too long"；
 * - 瞬态数据不入备份：rate_limits、verification_codes，以及 kv_store 的缓存/待处理记录；
 * - 发往 Telegram 的文件必须加密；后台即时导出接口仍提供管理员主动下载的明文 SQL。
 */

import { kvGet, kvPut } from './db.js';
import { getSettings, settingsForBackup } from './settings.js';

const CHUNK_ROWS = 1000;                 // 分页拉取行数（控制单次 D1 响应大小与查询次数）
const MAX_ROWS_PER_INSERT = 50;          // 单条 INSERT 最多行数
const MAX_INSERT_CHARS = 60000;          // 单条 INSERT 字符预算
const GZIP_THRESHOLD = 8 * 1024 * 1024;  // 超过 8MB 用 gzip（TG Bot 上传上限 50MB）

const HISTORY_KEY = 'backup:history';
const LAST_AT_KEY = 'backup:lastAt';
const HISTORY_MAX = 60;

// 自动备份频率 → 周期毫秒；cron 每天检查一次，减去 3h 松量避免踩点误差导致顺延一天
export const BACKUP_PERIODS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};
const DUE_SLACK_MS = 3 * 60 * 60 * 1000;

// 表级策略：未列出的表（含未来新增）默认全量备份
const TABLE_RULES = {
  rate_limits: { skipData: true }, // 限流桶纯瞬态，只留表结构
  verification_codes: { skipData: true },
  kv_store: {
    // 缓存、验证码上下文和备份历史均可重建，不携带进备份。
    where: (now) => `key NOT LIKE 'tgpath:%'
      AND key NOT LIKE 'mxok:%'
      AND key NOT LIKE 'pendingreg:%'
      AND key NOT LIKE 'emailchange:%'
      AND key NOT LIKE 'backup:%'
      AND (expires_at IS NULL OR expires_at > ${now})`,
  },
};

function sanitizeBackupRow(table, row) {
  if (table !== 'kv_store' || row.key !== 'config:settings') return row;
  try {
    const parsed = JSON.parse(row.value);
    return { ...row, value: JSON.stringify(settingsForBackup(parsed)) };
  } catch {
    // 解析失败时不把未知的旧配置内容带入异地备份。
    return { ...row, value: JSON.stringify(settingsForBackup(null)) };
  }
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function sqlLit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const u8 = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    let hex = '';
    for (let i = 0; i < u8.length; i++) hex += u8[i].toString(16).padStart(2, '0');
    return `X'${hex}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** 给 CREATE TABLE / CREATE [UNIQUE] INDEX 补 IF NOT EXISTS，保证回灌幂等 */
function normalizeCreate(sql) {
  let s = String(sql).trim();
  s = s.replace(/^CREATE TABLE\s+(?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ');
  s = s.replace(/^CREATE (UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/i, (_m, u) => `CREATE ${u ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS `);
  return s;
}

/** 生成完整备份 SQL；返回 { sql, counts }（counts 为各表导出行数） */
export async function buildBackupSql(env) {
  const db = env && env.DB;
  if (!db) throw new Error('D1 binding DB missing');
  const now = Date.now();

  // 动态取 schema：跳过 SQLite 内部表与 D1 内部表（_cf_*），未来新增表自动纳入
  const schemaRes = await db
    .prepare(
      `SELECT name, type, sql FROM sqlite_master
       WHERE sql IS NOT NULL
         AND substr(name, 1, 7) != 'sqlite_'
         AND substr(name, 1, 4) != '_cf_'
       ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`
    )
    .all();
  const entries = schemaRes.results || [];
  const tables = entries.filter((e) => e.type === 'table').map((e) => e.name);

  const parts = [
    `-- DuckImg D1 备份 ${new Date(now).toISOString()}`,
    '-- 回灌：npx wrangler d1 execute duckimg --remote --file=<本文件>',
    '-- 注意：rate_limits 只含结构；kv_store 已剔除 tgpath:* 缓存与过期行',
    '',
  ];
  for (const e of entries) parts.push(normalizeCreate(e.sql) + ';');
  parts.push('');

  const counts = {};
  for (const table of tables) {
    const rule = TABLE_RULES[table] || {};
    counts[table] = 0;
    if (rule.skipData) continue;
    const extraWhere = rule.where ? ` AND (${rule.where(now)})` : '';

    let cols = null;
    let lastRid = -1;
    let batch = [];
    let batchChars = 0;
    const flush = () => {
      if (!batch.length) return;
      parts.push(
        `INSERT OR REPLACE INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(', ')}) VALUES\n` +
          batch.join(',\n') + ';'
      );
      batch = [];
      batchChars = 0;
    };

    // 用 rowid 键集分页（本项目无 WITHOUT ROWID 表），避免 OFFSET 全表反复扫描
    for (;;) {
      const res = await db
        .prepare(
          `SELECT rowid AS __rid, * FROM ${quoteIdent(table)} WHERE rowid > ?${extraWhere} ORDER BY rowid LIMIT ${CHUNK_ROWS}`
        )
        .bind(lastRid)
        .all();
      const rows = res.results || [];
      if (!rows.length) break;
      for (const rawRow of rows) {
        const row = sanitizeBackupRow(table, rawRow);
        lastRid = row.__rid;
        if (!cols) cols = Object.keys(row).filter((k) => k !== '__rid');
        const tuple = '(' + cols.map((cn) => sqlLit(row[cn])).join(', ') + ')';
        batch.push(tuple);
        batchChars += tuple.length + 2;
        counts[table] += 1;
        if (batch.length >= MAX_ROWS_PER_INSERT || batchChars >= MAX_INSERT_CHARS) flush();
      }
      if (rows.length < CHUNK_ROWS) break;
    }
    flush();
    parts.push('');
  }

  return { sql: parts.join('\n'), counts };
}

async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const BACKUP_MAGIC = new TextEncoder().encode('DUCKIMG1');

async function encryptBackupBytes(env, bytes) {
  const secret = (env && (env.BACKUP_ENCRYPTION_KEY || env.JWT_SECRET)) || '';
  if (!secret) throw new Error('缺少 BACKUP_ENCRYPTION_KEY / JWT_SECRET，拒绝生成明文异地备份');
  const material = new TextEncoder().encode(`DuckImg backup v1\0${secret}`);
  const keyBytes = await crypto.subtle.digest('SHA-256', material);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(BACKUP_MAGIC.length + iv.length + encrypted.length);
  out.set(BACKUP_MAGIC, 0);
  out.set(iv, BACKUP_MAGIC.length);
  out.set(encrypted, BACKUP_MAGIC.length + iv.length);
  return out;
}

/** 私有频道 -100xxx / 公开频道 @name → 消息链接（供后台「频道查看」）；算不出返回 null */
function channelMessageLink(chatId, messageId) {
  if (!chatId || !messageId) return null;
  const s = String(chatId);
  if (s.startsWith('-100')) return `https://t.me/c/${s.slice(4)}/${messageId}`;
  if (s.startsWith('@')) return `https://t.me/${s.slice(1)}/${messageId}`;
  return null;
}

/** 发送备份文档；成功返回 { fileId, messageId } */
async function tgSendDocument(env, filename, bytes, caption) {
  if (!env.TG_Bot_Token || !env.TG_Chat_ID) throw new Error('缺少 TG_Bot_Token / TG_Chat_ID');
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = new FormData();
      fd.append('chat_id', env.TG_Chat_ID);
      fd.append('caption', String(caption).slice(0, 1000));
      fd.append('document', new Blob([bytes], { type: 'application/octet-stream' }), filename);
      const res = await fetch(`https://api.telegram.org/bot${env.TG_Bot_Token}/sendDocument`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.ok && data.result) {
        return {
          fileId: (data.result.document && data.result.document.file_id) || null,
          messageId: data.result.message_id || null,
        };
      }
      throw new Error((data && data.description) || `sendDocument HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function tgSendMessage(env, text) {
  if (!env.TG_Bot_Token || !env.TG_Chat_ID) return;
  await fetch(`https://api.telegram.org/bot${env.TG_Bot_Token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_Chat_ID, text: String(text).slice(0, 4000) }),
  });
}

export async function getBackupHistory(env) {
  try {
    const arr = await kvGet(env, HISTORY_KEY, { type: 'json' });
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function recordBackup(env, entry) {
  try {
    const arr = await getBackupHistory(env);
    arr.unshift(entry);
    await kvPut(env, HISTORY_KEY, arr.slice(0, HISTORY_MAX));
  } catch (e) {
    console.warn('写入备份历史失败（忽略）:', e && e.message);
  }
}

/**
 * 执行一次备份：dump → (可选 gzip) → 发频道 → 记历史。
 * 无论成败都返回历史条目，不抛出；失败时向频道发告警文本。
 */
export async function runDbBackup(env, { trigger = 'auto' } = {}) {
  const at = Date.now();
  const dateTag = new Date(at).toISOString().slice(0, 10);
  const triggerText = trigger === 'manual' ? '手动' : '自动';
  try {
    const { sql, counts } = await buildBackupSql(env);
    let bytes = new TextEncoder().encode(sql);
    let fileName = `duckimg-backup-${dateTag}.sql`;
    let gz = false;
    if (bytes.byteLength > GZIP_THRESHOLD) {
      bytes = await gzipBytes(bytes);
      fileName += '.gz';
      gz = true;
    }
    bytes = await encryptBackupBytes(env, bytes);
    fileName += '.enc';
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const summary =
      Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([t, n]) => `${t} ${n}`)
        .join(' · ') || '空库';
    const caption =
      `🗄️ D1 ${triggerText}加密备份 ${dateTag}\n${summary}\n` +
      '恢复：先运行 node scripts/decrypt-backup.mjs <备份文件>，如为 .gz 再解压后回灌';
    const sent = await tgSendDocument(env, fileName, bytes, caption);

    const entry = {
      at,
      ok: true,
      trigger,
      fileName,
      bytes: bytes.byteLength,
      gz,
      encrypted: true,
      total,
      counts,
      tgFileId: sent.fileId,
      tgMessageId: sent.messageId,
      tgLink: channelMessageLink(env.TG_Chat_ID, sent.messageId),
    };
    await recordBackup(env, entry);
    try { await kvPut(env, LAST_AT_KEY, String(at)); } catch { /* 不影响主流程 */ }
    console.log(`数据库备份完成：${fileName}（${bytes.byteLength} 字节）`);
    return entry;
  } catch (e) {
    const msg = (e && e.message) || String(e);
    console.error('数据库备份失败:', msg);
    const entry = { at, ok: false, trigger, error: msg };
    await recordBackup(env, entry);
    try {
      await tgSendMessage(env, `⚠️ DuckImg 数据库${triggerText}备份失败（${dateTag}）：${msg}`);
    } catch { /* 告警也失败就只留日志 */ }
    return entry;
  }
}

/**
 * cron 每日入口：按后台设置的频率决定本次是否真正备份。
 * 返回历史条目（执行了）或 null（未到期 / 已关闭）。
 */
export async function maybeRunScheduledBackup(env) {
  let freq = 'weekly';
  try {
    const s = await getSettings(env);
    freq = (s.backup && s.backup.frequency) || 'weekly';
  } catch { /* 读设置失败按默认每周 */ }
  if (freq === 'off') return null;
  const period = BACKUP_PERIODS[freq] || BACKUP_PERIODS.weekly;
  let lastAt = 0;
  try { lastAt = Number(await kvGet(env, LAST_AT_KEY)) || 0; } catch { /* 当作从未备份 */ }
  if (lastAt && Date.now() - lastAt < period - DUE_SLACK_MS) return null;
  return runDbBackup(env, { trigger: 'auto' });
}
