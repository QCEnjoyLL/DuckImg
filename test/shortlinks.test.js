import { env, exports } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateToken, hashPassword } from '../src/functions/utils/auth.js';
import { dbUpsertImage } from '../src/functions/utils/db.js';
import { saveUser } from '../src/functions/utils/users.js';
import { createImageShortLinks } from '../src/functions/user/shortlinks.js';

const ENDPOINT = 'https://duckimg.test/api/images/shortlinks';
let user;
let token;
let imageId;
let upstream;

function request(payload, headers = {}) {
  return exports.default.fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

beforeEach(async () => {
  user = {
    id: crypto.randomUUID(), username: `short_${crypto.randomUUID().slice(0, 8)}`,
    email: `${crypto.randomUUID()}@example.com`, password: await hashPassword('test-only-password'),
    status: 'active', emailVerified: true, tokenVersion: 0,
  };
  await saveUser(env, user);
  token = await generateToken({ id: user.id, username: user.username, tv: 0 }, env);
  imageId = `short_${crypto.randomUUID()}.png`;
  await dbUpsertImage(env, { id: imageId, userId: user.id, fileName: 'image.png' });
  upstream = vi.fn(async (_url, init) => {
    // Preserve native Workers request-option validation rather than hiding it
    // behind an unconditional fetch stub (not all browser redirect modes work here).
    new Request(_url, init);
    const preview = JSON.parse(init.body).url.endsWith('?preview=true');
    const slug = preview ? 'preview123' : 'direct123';
    return Response.json({ slug, link: `https://tny.cc.cd/${slug}` });
  });
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('optional image short links', () => {
  it('requires authentication before calling the short service', async () => {
    const response = await request({ id: imageId }, { Authorization: '' });
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('generates separate direct and preview links without forwarding user credentials', async () => {
    const response = await request({ id: imageId, url: 'https://attacker.example/' }, {
      Cookie: 'session=private', Origin: 'https://duckimg.test',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      direct: 'https://tny.cc.cd/direct123', preview: 'https://tny.cc.cd/preview123',
    });
    expect(upstream).toHaveBeenCalledTimes(2);
    for (const [endpoint, init] of upstream.mock.calls) {
      expect(endpoint).toBe('https://tny.cc.cd/create');
      expect(init.redirect).toBe('manual');
      expect(new Headers(init.headers).get('Authorization')).toBeNull();
      expect(new Headers(init.headers).get('Cookie')).toBeNull();
      expect(new Headers(init.headers).get('Origin')).toBeNull();
    }
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({ url: `https://duckimg.test/file/${imageId}` });
    expect(JSON.parse(upstream.mock.calls[1][1].body)).toEqual({ url: `https://duckimg.test/file/${imageId}?preview=true` });
  });

  it.each([
    { url: 'https://example.com/image.png' }, { id: '../admin' },
    { id: 'foo.png?url=https://example.com' }, { id: 'foo.png#token' }, null,
  ])('rejects arbitrary URLs and malformed image IDs: %j', async payload => {
    expect((await request(payload)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and oversized bodies', async () => {
    expect((await request('{')).status).toBe(400);
    expect((await request(JSON.stringify({ id: 'x'.repeat(3000) }))).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('does not shorten another user image, missing image, or blocked image', async () => {
    await dbUpsertImage(env, { id: imageId, userId: 'another-user' });
    expect((await request({ id: imageId })).status).toBe(404);
    await dbUpsertImage(env, { id: imageId, userId: user.id, blocked: true });
    expect((await request({ id: imageId })).status).toBe(404);
    expect((await request({ id: 'missing.png' })).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('passes only a server-side creation token and matches the upload page origin', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('user', user); await next(); });
    app.post('/short', createImageShortLinks);
    const response = await app.request('https://alias.example/short', {
      method: 'POST', body: JSON.stringify({ id: imageId }), headers: { 'Content-Type': 'application/json' },
    }, { ...env, SITE_URL: 'https://piv.cc.cd', SHORT_LINK_TOKEN: 'test-only-creation-token' });
    expect(response.status).toBe(200);
    expect(new Headers(upstream.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer test-only-creation-token');
    expect(JSON.parse(upstream.mock.calls[0][1].body).url).toBe(`https://alias.example/file/${imageId}`);
    expect(await response.text()).not.toContain('test-only-creation-token');
  });

  it.each([301, 302, 307, 308, 401, 403, 429, 500])('handles upstream HTTP %s without returning upstream error bodies', async status => {
    upstream.mockImplementation(async () => new Response('private-upstream-value', { status }));
    const response = await request({ id: imageId });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private-upstream-value');
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][1].redirect).toBe('manual');
  });

  it.each([
    { slug: 'ok1234', link: 'https://attacker.example/ok1234' },
    { slug: 'ok1234', link: 'javascript:alert(1)' },
    { slug: '../escape', link: 'https://tny.cc.cd/../escape' },
    {},
  ])('rejects untrusted or malformed upstream output: %j', async payload => {
    upstream.mockImplementation(async () => Response.json(payload));
    expect((await request({ id: imageId })).status).toBe(502);
  });

  it('bounds upstream response size', async () => {
    upstream.mockImplementation(async () => new Response('x'.repeat(17000)));
    expect((await request({ id: imageId })).status).toBe(502);
  });

  it('times out without leaving a hanging request', async () => {
    let aborted = false;
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) =>
      realSetTimeout(callback, delay === 12000 ? 1 : delay, ...args));
    upstream.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
    }));
    expect((await request({ id: imageId })).status).toBe(502);
    expect(aborted).toBe(true);
  });

  it('limits creation requests per user', async () => {
    await env.DB.prepare('INSERT INTO rate_limits (bucket, count, reset_at) VALUES (?, ?, ?)')
      .bind(`rl:shortlinks:${user.id}`, 20, Date.now() + 60000).run();
    const response = await request({ id: imageId });
    expect(response.status).toBe(429);
    expect(response.headers.has('Retry-After')).toBe(true);
    expect(upstream).not.toHaveBeenCalled();
  });
});
