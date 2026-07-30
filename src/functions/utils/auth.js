/**
 * 用户认证相关工具函数
 */
import { isAdmin } from './users';

// UTF-8 安全的 base64url 编解码（btoa/atob 无法处理非 ASCII，如中文用户名）
function b64urlEncode(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeToObj(str) {
  let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (s.length % 4)) % 4;
  s += '='.repeat(pad);
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

// 生成JWT令牌
export async function generateToken(payload, env) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 60 * 60 * 24 * 7; // 7天过期

  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };

  const encodedHeader = b64urlEncode(header);
  const encodedPayload = b64urlEncode(tokenPayload);

  const signature = await generateSignature(`${encodedHeader}.${encodedPayload}`, env.JWT_SECRET);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// 验证JWT令牌
export async function verifyToken(token, env) {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, message: '无效的令牌' };
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, message: '无效的令牌格式' };
    }
    const [encodedHeader, encodedPayload, signature] = parts;
    if (!encodedHeader || !encodedPayload || !signature) {
      return { valid: false, message: '无效的令牌格式' };
    }

    // 强制 HS256，拒绝 alg=none / 其它算法混淆
    try {
      const header = b64urlDecodeToObj(encodedHeader);
      if (!header || header.alg !== 'HS256') {
        return { valid: false, message: '无效的令牌算法' };
      }
    } catch {
      return { valid: false, message: '无效的令牌头' };
    }

    // 验证签名（恒定时间比较）
    const expectedSignature = await generateSignature(`${encodedHeader}.${encodedPayload}`, env.JWT_SECRET);
    if (!timingSafeEqualStr(signature, expectedSignature)) {
      return { valid: false, message: '无效的令牌签名' };
    }

    // 解析载荷（UTF-8 安全，兼容旧的标准 base64 token）
    const payload = b64urlDecodeToObj(encodedPayload);

    // 检查令牌是否过期
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, message: '令牌已过期' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, message: '令牌解析错误' };
  }
}

// 生成签名
async function generateSignature(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// 密码哈希：PBKDF2-HMAC-SHA-256 + 每用户随机 salt
// 存储格式：pbkdf2$<iterations>$<salt_b64>$<hash_b64>
// 兼容旧版：纯 64 位 hex（单次无盐 SHA-256）
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BITS = 256;
const PBKDF2_PREFIX = 'pbkdf2$';

function bytesToB64(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

function b64ToBytes(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqualStr(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function pbkdf2Derive(password, saltBytes, iterations) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    baseKey,
    PBKDF2_KEY_BITS
  );
  return new Uint8Array(bits);
}

/** 新密码哈希（注册 / 改密 / 重置） */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const derived = await pbkdf2Derive(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(derived)}`;
}

/** 是否需要把旧哈希升级为 PBKDF2（登录成功后静默重写） */
export function needsPasswordRehash(stored) {
  return !stored || !String(stored).startsWith(PBKDF2_PREFIX);
}

/** 验证密码（兼容旧 SHA-256 hex） */
export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const s = String(stored);

  if (s.startsWith(PBKDF2_PREFIX)) {
    // pbkdf2$iter$salt$hash
    const parts = s.split('$');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    if (!iterations || iterations < 1) return false;
    try {
      const salt = b64ToBytes(parts[2]);
      const expected = parts[3];
      const derived = await pbkdf2Derive(password, salt, iterations);
      return timingSafeEqualStr(bytesToB64(derived), expected);
    } catch {
      return false;
    }
  }

  // 旧格式：无盐单次 SHA-256 hex
  const legacy = await sha256Hex(password);
  return timingSafeEqualStr(legacy, s);
}

// ===== 邮箱验证码：时间确定性码（不读写 KV，免疫 KV 一致性/负缓存） =====
const CODE_BUCKET_MS = 5 * 60 * 1000; // 5 分钟一个时间桶

// 由 (email, bucket, purpose) 经 HMAC(JWT_SECRET) 派生 6 位验证码
async function deriveCodeForBucket(secret, email, bucket, purpose = 'verify') {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret || ''),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}:${email}:${bucket}`));
  const b = new Uint8Array(sig);
  // 取前 4 字节组成无符号整数后取模，得到 6 位码
  const num = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  return (num % 1000000).toString().padStart(6, '0');
}

