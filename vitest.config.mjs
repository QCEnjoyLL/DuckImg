import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const migrations = await readD1Migrations(path.join(projectDir, 'migrations'));

// 测试运行在 workerd 里，看不到真实文件系统（读到的是 /bundle/...），
// 所以把需要断言的配置内容在这里（Node 环境）读好，作为 binding 注入。
const wranglerTomlText = readFileSync(path.join(projectDir, 'wrangler.toml'), 'utf8');
const cronsMatch = wranglerTomlText.match(/^\s*crons\s*=\s*\[([^\]]*)\]/m);
const CFG_CRONS = cronsMatch
  ? cronsMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  : [];
const indexJsText = readFileSync(path.join(projectDir, 'src', 'index.js'), 'utf8');
const CFG_BACKUP_CRON = (indexJsText.match(/const\s+BACKUP_CRON\s*=\s*'([^']+)'/) || [])[1] || '';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          ADMIN_USERNAME: 'testadmin',
          ADMIN_BOOTSTRAP_TOKEN: 'test-admin-bootstrap-token',
          JWT_SECRET: 'test-jwt-secret-not-for-production',
          CFG_CRONS,
          CFG_BACKUP_CRON,
          CFG_WRANGLER_TOML: wranglerTomlText,
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.js'],
  },
});
