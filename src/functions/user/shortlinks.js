import { dbGetImage } from '../utils/db';
import { checkRateLimit } from '../utils/ratelimit';

const SHORT_ORIGIN = 'https://tny.cc.cd';
const RESPONSE_LIMIT = 16 * 1024;

async function readShortLink(response) {
  if (!response.body) throw new Error('empty_response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_LIMIT) {
        await reader.cancel();
        throw new Error('oversized_response');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof data.slug !== 'string' || !/^[A-Za-z0-9_-]{2,32}$/.test(data.slug)
      || data.link !== `${SHORT_ORIGIN}/${data.slug}`) {
    throw new Error('invalid_response');
  }
  return data.link;
}

async function createLink(target, token, signal) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Construct fresh headers: never forward the user's JWT, cookies, or Origin.
  const response = await fetch(`${SHORT_ORIGIN}/create`, {
    method: 'POST', headers, body: JSON.stringify({ url: target }),
    redirect: 'error', signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 401 ? 'creation_unauthorized' : 'upstream_unavailable');
  }
  return readShortLink(response);
}

export async function createImageShortLinks(c) {
  c.header('Cache-Control', 'no-store');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.id !== 'string' || !/^[A-Za-z0-9_-]+\.[a-zA-Z0-9]{2,5}$/.test(body.id)
      || body.id.length > 1024) {
    return c.json({ error: '请提供有效的图片 ID' }, 400);
  }

  let timeout;
  const controller = new AbortController();
  try {
    const user = c.get('user');
    const image = await dbGetImage(c.env, body.id);
    if (!image || image.userId !== user.id || image.blocked) {
      return c.json({ error: '图片不存在、无权限或已被屏蔽' }, 404);
    }
    const rate = await checkRateLimit(c.env, `shortlinks:${user.id}`, {
      limit: 20, windowSec: 60, failOpen: false,
    });
    if (!rate.allowed) {
      c.header('Retry-After', String(rate.retryAfterSec || 30));
      return c.json({ error: '短链接生成过于频繁，请稍后重试' }, rate.degraded ? 503 : 429);
    }
    // Match the original links shown by the upload page, including its current domain.
    const origin = new URL(c.req.url).origin;
    if (!/^https?:\/\//.test(origin) || origin === SHORT_ORIGIN) throw new Error('invalid_site_origin');
    const directUrl = `${origin}/file/${body.id}`;
    const token = c.env.SHORT_LINK_TOKEN || '';
    timeout = setTimeout(() => controller.abort(), 12000);
    const direct = await createLink(directUrl, token, controller.signal);
    const preview = await createLink(`${directUrl}?preview=true`, token, controller.signal);
    return c.json({ direct, preview });
  } catch (error) {
    // Only log fixed error codes; upstream responses could contain credentials or URLs.
    const known = ['creation_unauthorized', 'upstream_unavailable', 'invalid_response', 'oversized_response', 'empty_response', 'invalid_site_origin'];
    const reason = known.includes(error?.message) ? error.message : 'request_failed';
    console.warn(JSON.stringify({ event: 'image_shortlinks_failed', reason }));
    const message = reason === 'creation_unauthorized'
      ? '短链服务需要创建密码，请联系管理员配置 SHORT_LINK_TOKEN；原链接仍可使用'
      : '短链接暂时无法生成，请稍后重试；原链接仍可使用';
    return c.json({ error: message }, 502);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
