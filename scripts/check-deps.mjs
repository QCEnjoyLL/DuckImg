/**
 * 部署前置守卫：确认 node_modules 与 package-lock.json 一致。
 *
 * 为什么需要它：本项目实际出过一次事故 —— 本地 node_modules 里装的是 hono 3.x，
 * 而 package.json / lockfile 要求 4.x，`src/index.js` 依赖的 `hono/body-limit`
 * 在 hono 3 不存在，**本机根本构建不出这个 worker**，却长期无人察觉。
 *
 * 检查项（全部离线、确定性）：
 *   1. lockfile 记录 vs 磁盘实际安装的版本（仅对「本平台应该装」的包）
 *   2. package.json 的顶层依赖是否缺失
 *   3. 关键子路径导出能否解析（hono/body-limit 就是死在这上面）
 *
 * 用法：
 *   node scripts/check-deps.mjs              # 正常检查
 *   node scripts/check-deps.mjs --selftest   # 自测：确认守卫真的能抓到版本漂移
 */

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const SELFTEST = process.argv.includes('--selftest');
const root = process.cwd();
const require = createRequire(import.meta.url);

const problems = [];
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * 这个包在当前平台是否「本来就应该安装」。
 * lockfile 会为所有平台记录 optional 二进制包（@esbuild/darwin-x64 等），
 * 它们在本平台缺失是**正常**的，不能报成问题。
 */
function shouldBeInstalled(meta) {
  if (!meta.optional) return true; // 非 optional 缺失一定是问题
  const platform = process.platform;
  const arch = process.arch;
  if (Array.isArray(meta.os) && meta.os.length && !meta.os.includes(platform)) return false;
  if (Array.isArray(meta.cpu) && meta.cpu.length && !meta.cpu.includes(arch)) return false;
  // optional 且没有平台限制（如 tslib）：可能因依赖树裁剪而缺失，容忍
  return meta.os || meta.cpu ? true : false;
}

const lockPath = path.join(root, 'package-lock.json');
if (!existsSync(lockPath)) {
  console.error('✗ 找不到 package-lock.json —— 无法校验依赖一致性');
  process.exit(1);
}

const lock = readJson(lockPath);
const pkg = readJson(path.join(root, 'package.json'));
const locked = lock.packages || {};

// 自测模式：故意把某个已安装包的期望版本改错，确认守卫会失败
const selfTestTarget = 'hono';

// 1) + 2) 逐包比对
for (const [key, meta] of Object.entries(locked)) {
  if (!key.startsWith('node_modules/')) continue;
  if (meta.link) continue;
  const name = key.slice('node_modules/'.length);
  const expected = meta.version;
  if (!expected) continue;

  const installedPkg = path.join(root, key, 'package.json');
  const installed = existsSync(installedPkg);

  if (!installed) {
    if (shouldBeInstalled(meta)) {
      problems.push(`缺少依赖 ${name}@${expected}（lockfile 要求，且本平台应安装）`);
    }
    continue;
  }

  let actual;
  try {
    actual = readJson(installedPkg).version;
  } catch {
    problems.push(`依赖 ${name} 的 package.json 无法解析`);
    continue;
  }

  const expectForCompare = (SELFTEST && name === selfTestTarget) ? '0.0.0-selftest' : expected;
  if (actual !== expectForCompare) {
    problems.push(`${name} 版本不一致：lockfile 要求 ${expectForCompare}，实际安装 ${actual}`);
  }
}

// 3) 关键子路径导出必须能解析（当初真正炸掉的地方）
for (const spec of ['hono/body-limit']) {
  try {
    require.resolve(spec);
  } catch {
    problems.push(`无法解析 "${spec}" —— 打包会直接失败（检查 hono 大版本是否为 4.x）`);
  }
}

// 顶层依赖方向性检查
const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
for (const name of Object.keys(declared)) {
  if (!existsSync(path.join(root, 'node_modules', name, 'package.json'))) {
    problems.push(`package.json 声明了 ${name}，但 node_modules 里没有安装`);
  }
}

if (SELFTEST) {
  // 自测：期望「恰好因 hono 版本不一致而失败」，以证明守卫不是永远返回成功
  const caughtVersionDrift = problems.some((p) => p.startsWith(`${selfTestTarget} 版本不一致`));
  if (caughtVersionDrift) {
    console.log(`✓ 自测通过：守卫成功抓到了 ${selfTestTarget} 的版本漂移（这正是当初那次事故的形态）`);
    process.exit(0);
  }
  console.error('✗ 自测失败：守卫没能抓到人为制造的版本漂移，说明这个检查形同虚设');
  process.exit(1);
}

if (problems.length) {
  console.error('✗ 依赖一致性检查未通过：\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n请先执行：npm ci\n（不要用 npm install —— 它可能改动 lockfile 或保留漂移的版本）');
  process.exit(1);
}

console.log('✓ 依赖一致性检查通过（node_modules 与 package-lock.json 一致，关键子路径可解析）');
