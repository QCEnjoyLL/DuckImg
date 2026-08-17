import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createVerificationCode,
  generateToken,
  hashPassword,
  verifyCodeMatches,
} from '../src/functions/utils/auth.js';
import {
  dbGetUploadCount,
  dbReserveUploadSlot,
  kvPut,
} from '../src/functions/utils/db.js';
import { buildBackupSql } from '../src/functions/utils/backup.js';
import { getSettings, resetSettingsCacheForTests, saveSettings } from '../src/functions/utils/settings.js';
import { hasMatchingImageSignature } from '../src/functions/upload.js';
import { deleteUserRecord, getUserByName, saveUser } from '../src/functions/utils/users.js';

const jsonHeaders = { 'content-type': 'application/json' };

function request(path, init = {}) {
  return exports.default.fetch(`https://duckimg.test${path}`, init);
}

async function createTestUser(overrides = {}) {
  const now = Date.now();
  const user = {
    id: crypto.randomUUID(),
    username: `user_${crypto.randomUUID().slice(0, 8)}`,
    email: `${crypto.randomUUID()}@example.com`,
    password: await hashPassword('correct horse battery staple'),
    status: 'active',
    emailVerified: true,
    uploadLimit: null,
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await saveUser(env, user);
  return user;
}

describe('authentication hardening', () => {
  it('rejects public creation of the configured admin without the bootstrap token', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        username: 'testadmin',
        email: 'admin@example.com',
        password: 'a sufficiently long password',
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: '管理员账号不能通过公共注册创建' });
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
    expect(Number(row.count)).toBe(0);
  });

  it('invalidates an existing JWT after token_version changes', async () => {
    const user = await createTestUser();
    const token = await generateToken({
      id: user.id,
      username: user.username,
      role: 'user',
      tv: user.tokenVersion,
    }, env);
    const headers = { Authorization: `Bearer ${token}` };

    expect((await request('/api/auth/user', { headers })).status).toBe(200);

    user.tokenVersion += 1;
    await saveUser(env, user);

    const revoked = await request('/api/auth/user', { headers });
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({ error: '登录已失效，请重新登录' });
  });

  it('does not accept a deleted account token for a same-name replacement', async () => {
    const original = await createTestUser({ username: 'reused_name' });
    const token = await generateToken({
      id: original.id,
      username: original.username,
      role: 'user',
      tv: 0,
    }, env);
    await deleteUserRecord(env, original);
    await createTestUser({ username: original.username });

    const response = await request('/api/auth/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: '账户不存在或登录已失效' });
  });

  it('cannot delete the administrator through a case-variant username', async () => {
    const admin = await createTestUser({ username: 'testadmin' });
    const token = await generateToken({
      id: admin.id,
      username: admin.username,
      role: 'admin',
      tv: 0,
    }, env);

    const response = await request('/api/admin/users/TESTADMIN', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '不能删除管理员账号' });
    expect(await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(admin.id).first()).not.toBeNull();
  });

  it('rejects an XSS-shaped email before registration', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        username: 'normal_user',
        email: 'victim@example.com\"><img src=x onerror=alert(1)>',
        password: 'a sufficiently long password',
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: '邮箱格式不正确' });
  });
});

describe('deployment version metadata', () => {
  it('only exposes the current deployment version to an administrator', async () => {
    expect((await request('/api/admin/version')).status).toBe(401);

    const admin = await getUserByName(env, 'testadmin')
      || await createTestUser({ username: 'testadmin' });
    const token = await generateToken({
      id: admin.id,
      username: admin.username,
      role: 'admin',
      tv: admin.tokenVersion,
    }, env);
    const response = await request('/api/admin/version', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const { version } = await response.json();
    expect(version.id).toEqual(expect.any(String));
    expect(version.shortId).toBe(version.id === 'local' ? 'local' : version.id.slice(0, 8));
    expect(version.deployedAt === null || typeof version.deployedAt === 'string').toBe(true);
  });
});

describe('one-time verification codes', () => {
  it('succeeds exactly once', async () => {
    const email = `${crypto.randomUUID()}@example.com`;
    const code = await createVerificationCode(env, email, 'verify');

    expect(await verifyCodeMatches(env, email, code, 'verify')).toBe(true);
    expect(await verifyCodeMatches(env, email, code, 'verify')).toBe(false);
  });

  it('locks the code after the maximum number of failed attempts', async () => {
    const email = `${crypto.randomUUID()}@example.com`;
    const code = await createVerificationCode(env, email, 'verify');
    const wrongCode = code === '000000' ? '000001' : '000000';

    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect(await verifyCodeMatches(env, email, wrongCode, 'verify')).toBe(false);
    }
    expect(await verifyCodeMatches(env, email, code, 'verify')).toBe(false);

    const row = await env.DB.prepare(
      'SELECT attempts, max_attempts FROM verification_codes WHERE code_key = ?',
    ).bind(`verify:${email}`).first();
    expect(Number(row.attempts)).toBe(Number(row.max_attempts));
  });
});

