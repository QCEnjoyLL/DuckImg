import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const migrations = await readD1Migrations(path.join(projectDir, 'migrations'));

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
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.js'],
  },
});