// 生成当前时间窗的验证码（发码用）。purpose 区分用途（verify/reset）
export async function deriveVerifyCode(env, email, purpose = 'verify') {
  const bucket = Math.floor(Date.now() / CODE_BUCKET_MS);
  return deriveCodeForBucket(env.JWT_SECRET, email, bucket, purpose);
}

// 校验验证码：接受 当前 + 前 2 个时间桶（约 10–15 分钟有效）
export async function verifyCodeMatches(env, email, code, purpose = 'verify') {
  if (!code) return false;
  const input = String(code).trim();
  if (!/^\d{4,8}$/.test(input)) return false;
  const cur = Math.floor(Date.now() / CODE_BUCKET_MS);
  let matched = false;
  // 始终跑完 3 个桶，避免“早退”造成时序差异
  for (let i = 0; i <= 2; i++) {
    const expected = await deriveCodeForBucket(env.JWT_SECRET, email, cur - i, purpose);
    if (timingSafeEqualStr(input, expected)) matched = true;
  }
  return matched;
}

// 认证中间件
export async function authMiddleware(c, next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const token = authHeader.substring(7);
  const { valid, payload, message } = await verifyToken(token, c.env);

  if (!valid) {
    return c.json({ error: message || '无效的令牌' }, 401);
  }

  // 将用户信息添加到请求上下文
  c.set('user', payload);

  // 热路径封禁检查：优先 banned 集合（带边缘 cacheTtl + 内存），避免每次 getWithMetadata
  try {
    const { getBannedSet } = await import('./bans.js');
    const banned = await getBannedSet(c.env);
    if (banned && banned.size > 0) {
      const uid = payload && payload.id != null ? String(payload.id) : '';
      if (uid && banned.has(uid)) {
        return c.json({ error: '该账户已被封禁' }, 403);
      }
      // 无 id 的旧 token：回退查用户状态
      if (!uid && payload && payload.username) {
        try {
          const { getUserByName } = await import('./users.js');
          const u = await getUserByName(c.env, payload.username);
          if (u && u.status === 'banned') return c.json({ error: '该账户已被封禁' }, 403);
        } catch { /* ignore */ }
      }
    }
  } catch { /* 检查失败不阻断正常用户 */ }

  return next();
}

// 管理员认证中间件：先验证登录，再校验是否为管理员
export async function adminMiddleware(c, next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const token = authHeader.substring(7);
  const { valid, payload, message } = await verifyToken(token, c.env);

  if (!valid) {
    return c.json({ error: message || '无效的令牌' }, 401);
  }

  // 以环境变量为准实时判定管理员身份（不完全信任令牌中的 role）
  if (!isAdmin(payload.username, c.env)) {
    return c.json({ error: '需要管理员权限' }, 403);
  }

  c.set('user', payload);

  return next();
}

// ===== 管理看图短时票（避免把长寿命 JWT 放进 ?t=） =====
const PREVIEW_TICKET_TTL_SEC = 10 * 60; // 10 分钟

/** 签发管理预览票：pv1.<payload_b64url>.<sig_b64url> */
export async function createPreviewTicket(env, { username } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    role: 'preview',
    username: username || '',
    iat: now,
    exp: now + PREVIEW_TICKET_TTL_SEC,
  };
  const body = b64urlEncode(payload);
  const sig = await generateSignature(body, env.JWT_SECRET);
  return `pv1.${body}.${sig}`;
}

/** 校验预览票；兼容旧 JWT（过渡期） */
export async function verifyPreviewTicket(ticket, env) {
  try {
    if (!ticket || typeof ticket !== 'string') return { valid: false };
    if (ticket.startsWith('pv1.')) {
      const parts = ticket.split('.');
      if (parts.length !== 3) return { valid: false };
      const body = parts[1];
      const sig = parts[2];
      const expected = await generateSignature(body, env.JWT_SECRET);
      if (!timingSafeEqualStr(sig, expected)) return { valid: false };
      const payload = b64urlDecodeToObj(body);
      const now = Math.floor(Date.now() / 1000);
      if (!payload || payload.role !== 'preview') return { valid: false };
      if (payload.exp && payload.exp < now) return { valid: false };
      if (!isAdmin(payload.username, env)) return { valid: false };
      return { valid: true, payload };
    }
    const r = await verifyToken(ticket, env);
    if (!r.valid || !r.payload) return { valid: false };
    if (!isAdmin(r.payload.username, env)) return { valid: false };
    return { valid: true, payload: r.payload, legacy: true };
  } catch {
    return { valid: false };
  }
}