describe('quota and request limits', () => {
  it('allows exactly N concurrent quota reservations', async () => {
    const userId = crypto.randomUUID();
    const day = '2099-01-01';
    const results = await Promise.all(
      Array.from({ length: 24 }, () => dbReserveUploadSlot(env, userId, day, 5)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(await dbGetUploadCount(env, userId, day)).toBe(5);
  });

  it('returns 413 before authentication for oversized upload requests', async () => {
    const response = await request('/upload', {
      method: 'POST',
      headers: { 'content-length': String(50 * 1024 * 1024 + 1) },
      body: 'x',
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: '单次上传请求不能超过 50MB' });
  });

  it('checks image content signatures instead of trusting the file name and MIME', async () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const validPng = new File([pngHeader], 'valid.png', { type: 'image/png' });
    const fakePng = new File(['<script>alert(1)</script>'], 'fake.png', { type: 'image/png' });

    expect(await hasMatchingImageSignature(validPng, 'png')).toBe(true);
    expect(await hasMatchingImageSignature(fakePng, 'png')).toBe(false);
    expect(await hasMatchingImageSignature(validPng, 'jpg')).toBe(false);
  });
});

describe('administrator-managed SMTP credentials', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM kv_store WHERE key = ?').bind('config:settings').run();
    resetSettingsCacheForTests();
  });

  it('encrypts the SMTP password in D1 and never returns it from the admin API', async () => {
    const password = `smtp-${crypto.randomUUID()}`;
    await saveSettings(env, {
      email: {
        provider: 'smtp',
        smtp: {
          host: 'smtp.example.com',
          fromAddress: 'noreply@example.com',
          password,
        },
      },
    });

    const row = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?').bind('config:settings').first();
    expect(row.value).not.toContain(password);
    const persisted = JSON.parse(row.value);
    expect(persisted.email.smtp.password).toBe('');
    expect(persisted.email.smtp.passwordEncrypted).toMatch(/^enc:v1:/);
    expect((await getSettings(env)).email.smtp.password).toBe(password);
    const backup = await buildBackupSql(env);
    expect(backup.sql).not.toContain(password);
    expect(backup.sql).not.toContain(persisted.email.smtp.passwordEncrypted);

    const admin = await getUserByName(env, 'testadmin')
      || await createTestUser({ username: 'testadmin' });
    const token = await generateToken({
      id: admin.id,
      username: admin.username,
      role: 'admin',
      tv: admin.tokenVersion,
    }, env);
    const response = await request('/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain(password);
    expect(body.settings.email.smtp).toMatchObject({ password: '', passwordSet: true, passwordSource: 'database' });
    expect(body.settings.email.smtp.passwordEncrypted).toBeUndefined();
  });

  it('decrypts an encrypted SMTP password after a cold start', async () => {
    const password = `cold-start-${crypto.randomUUID()}`;
    await saveSettings(env, { email: { smtp: { password } } });

    resetSettingsCacheForTests();

    const settings = await getSettings(env);
    expect(settings.email.smtp.password).toBe(password);
    expect(settings.email.smtp.passwordSource).toBe('database');
    expect(settings.email.smtp.passwordError).toBeUndefined();
  });

  it('clears the encrypted password without falling back to the legacy Secret', async () => {
    const secretEnv = {
      DB: env.DB,
      JWT_SECRET: 'smtp-clear-test-key',
      SMTP_PASSWORD: 'legacy-password-must-not-return',
    };
    await saveSettings(secretEnv, { email: { smtp: { password: 'database-password' } } });
    await saveSettings(secretEnv, { email: { smtp: { clearPassword: true } } });

    const row = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?').bind('config:settings').first();
    const persisted = JSON.parse(row.value);
    expect(persisted.email.smtp.passwordEncrypted).toBe('');
    expect(persisted.email.smtp.passwordUseSecret).toBe(false);

    resetSettingsCacheForTests();
    const settings = await getSettings(secretEnv);
    expect(settings.email.smtp.password).toBe('');
    expect(settings.email.smtp.passwordSource).toBe('none');
  });

  it('uses the legacy Secret until an admin saves a replacement in D1', async () => {
    const secretEnv = {
      DB: env.DB,
      JWT_SECRET: 'smtp-migration-test-key',
      SMTP_PASSWORD: 'legacy-secret-password',
    };

    expect((await getSettings(secretEnv)).email.smtp.password).toBe('legacy-secret-password');
    expect((await getSettings(secretEnv)).email.smtp.passwordSource).toBe('secret');

    await saveSettings(secretEnv, { email: { smtp: { password: 'new-database-password' } } });
    resetSettingsCacheForTests();
    const migrated = await getSettings(secretEnv);
    expect(migrated.email.smtp.password).toBe('new-database-password');
    expect(migrated.email.smtp.passwordSource).toBe('database');

    const row = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?').bind('config:settings').first();
    const persisted = JSON.parse(row.value);
    expect(persisted.email.smtp.passwordUseSecret).toBe(false);
    expect(row.value).not.toContain('new-database-password');
  });

  it('reports an unusable password when JWT_SECRET changes', async () => {
    const originalEnv = { DB: env.DB, JWT_SECRET: 'original-settings-key' };
    await saveSettings(originalEnv, { email: { smtp: { password: 'encrypted-password' } } });

    resetSettingsCacheForTests();
    const settings = await getSettings({ DB: env.DB, JWT_SECRET: 'different-settings-key' });
    expect(settings.email.smtp.password).toBe('');
    expect(settings.email.smtp.passwordSource).toBe('database');
    expect(settings.email.smtp.passwordError).toContain('无法解密');
  });

  it('validates admin settings and returns a useful 400 response', async () => {
    const admin = await getUserByName(env, 'testadmin')
      || await createTestUser({ username: 'testadmin' });
    const token = await generateToken({
      id: admin.id,
      username: admin.username,
      role: 'admin',
      tv: admin.tokenVersion,
    }, env);
    const headers = { ...jsonHeaders, Authorization: `Bearer ${token}` };

    const invalidPort = await request('/api/admin/settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ email: { smtp: { port: 70000 } } }),
    });
    expect(invalidPort.status).toBe(400);
    expect(await invalidPort.json()).toMatchObject({ error: 'SMTP 端口必须是 1–65535 的整数' });

    const headerInjection = await request('/api/admin/settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ email: { smtp: { fromName: 'DuckImg\r\nBcc: attacker@example.com' } } }),
    });
    expect(headerInjection.status).toBe(400);

    const fractionalLimit = await request('/api/admin/settings', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ dailyUploadLimit: 1.5 }),
    });
    expect(fractionalLimit.status).toBe(400);

    const regularUser = await createTestUser();
    const malformedUserLimit = await request(`/api/admin/users/${encodeURIComponent(regularUser.username)}/limit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ uploadLimit: '12items' }),
    });
    expect(malformedUserLimit.status).toBe(400);

    await expect(saveSettings(env, { nsfw: { method: 'DELETE' } })).rejects.toThrow('鉴黄请求方式无效');
    await expect(saveSettings(env, { email: { smtp: { encryption: 'auto' } } })).rejects.toThrow('SMTP 加密方式无效');
  });
});

describe('backup redaction', () => {
  it('excludes transient records and removes legacy secrets', async () => {
    const secrets = {
      nsfwKey: 'legacy-nsfw-secret',
      nsfwParams: 'token=legacy-query-secret',
      resend: 'legacy-resend-secret',
      smtp: 'legacy-smtp-secret',
      pending: 'pending-password-hash',
      otp: 'verification-code-hash',
    };
    await kvPut(env, 'config:settings', {
      nsfw: { apiKey: secrets.nsfwKey, extraParams: secrets.nsfwParams },
      email: {
        resend: { apiKey: secrets.resend },
        smtp: { password: secrets.smtp },
      },
    });
    await kvPut(env, 'pendingreg:someone@example.com', { password: secrets.pending });
    await env.DB.prepare(
      `INSERT INTO verification_codes (
        code_key, email, purpose, code_hash, expires_at, attempts, max_attempts, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, 6, ?)`,
    ).bind(
      'verify:someone@example.com',
      'someone@example.com',
      'verify',
      secrets.otp,
      Date.now() + 60_000,
      Date.now(),
    ).run();
    await env.DB.prepare(
      'INSERT INTO rate_limits (bucket, count, reset_at) VALUES (?, ?, ?)',
    ).bind('rl:test', 1, Date.now() + 60_000).run();

    const { sql, counts } = await buildBackupSql(env);

    for (const secret of Object.values(secrets)) expect(sql).not.toContain(secret);
    expect(counts.verification_codes).toBe(0);
    expect(counts.rate_limits).toBe(0);
    expect(counts.kv_store).toBe(1);
    expect(sql).toContain('config:settings');
  });
});
