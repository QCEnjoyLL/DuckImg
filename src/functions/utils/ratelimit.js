/**
 * 轻量限流（D1 rate_limits 表）。失败 fail-open。
 */

async function rlGet(env, bucket) {
  return env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE bucket = ?').bind(bucket).first();
}

async function rlPut(env, bucket, count, resetAt) {
  await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, count, reset_at) VALUES (?, ?, ?)
     ON CONFLICT(bucket) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at`
  ).bind(bucket, count, resetAt).run();
}

export async function checkRateLimit(env, key, opts = {}) {
  const limit = Math.max(1, opts.limit || 10);
  const windowSec = Math.max(1, opts.windowSec || 60);
  if (!env || !env.DB || !key) {
    return { allowed: true, remaining: limit, retryAfterSec: 0 };
  }

  const bucket = `rl:${key}`;
  try {
    const raw = await rlGet(env, bucket);
    const now = Date.now();
    let count = 0;
    let resetAt = now + windowSec * 1000;

    if (raw && typeof raw.count === 'number' && raw.reset_at > now) {
      count = raw.count;
      resetAt = raw.reset_at;
    }

    if (count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    count += 1;
    await rlPut(env, bucket, count, resetAt);
    return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSec: 0 };
  } catch (e) {
    console.warn('限流检查失败（放行）:', e && e.message);
    return { allowed: true, remaining: limit, retryAfterSec: 0 };
  }
}

export function clientKey(c) {
  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    (c.req.header('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown';
  return String(ip).slice(0, 64);
}

const USERNAME_RE = /^[a-zA-Z0-9_一-鿿]{2,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(username) {
  const u = String(username || '').trim();
  if (!u) return { ok: false, error: '用户名不能为空' };
  if (u.length < 2 || u.length > 24) return { ok: false, error: '用户名长度需 2–24 个字符' };
  if (!USERNAME_RE.test(u)) return { ok: false, error: '用户名仅允许中英文、数字和下划线' };
  return { ok: true, value: u };
}

export function validatePassword(password, { min = 8, max = 128 } = {}) {
  const p = String(password || '');
  if (p.length < min) return { ok: false, error: `密码至少 ${min} 位` };
  if (p.length > max) return { ok: false, error: `密码不能超过 ${max} 位` };
  return { ok: true, value: p };
}

export function validateEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { ok: false, error: '邮箱不能为空' };
  if (e.length > 254) return { ok: false, error: '邮箱过长' };
  if (!EMAIL_RE.test(e)) return { ok: false, error: '邮箱格式不正确' };
  return { ok: true, value: e };
}

export function validateHttpUrl(urlStr, { maxLen = 2048 } = {}) {
  const s = String(urlStr || '').trim();
  if (!s) return { ok: false, error: '链接不能为空' };
  if (s.length > maxLen) return { ok: false, error: '链接过长' };
  let u;
  try { u = new URL(s); } catch { return { ok: false, error: '请提供有效链接' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: '仅支持 http/https 链接' };
  }
  return { ok: true, value: s };
}
