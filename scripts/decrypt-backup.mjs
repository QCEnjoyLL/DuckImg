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

const iv = data.subarray(8, 20);
const ciphertext = data.subarray(20);
const keyBytes = createHash('sha256').update(`DuckImg backup v1\0${secret}`).digest();
const key = await webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);

let plaintext;
try {
  plaintext = new Uint8Array(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext));
} catch {
  console.error('解密失败：密钥不正确或文件已损坏');
  process.exit(1);
}

const output = explicitOutput || (input.endsWith('.enc') ? input.slice(0, -4) : `${basename(input)}.decrypted`);
await writeFile(output, plaintext);
console.log(`已解密到 ${output}`);
