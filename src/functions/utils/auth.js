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
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    // 验证签名
    const expectedSignature = await generateSignature(`${encodedHeader}.${encodedPayload}`, env.JWT_SECRET);
    if (signature !== expectedSignature) {
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

// 密码哈希函数
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 验证密码
export async function verifyPassword(password, hashedPassword) {
  const hash = await hashPassword(password);
  return hash === hashedPassword;
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
  const cur = Math.floor(Date.now() / CODE_BUCKET_MS);
  for (let i = 0; i <= 2; i++) {
    const expected = await deriveCodeForBucket(env.JWT_SECRET, email, cur - i, purpose);
    if (input === expected) return true;
  }
  return false;
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
