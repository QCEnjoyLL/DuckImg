#!/usr/bin/env node
/**
 * 一键验证备份可用性。
 *
 * 为什么需要它：D1 备份是用户元数据的**唯一副本**（图片在 Telegram），而恢复路径
 * 此前完全没有测试。等真正需要恢复时才发现解不开，就来不及了。
 *
 * 用法：
 *   npm run backup:verify                  # 验证最新一份（会提示输入密钥，或读环境变量）
 *   npm run backup:verify -- --all         # 验证历史里全部备份
 *   npm run backup:verify -- --no-download # 只检查有没有备份、有多新（不需要密钥）
 *   npm run backup:verify -- --file x.enc  # 验证本地文件，不联网取历史
 *   npm run backup:verify -- --selftest    # 离线自测：构造已知备份走完整流程（不需要任何凭据）
 *
 * 凭据来源（按优先级）：
 *   TG_Bot_Token / TG_Chat_ID  ← 环境变量 → .dev.vars
 *   BACKUP_ENCRYPTION_KEY      ← 环境变量（推荐，避免密钥进入 shell 历史）→ 静默交互输入
 */
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import {
  decryptBackup, maybeGunzip, parseBackupHeader, verifyBackupSql,
  REQUIRED_TABLES, keyFingerprint,
} from './lib/backup-verify.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};

const OPT = {
  all: has('--all'),
  noDownload: has('--no-download'),
  file: valueOf('--file'),
  selftest: has('--selftest'),
  keep: has('--keep'),
};

