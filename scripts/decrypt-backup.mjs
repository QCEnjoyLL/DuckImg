import { createHash, webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const [input, explicitOutput] = process.argv.slice(2);
if (!input) {
  console.error('用法：node scripts/decrypt-backup.mjs <backup.sql[.gz].enc> [输出文件]');
  process.exit(1);
}

const secret = process.env.BACKUP_ENCRYPTION_KEY || process.env.JWT_SECRET;
if (!secret) {
  console.error('请通过环境变量 BACKUP_ENCRYPTION_KEY（或旧备份使用的 JWT_SECRET）提供解密密钥');
  process.exit(1);
}

const data = new Uint8Array(await readFile(input));
const magic = Buffer.from(data.subarray(0, 8)).toString('utf8');
if (magic !== 'DUCKIMG1' || data.length < 8 + 12 + 16) {
  console.error('不是有效的 DuckImg 加密备份');
  process.exit(1);
}

// 文件布局：MAGIC(8) | [':' + keyid(12 hex)]? | IV(12) | ciphertext
// 带 keyid 的文件由 BACKUP_ENCRYPTION_KEY 加密（tag='k1'）；
// 不带 keyid 的是旧格式（或回退到 JWT_SECRET 加密），派生式里 tag 为空。
let offset = 8;
let tag = '';
let keyId = '';
if (data[8] === 0x3a /* ':' */) {
  keyId = Buffer.from(data.subarray(9, 21)).toString('utf8');
  tag = 'k1';
  offset = 21;
}

const iv = data.subarray(offset, offset + 12);
const ciphertext = data.subarray(offset + 12);

async function fingerprint(secret) {
  const h = new Uint8Array(
    await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('DuckImg backup keyid v1\0' + secret)),
  );
  return Buffer.from(h.subarray(0, 6)).toString('hex');
}

if (keyId) {
  const actual = await fingerprint(secret);
  if (actual !== keyId) {
    console.error(
      `密钥指纹不匹配：备份由 ${keyId} 加密，当前密钥是 ${actual}。\n` +
      '请改用当初生成该备份时所用的 BACKUP_ENCRYPTION_KEY。',
    );
    process.exit(1);
  }
}

// 派生式必须与 src/functions/utils/backup.js 完全一致：
//   带 keyid → `v1\0k1\0<key>`；不带 keyid → `v1\0<key>`（与历史格式逐字节一致，
//   保证改动前生成的备份仍能解密）。
// 这里对无 keyid 的文件额外兜底尝试 `v1\0\0<key>`，以防有备份是在
// 「新增占位符」那一版过渡代码下生成的。
const derivations = keyId
  ? [`DuckImg backup v1\0${tag}\0${secret}`]
  : [`DuckImg backup v1\0${secret}`, `DuckImg backup v1\0\0${secret}`];

let plaintext;
for (const d of derivations) {
  const keyBytes = createHash('sha256').update(d).digest();
  const key = await webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  try {
    plaintext = new Uint8Array(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext));
    break;
  } catch {
    plaintext = undefined;
  }
}

if (!plaintext) {
  console.error('解密失败：密钥不正确或文件已损坏');
  process.exit(1);
}

const output = explicitOutput || (input.endsWith('.enc') ? input.slice(0, -4) : `${basename(input)}.decrypted`);
await writeFile(output, plaintext);
console.log(`已解密到 ${output}`);
