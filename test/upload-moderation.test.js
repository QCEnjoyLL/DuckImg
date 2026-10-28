import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedUpload } from '../src/functions/upload.js';
import { generateToken, hashPassword } from '../src/functions/utils/auth.js';
import { dbGetImage, dbGetUploadCount, kvPut } from '../src/functions/utils/db.js';
import { getUserByName, saveUser } from '../src/functions/utils/users.js';
import { resetSettingsCacheForTests } from '../src/functions/utils/settings.js';

const MODERATION_URL = 'https://moderation.example.test/check';
const app = new Hono();
app.post('/upload', authenticatedUpload);
let admin;
let user;
let fileId;
let upstream;
let moderationStatus;
let score;

async function createUser(username) {
  const account = {
    id: crypto.randomUUID(), username, email: `${crypto.randomUUID()}@example.com`,
    password: await hashPassword('test-only-password'), status: 'active',
    emailVerified: true, uploadLimit: null, tokenVersion: 0,
  };
  await saveUser(env, account);
  return account;
}

async function uploadAs(account, { role = 'user', validImage = true } = {}) {
  const token = await generateToken({ id: account.id, username: account.username, role, tv: 0 }, env);
  const body = new FormData();
  const bytes = validImage
    ? new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    : new TextEncoder().encode('not an image');
  body.append('file', new File([bytes], 'test.png', { type: 'image/png' }));
  return app.request('https://duckimg.test/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body,
  }, { ...env, TG_Bot_Token: 'test-only-bot-token', TG_Chat_ID: '-1000000000000' });
}

function moderationCalls() {
  return upstream.mock.calls.filter(([url]) => url === MODERATION_URL);
}

function deletionCalls() {
  return upstream.mock.calls.filter(([url]) => url.endsWith('/deleteMessage'));
}

beforeEach(async () => {
  resetSettingsCacheForTests();
  await kvPut(env, 'config:settings', {
    nsfw: { enabled: true, apiUrl: MODERATION_URL, method: 'POST', scorePath: 'score', threshold: 0.8, failurePolicy: 'block' },
  });
  admin = await getUserByName(env, 'testadmin') || await createUser('testadmin');
  user = await createUser(`member_${crypto.randomUUID().slice(0, 8)}`);
  fileId = `moderation_${crypto.randomUUID()}`;
  moderationStatus = 200;
  score = 0.99;
  upstream = vi.fn(async (url, init) => {
    new Request(url, init);
    if (url === MODERATION_URL) return Response.json({ score }, { status: moderationStatus });
    if (url === 'https://api.telegram.org/bottest-only-bot-token/sendDocument') {
      return Response.json({ ok: true, result: { message_id: 123, document: { file_id: fileId } } });
    }
    if (url === 'https://api.telegram.org/bottest-only-bot-token/deleteMessage') {
      return Response.json({ ok: true, result: true });
    }
    throw new Error('Unexpected outbound request');
  });
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSettingsCacheForTests();
});

describe('administrator NSFW exemption on the upload endpoint', () => {
  it.each([200, 503])('skips moderation for a real administrator even with provider status %s', async status => {
    moderationStatus = status;
    // A user-role JWT must not override the current server-side administrator identity.
    const response = await uploadAs(admin, { role: 'user' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ src: `/file/${fileId}.png`, listed: true }]);
    expect(moderationCalls()).toHaveLength(0);
    expect(deletionCalls()).toHaveLength(0);
    expect((await dbGetImage(env, `${fileId}.png`)).userId).toBe(admin.id);
  });

  it('still rejects flagged uploads from regular users and compensates storage/quota', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const before = await dbGetUploadCount(env, user.id, day);
    const response = await uploadAs(user);
    expect(await response.json()).toMatchObject([{ blocked: true, error: '图片未通过内容审核，已被拦截' }]);
    expect(moderationCalls()).toHaveLength(1);
    expect(deletionCalls()).toHaveLength(1);
    expect(await dbGetImage(env, `${fileId}.png`)).toBeNull();
    expect(await dbGetUploadCount(env, user.id, day)).toBe(before);
  });

  it('does not exempt a regular user with an admin-role JWT', async () => {
    const response = await uploadAs(user, { role: 'admin' });
    expect(await response.json()).toMatchObject([{ blocked: true, error: '图片未通过内容审核，已被拦截' }]);
    expect(moderationCalls()).toHaveLength(1);
    expect(await dbGetImage(env, `${fileId}.png`)).toBeNull();
  });

  it('still blocks regular users when the provider is unavailable and policy is block', async () => {
    moderationStatus = 503;
    const response = await uploadAs(user);
    expect(await response.json()).toMatchObject([{ blocked: true, error: '内容审核服务异常，已按站点策略拦截' }]);
    expect(moderationCalls()).toHaveLength(1);
    expect(deletionCalls()).toHaveLength(1);
    expect(await dbGetImage(env, `${fileId}.png`)).toBeNull();
  });

  it('still accepts regular users after a safe verdict', async () => {
    score = 0.01;
    const response = await uploadAs(user);
    expect(await response.json()).toEqual([{ src: `/file/${fileId}.png`, listed: true }]);
    expect(moderationCalls()).toHaveLength(1);
    expect(deletionCalls()).toHaveLength(0);
    expect((await dbGetImage(env, `${fileId}.png`)).userId).toBe(user.id);
  });

  it('does not exempt administrators from image content signature validation', async () => {
    const response = await uploadAs(admin, { validImage: false });
    expect(await response.json()).toMatchObject([{ blocked: true, error: '文件内容与图片扩展名不匹配' }]);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('does not exempt a banned administrator from the account ban', async () => {
    const bannedAdmin = { ...admin, status: 'banned' };
    await saveUser(env, bannedAdmin);
    try {
      expect((await uploadAs(bannedAdmin, { role: 'admin' })).status).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      await saveUser(env, admin);
    }
  });
});
