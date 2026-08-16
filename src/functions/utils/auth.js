/**
 * 用户认证相关工具函数
 */
import { isAdmin, getUserById, getUserByName } from './users';
import {
  dbConsumeVerificationCode,
  dbDeleteVerificationCode,
  dbSaveVerificationCode,
} from './db.js';

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

/** 对两个任意长度的敏感字符串先定长哈希，再恒定工作量比较。 */
export async function timingSafeEqualSecret(a, b) {
  if (!a || !b) return false;
  const encoder = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(a))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(b))),
  ]);
  const aa = new Uint8Array(ha);
  const bb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
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

// ===== 邮箱验证码：随机、限次、一次性消费 =====
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 6;

function normalizeVerificationEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function verificationKey(email, purpose) {
  return `${String(purpose || 'verify')}:${normalizeVerificationEmail(email)}`;
}

function randomSixDigitCode() {
  // 拒绝采样，避免 Uint32 对 1,000,000 取模产生轻微偏差。
  const range = 0x100000000;
  const ceiling = range - (range % 1000000);
  const arr = new Uint32Array(1);
  do { crypto.getRandomValues(arr); } while (arr[0] >= ceiling);
  return (arr[0] % 1000000).toString().padStart(6, '0');
}

async function verificationHash(env, email, code, purpose) {
  if (!env || !env.JWT_SECRET) throw new Error('JWT_SECRET missing');
  return generateSignature(
    `verification:${String(purpose || 'verify')}:${normalizeVerificationEmail(email)}:${String(code)}`,
    env.JWT_SECRET,
  );
}

/** 创建新验证码；同邮箱同用途的旧验证码会立即失效。 */
export async function createVerificationCode(env, email, purpose = 'verify') {
  const normalized = normalizeVerificationEmail(email);
  if (!normalized) throw new Error('email missing');
  const code = randomSixDigitCode();
  const codeHash = await verificationHash(env, normalized, code, purpose);
  await dbSaveVerificationCode(env, {
    key: verificationKey(normalized, purpose),
    email: normalized,
    purpose: String(purpose || 'verify'),
    codeHash,
    expiresAt: Date.now() + CODE_TTL_MS,
    maxAttempts: CODE_MAX_ATTEMPTS,
  });
  return code;
}

export async function clearVerificationCode(env, email, purpose = 'verify') {
  await dbDeleteVerificationCode(env, verificationKey(email, purpose));
}

/** 校验并原子消费验证码；错误提交会消耗一次全局尝试次数。 */
export async function verifyCodeMatches(env, email, code, purpose = 'verify') {
  const input = String(code || '').trim();
  if (!/^\d{6}$/.test(input)) return false;
  const normalized = normalizeVerificationEmail(email);
  if (!normalized) return false;
  const codeHash = await verificationHash(env, normalized, input, purpose);
  return dbConsumeVerificationCode(env, verificationKey(normalized, purpose), codeHash, Date.now());
}

async function getTokenUser(env, payload) {
  if (!payload) return null;
  // 带 id 的新令牌必须严格按 id 命中；账号删除后即使同名重建，也不能让旧令牌“借尸还魂”。
  if (payload.id) return getUserById(env, payload.id);
  return payload.username ? getUserByName(env, payload.username) : null;
}

function tokenVersionMatches(payload, user) {
  return Number(payload && payload.tv) === Number(user && user.tokenVersion);
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

  const user = await getTokenUser(c.env, payload);
  if (!user) return c.json({ error: '账户不存在或登录已失效' }, 401);
  if (user.status === 'banned') return c.json({ error: '该账户已被封禁' }, 403);
  if (!tokenVersionMatches(payload, user)) return c.json({ error: '登录已失效，请重新登录' }, 401);

  // 使用数据库中的实时身份，不信任令牌里的可陈旧字段。
  c.set('user', {
    ...payload,
    id: user.id,
    username: user.username,
    role: isAdmin(user.username, c.env) ? 'admin' : 'user',
  });

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

  const user = await getTokenUser(c.env, payload);
  if (!user) return c.json({ error: '账户不存在或登录已失效' }, 401);
  if (user.status === 'banned') return c.json({ error: '该账户已被封禁' }, 403);
  if (!tokenVersionMatches(payload, user)) return c.json({ error: '登录已失效，请重新登录' }, 401);

  // 以数据库用户名 + 环境变量实时判定管理员身份，不信任令牌中的 role。
  if (!isAdmin(user.username, c.env)) {
    return c.json({ error: '需要管理员权限' }, 403);
  }

  c.set('user', { ...payload, id: user.id, username: user.username, role: 'admin' });

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
