import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const roots = ['src', 'public/js', 'scripts', 'test'];
const files = ['vitest.config.mjs'];

async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const item = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(item);
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(item);
  }
}

for (const root of roots) await collect(root);
files.sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed: ${files.length} JavaScript files`);