const TG_API = (process.env.TG_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const MAX_BOT_DOWNLOAD = 20 * 1024 * 1024; // 免费版 Bot API getFile 上限

let pass = 0, fail = 0, warn = 0;
const ok = (m, d = '') => { pass++; console.log(`  PASS  ${m}${d ? '  → ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  FAIL  ${m}${d ? '  → ' + d : ''}`); };
const wrinkled = (m, d = '') => { warn++; console.log(`  WARN  ${m}${d ? '  → ' + d : ''}`); };

/** 从 .dev.vars 读取（仅本地开发用；不打印值） */
function readDevVars(name) {
  const p = join(process.cwd(), '.dev.vars');
  if (!existsSync(p)) return '';
  try {
    const txt = readFileSync(p, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!m || m[1] !== name) continue;
      return m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* ignore */ }
  return '';
}

/** 静默读取一行（不回显），用于密钥/令牌 */
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      if (['\n', '\r', '\u0004'].includes(String(char))) return;
      // 把已输入的字符擦掉，避免密钥留在屏幕上
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      process.stdout.write(question + '*'.repeat(rl.line.length));
    };
    process.stdin.on('data', onData);
    rl.question(question, (answer) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function secretFrom(name, { prompt, allowPrompt = true } = {}) {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  const fromFile = readDevVars(name);
  if (fromFile) return fromFile;
  if (allowPrompt && process.stdin.isTTY) {
    const v = await promptHidden(prompt || `${name}（输入时不回显）：`);
    if (v) return v;
  }
  return '';
}

/** 直接调用 wrangler 读 D1 里的备份历史（本机开发凭据） */
function loadHistoryViaWrangler() {
  // 直接用 node 执行 wrangler 的 JS 入口，**绕开 shell 与 .cmd**：
  // Windows 上 .cmd 只能经 cmd.exe 跑，而 cmd 的参数引号处理极易出错
  // （实测会把 SQL 拆成 "Unknown arguments: value, FROM, kv_store..."）。
  const entry = resolve(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(entry)) return { ok: false, reason: '找不到本地 wrangler（先 npm ci）' };

  const sql = 'SELECT value FROM kv_store WHERE key="backup:history" LIMIT 1;';

  try {
    const out = execFileSync(process.execPath, [
      entry, 'd1', 'execute', 'duckimg', '--remote', '--command', sql, '--json',
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    });
    const parsed = JSON.parse(out);
    const raw = parsed?.[0]?.results?.[0]?.value;
    if (!raw) return { ok: false, reason: 'backup:history 为空（还没有任何备份记录）' };
    const arr = JSON.parse(raw);
    return { ok: true, history: Array.isArray(arr) ? arr : [] };
  } catch (e) {
    // wrangler 的真实报错走 stdout（stderr 往往只有日志路径），两边都要看
    const combined = `${e.stdout || ''}\n${e.stderr || ''}`
      .replace(/\u001b\[[0-9;]*m/g, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/Logs were written to/.test(l));
    const msg = combined.slice(-1)[0] || `退出码 ${e.status}`;
    return { ok: false, reason: `读取 D1 失败：${msg}` };
  }
}

/** 通过 Telegram Bot API 下载备份 */
async function downloadFromTelegram(fileId, token) {
  const metaRes = await fetch(`${TG_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const meta = await metaRes.json().catch(() => null);
  if (!meta || meta.ok !== true) {
    const desc = (meta && meta.description) || `HTTP ${metaRes.status}`;
    if (/too big/i.test(desc)) {
      return {
        ok: false,
        reason: '文件超过 Bot API 的 20MB 下载上限。请到存储频道手动下载，'
          + '然后本地验证：npm run backup:verify -- --file <下载的文件>',
      };
    }
    return { ok: false, reason: `getFile 失败：${desc}` };
  }
  const path = meta.result.file_path;
  const size = Number(meta.result.file_size || 0);
  if (size > MAX_BOT_DOWNLOAD) {
    return {
      ok: false,
      reason: `文件 ${(size / 1024 / 1024).toFixed(1)}MB 超过 Bot API 20MB 上限，`
        + '请到存储频道手动下载后用 --file 验证',
    };
  }
  const binRes = await fetch(`${TG_API}/file/bot${token}/${path}`);
  if (!binRes.ok) return { ok: false, reason: `下载失败 HTTP ${binRes.status}` };
  return { ok: true, bytes: new Uint8Array(await binRes.arrayBuffer()) };
}

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtAge(ts) {
  const days = (Date.now() - ts) / 86400000;
  if (days < 1) return `${(days * 24).toFixed(1)} 小时前`;
  return `${days.toFixed(1)} 天前`;
}

/** 校验一份备份字节流 */
async function verifyOne(label, bytes, secret, expectedCounts) {
  console.log(`\n── ${label} ──`);
  console.log(`  文件大小：${fmtSize(bytes.length)}`);

  const header = parseBackupHeader(bytes);
  if (!header.ok) { bad('文件头', header.reason); return false; }
  ok('文件头', header.hasKeyId ? `新格式（密钥指纹 ${header.keyId}）` : '旧格式（无密钥指纹）');

  const dec = await decryptBackup(bytes, secret);
  if (!dec.ok) {
    bad('解密', dec.reason);
    if (dec.fingerprintMismatch) {
      console.log('        ↳ 这不是数据损坏：你手上的密钥与生成该备份的密钥不是同一把。');
    }
    return false;
  }
  ok('解密', dec.usedDerivation === 0 ? '成功' : '成功（用了兼容派生式）');

  const plain = await maybeGunzip(dec.plaintext);
  if (plain !== dec.plaintext) ok('解压 gzip', `→ ${fmtSize(plain.length)}`);
  else ok('无需解压', '备份未压缩');

  const sql = new TextDecoder().decode(plain);
  const v = verifyBackupSql(sql, expectedCounts);
  for (const c of v.checks) (c.ok ? ok : bad)(`内容：${c.name}`, c.detail);
  return v.ok;
}

/** 离线自测：构造三种格式的备份，验证校验链路真的有效 */
async function selftest() {
  console.log('离线自测：构造已知备份，确认校验链路有效（不需要任何凭据）\n');
  const { webcrypto } = await import('node:crypto');
  const enc = new TextEncoder();
  const SECRET = 'selftest-key';
  const MAGIC = enc.encode('DUCKIMG1');

  async function build(derivStr, keyId) {
    const kb = await webcrypto.subtle.digest('SHA-256', enc.encode(derivStr));
    const key = await webcrypto.subtle.importKey('raw', kb, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const sql = REQUIRED_TABLES.map((t) => `CREATE TABLE IF NOT EXISTS "${t}" (a);`).join('\n')
      + `\nALTER TABLE users ADD COLUMN token_version INTEGER;\n`
      + `INSERT INTO users VALUES ('u1','x@example.com');\n`
      + `INSERT INTO kv_store VALUES ('config:settings','{}');\n`;
    const ct = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(sql)));
    const kid = keyId ? enc.encode(':' + keyId) : new Uint8Array(0);
    const out = new Uint8Array(8 + kid.length + 12 + ct.length);
    out.set(MAGIC, 0); out.set(kid, 8); out.set(iv, 8 + kid.length); out.set(ct, 8 + kid.length + 12);
    return out;
  }

  // 1) 旧格式必须能解 + 内容校验通过
  const legacy = await build(`DuckImg backup v1\0${SECRET}`, null);
  let r = await decryptBackup(legacy, SECRET);
  (r.ok ? ok : bad)('旧格式可解密');
  if (r.ok) {
    const v = verifyBackupSql(new TextDecoder().decode(r.plaintext));
    (v.ok ? ok : bad)('旧格式内容校验通过');
  }

  // 2) 新格式（带指纹）必须能解
  const kid = await keyFingerprint(SECRET);
  const fresh = await build(`DuckImg backup v1\0k1\0${SECRET}`, kid);
  r = await decryptBackup(fresh, SECRET);
  (r.ok ? ok : bad)('新格式可解密');

  // 3) 错密钥必须被识别为「指纹不匹配」而不是笼统失败
  r = await decryptBackup(fresh, 'wrong-key');
  (!r.ok && r.fingerprintMismatch ? ok : bad)('错密钥 → 报指纹不匹配');

  // 4) 内容被破坏时校验必须能抓到（否则这个校验工具形同虚设）
  const truncated = legacy.slice(0, legacy.length - 5);
  r = await decryptBackup(truncated, SECRET);
  (!r.ok ? ok : bad)('截断的文件被拒绝');

  const missingTable = await (async () => {
    const kb = await webcrypto.subtle.digest('SHA-256', enc.encode(`DuckImg backup v1\0${SECRET}`));
    const key = await webcrypto.subtle.importKey('raw', kb, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, enc.encode('CREATE TABLE "users" (a);'),
    ));
    const out = new Uint8Array(8 + 12 + ct.length);
    out.set(MAGIC, 0); out.set(iv, 8); out.set(ct, 20);
    return out;
  })();
  r = await decryptBackup(missingTable, SECRET);
  const vBad = r.ok ? verifyBackupSql(new TextDecoder().decode(r.plaintext)) : { ok: false };
  (r.ok && !vBad.ok ? ok : bad)('缺表的备份被内容校验抓到（证明校验不是永远通过）');

  return fail === 0;
}

/** 逐个尝试候选密钥（历史备份可能用 JWT_SECRET 加密） */
async function verifyWithAnyKey(label, bytes, keys, expectedCounts) {
  let lastFail = null;
  for (const { name, secret } of keys) {
    if (!secret) continue;
    const header = parseBackupHeader(bytes);
    // 带指纹的文件可以先用指纹筛掉明显不对的密钥（避免无谓尝试）
    if (header.ok && header.hasKeyId) {
      const fp = await keyFingerprint(secret);
      if (fp !== header.keyId) {
        lastFail = `用 ${name} 试解：指纹不匹配`;
        continue;
      }
    }
    const before = { pass, fail, warn };
    const good = await verifyOneFor(`${label} [密钥来源: ${name}]`, bytes, secret, expectedCounts);
    if (good) return true;
    lastFail = `用 ${name} 试解失败`;
    // 回滚本次的计数，避免为每个候选密钥都记一遍失败
    pass = before.pass; fail = before.fail; warn = before.warn;
  }
  console.log(`\n── ${label} ──`);
  bad('解密', lastFail || '没有可用的候选密钥');
  return false;
}

/** verifyOne 的可计数版本（供多密钥尝试复用） */
async function verifyOneFor(label, bytes, secret, expectedCounts) {
  const before = fail;
  await verifyOne(label, bytes, secret, expectedCounts);
  return fail === before;
}

/**
 * 收集候选解密密钥。
 * 优先 BACKUP_ENCRYPTION_KEY；旧备份（设置该密钥之前生成的）可能用的是 JWT_SECRET，
 * 所以两者都收，逐个尝试。
 */
async function collectKeys() {
  const keys = [];
  const backupKey = await secretFrom('BACKUP_ENCRYPTION_KEY', {
    prompt: '备份密钥 BACKUP_ENCRYPTION_KEY（输入不回显）：',
  });
  if (backupKey) keys.push({ name: 'BACKUP_ENCRYPTION_KEY', secret: backupKey });

  const jwtSecret = await secretFrom('JWT_SECRET', { prompt: '', allowPrompt: false });
  if (jwtSecret) keys.push({ name: 'JWT_SECRET（旧备份）', secret: jwtSecret });

  return keys;
}

async function main() {
  console.log('DuckImg 备份可用性验证\n');

  if (OPT.selftest) {
    const good = await selftest();
    console.log(`\n自测结果：${pass} passed, ${fail} failed`);
    process.exit(good ? 0 : 1);
  }

  // 本地文件模式：不联网取历史
  if (OPT.file) {
    if (!existsSync(OPT.file)) {
      console.error(`找不到文件：${OPT.file}`);
      process.exit(1);
    }
    const keys = await collectKeys();
    if (!keys.length) {
      console.error('缺少解密密钥 —— 请设置 BACKUP_ENCRYPTION_KEY（或旧备份适用的 JWT_SECRET）。');
      process.exit(1);
    }
    const bytes = new Uint8Array(await readFile(OPT.file));
    const good = await verifyWithAnyKey(basename(OPT.file), bytes, keys, null);
    console.log(`\n结果：${pass} passed, ${fail} failed${warn ? `, ${warn} warn` : ''}`);
    process.exit(good ? 0 : 1);
  }

  // 取备份历史
  console.log('读取备份历史…');
  const h = loadHistoryViaWrangler();
  if (!h.ok) {
    console.error(`✗ ${h.reason}`);
    console.error('  提示：也可以在管理后台「数据备份」页查看历史。');
    process.exit(1);
  }
  if (!h.history.length) {
    console.error('✗ 备份历史为空 —— 说明**从未成功备份过**。请到管理后台「数据备份」立即备份一次。');
    process.exit(1);
  }

  const latest = h.history[0];
  console.log(`历史共 ${h.history.length} 条，最新一条：`);
  console.log(`  文件      ${latest.fileName}`);
  console.log(`  时间      ${new Date(latest.at).toLocaleString()}（${fmtAge(latest.at)}）`);
  console.log(`  大小      ${fmtSize(latest.bytes || 0)}${latest.gz ? ' (gzip)' : ''}`);

  const ageDays = (Date.now() - latest.at) / 86400000;
  if (latest.ok !== true) bad('最新一次备份成功', `记录了失败：${latest.error || '未知原因'}`);
  else ok('最新一次备份成功');
  if (ageDays > 35) wrinkled('备份新鲜度', `已 ${ageDays.toFixed(0)} 天未成功备份，建议检查定时任务`);
  else ok('备份新鲜度', fmtAge(latest.at));

  if (OPT.noDownload) {
    console.log(`\n（--no-download：跳过下载与解密校验）`);
    console.log(`\n结果：${pass} passed, ${fail} failed${warn ? `, ${warn} warn` : ''}`);
    process.exit(fail ? 1 : 0);
  }

  // 先验证「能取到文件」——这一步不需要备份密钥，因此令牌失效/文件不可达
  // 这类问题能被独立发现，不会被"等待输入密钥"掩盖。
  const token = await secretFrom('TG_Bot_Token', { prompt: 'TG_Bot_Token（输入不回显）：' });
  if (!token) {
    console.error('\n缺少 TG_Bot_Token，无法下载备份。');
    console.error('可设置环境变量，或到存储频道手动下载后用：npm run backup:verify -- --file <文件>');
    process.exit(1);
  }

  const targets = OPT.all ? h.history : [latest];
  const downloaded = [];
  for (const entry of targets) {
    if (!entry.tgFileId) { bad(`${entry.fileName}：历史里没有 tgFileId，无法下载`); continue; }
    const dl = await downloadFromTelegram(entry.tgFileId, token);
    if (!dl.ok) { bad(`${entry.fileName} 下载`, dl.reason); continue; }
    ok(`${entry.fileName} 可从 Telegram 取回`, fmtSize(dl.bytes.length));
    downloaded.push({ entry, bytes: dl.bytes });
  }

  if (!downloaded.length) {
    console.log(`\n结果：${pass} passed, ${fail} failed${warn ? `, ${warn} warn` : ''}`);
    console.log('\n❌ 没有任何备份能被取回，无法验证可恢复性。');
    process.exit(1);
  }

  const keys = await collectKeys();
  if (!keys.length) {
    console.log(`\n结果：${pass} passed, ${fail} failed${warn ? `, ${warn} warn` : ''}`);
    console.log('\n⚠ 未提供备份密钥，只验证到「能下载」，未验证「能否解密恢复」。');
    console.log('  要完整验证，请设置 BACKUP_ENCRYPTION_KEY 后重新运行。');
    process.exit(0);
  }

  let allGood = true;
  for (const { entry, bytes } of downloaded) {
    const good = await verifyWithAnyKey(`${entry.fileName}（${fmtAge(entry.at)}）`, bytes, keys, entry.counts);
    allGood = allGood && good;
  }

  console.log(`\n结果：${pass} passed, ${fail} failed${warn ? `, ${warn} warn` : ''}`);
  if (allGood) {
    console.log('\n✅ 备份可用：能下载、能用当前密钥解密、内容结构完整。');
  } else {
    console.log('\n❌ 备份存在不可恢复的风险，请按上面 FAIL 项处理。');
  }
  process.exit(allGood ? 0 : 1);
}

main().catch((e) => {
  console.error('意外错误：', e && e.message ? e.message : e);
  process.exit(1);
});
