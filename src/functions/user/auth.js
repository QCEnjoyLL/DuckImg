/**
 * 用户认证 API（D1）
 */
import { generateToken, hashPassword, verifyPassword, needsPasswordRehash, deriveVerifyCode, verifyCodeMatches } from '../utils/auth';
import { normalizeUser, getUserByName, getUserById, getUserByEmail, saveUser, publicUser, isAdmin, getUserImageCount } from '../utils/users';
import { getSettings } from '../utils/settings';
import { generateCode, sendVerificationCode, sendLoginNotify } from '../utils/email';
import {
  checkRateLimit, clientKey,
  validateUsername, validatePassword, validateEmail, validateHttpUrl,
} from '../utils/ratelimit';
import { kvGet, kvPut, kvDelete, dbGetUploadCount, dbUserImageTotals } from '../utils/db';
import { checkEmailDeliverable } from '../utils/emailcheck';

const CODE_TTL_MS = 10 * 60 * 1000;

function loginShouldWrite(rawUser) {
  if (rawUser.status === undefined || rawUser.emailVerified === undefined || rawUser.uploadLimit === undefined) {
    return true;
  }
  const today = new Date().toISOString().slice(0, 10);
  const last = rawUser.lastLoginAt ? new Date(rawUser.lastLoginAt).toISOString().slice(0, 10) : null;
  return last !== today;
}

function allowDevCode(env) {
  return String((env && env.ALLOW_DEV_CODE) || '') === '1';
}

export async function issueEmailCode(env, email, purpose = 'verify') {
  if (!email) return { ok: false, error: '邮箱不能为空' };
  // 发信前预检：一次性域名 / 无法收信的域名直接拦下，不浪费发信额度也不产生退信
  const deliver = await checkEmailDeliverable(env, email);
  if (!deliver.ok) return { ok: false, error: deliver.error };
  const code = await deriveVerifyCode(env, email, purpose);
  const sendResult = await sendVerificationCode(email, code, env);
  if (!sendResult.success) {
    const out = {
      ok: false,
      error: sendResult.error || '验证码发送失败',
      notConfigured: !!sendResult.notConfigured,
    };
    if (sendResult.notConfigured && allowDevCode(env)) out.devCode = code;
    return out;
  }
  return { ok: true };
}

export async function register(c) {
  try {

    const rl = await checkRateLimit(c.env, `reg:${clientKey(c)}`, { limit: 10, windowSec: 3600 });
    if (!rl.allowed) {
      return c.json({ error: `注册过于频繁，请 ${rl.retryAfterSec} 秒后再试` }, 429);
    }

    const body = await c.req.json();
    const u = validateUsername(body.username);
    if (!u.ok) return c.json({ error: u.error }, 400);
    const p = validatePassword(body.password, { min: 8 });
    if (!p.ok) return c.json({ error: p.error }, 400);
    const e = validateEmail(body.email);
    if (!e.ok) return c.json({ error: e.error }, 400);

    const username = u.value;
    const password = p.value;
    const email = e.value;

    if (await getUserByName(c.env, username)) {
      return c.json({ error: '用户名已存在' }, 409);
    }
    if (await getUserByEmail(c.env, email)) {
      return c.json({ error: '邮箱已被注册' }, 409);
    }

    // 邮箱可达性预检：域名收不了信当场报错，让用户改拼写，而不是傻等一封永远不来的邮件
    const deliver = await checkEmailDeliverable(c.env, email);
    if (!deliver.ok) return c.json({ error: deliver.error }, 400);

    const hashedPassword = await hashPassword(password);

    if (isAdmin(username, c.env)) {
      const userId = crypto.randomUUID();
      const user = {
        id: userId, username, email, password: hashedPassword,
        status: 'active', emailVerified: true, uploadLimit: null,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await saveUser(c.env, user);
      const token = await generateToken({ id: userId, username, role: 'admin' }, c.env);
      return c.json({ message: '注册成功', user: publicUser(normalizeUser(user, c.env)), token });
    }

    const settings = await getSettings(c.env);
    if (!settings.requireEmailVerify) {
      const userId = crypto.randomUUID();
      const user = {
        id: userId, username, email, password: hashedPassword,
        status: 'active', emailVerified: false, uploadLimit: null,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await saveUser(c.env, user);
      const token = await generateToken({ id: userId, username, role: 'user' }, c.env);
      return c.json({ message: '注册成功', user: publicUser(normalizeUser(user, c.env)), token });
    }

    const pending = {
      username,
      email,
      password: hashedPassword,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    await kvPut(c.env, `pendingreg:${email}`, pending, { expirationTtl: 1800 });

    const issued = await issueEmailCode(c.env, email);
    return c.json({
      message: '请查收邮箱验证码完成注册',
      needVerify: true,
      mode: 'register',
      email,
      ...(issued.devCode ? { devCode: issued.devCode } : {}),
      ...(issued.ok ? {} : { warning: issued.error }),
    });
  } catch (error) {
    console.error('注册错误:', error);
    return c.json({ error: '注册失败' }, 500);
  }
}

export async function login(c) {
  try {

    const rl = await checkRateLimit(c.env, `login:${clientKey(c)}`, { limit: 20, windowSec: 900 });
    if (!rl.allowed) {
      return c.json({ error: `登录尝试过多，请 ${rl.retryAfterSec} 秒后再试` }, 429);
    }

    const { username: identifier, password } = await c.req.json();
    if (!identifier || !password) {
      return c.json({ error: '用户名和密码都是必填项' }, 400);
    }

    // 登录标识统一 trim；邮箱再小写（用户名保留大小写仅用于展示匹配）
    const loginId = String(identifier).trim();
    let rawUser = null;
    const byName = await getUserByName(c.env, loginId);
    if (byName) {
      rawUser = byName;
    } else if (loginId.includes('@')) {
      rawUser = await getUserByEmail(c.env, loginId.toLowerCase());
    } else {
      // 再试一次大小写不敏感用户名（getUserByName 内部已覆盖，这里兜底邮箱型用户名）
      rawUser = await getUserByName(c.env, loginId);
    }
    if (!rawUser || !rawUser.password) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    const isPasswordValid = await verifyPassword(password, rawUser.password);
    if (!isPasswordValid) return c.json({ error: '用户名或密码错误' }, 401);

    const rehash = needsPasswordRehash(rawUser.password);
    if (rehash) rawUser.password = await hashPassword(password);

    const user = normalizeUser(rawUser, c.env);
    if (user.status === 'banned') {
      return c.json({ error: '该账户已被封禁，请联系管理员' }, 403);
    }

    const adminUser = user.role === 'admin' || isAdmin(user.username, c.env);
    if (adminUser) {
      const lastLoginAt = Date.now();
      const token = await generateToken({ id: user.id, username: user.username, role: 'admin' }, c.env);
      try {
        rawUser.emailVerified = true;
        rawUser.status = rawUser.status === 'banned' ? 'banned' : 'active';
        if (rehash || loginShouldWrite(rawUser) || rawUser.emailVerified !== true) {
          const toSave = normalizeUser(rawUser, c.env);
          toSave.password = rawUser.password;
          toSave.emailVerified = true;
          toSave.lastLoginAt = lastLoginAt;
          await saveUser(c.env, toSave);
        }
      } catch (e) { console.warn('管理员登录写失败（忽略）:', e && e.message); }
      return c.json({
        message: '登录成功',
        user: publicUser({ ...user, role: 'admin', emailVerified: true, lastLoginAt }),
        token,
      });
    }

    const settings = await getSettings(c.env);
    if (settings.requireEmailVerify && !user.emailVerified) {
      const issued = await issueEmailCode(c.env, user.email);
      return c.json({
        error: '请先验证邮箱',
        needVerify: true,
        mode: 'reverify',
        email: user.email,
        username: user.username,
        ...(issued.devCode ? { devCode: issued.devCode } : {}),
        ...(issued.ok ? {} : { warning: issued.error || '验证码邮件发送失败' }),
      }, 403);
    }

    const lastLoginAt = Date.now();
    const shouldWrite = rehash || loginShouldWrite(rawUser);
    const token = await generateToken({ id: user.id, username: user.username, role: 'user' }, c.env);
    try {
      if (shouldWrite) {
        const toSave = normalizeUser(rawUser, c.env);
        toSave.password = rawUser.password;
        toSave.lastLoginAt = lastLoginAt;
        await saveUser(c.env, toSave);
      }
      if (user.prefs && user.prefs.loginNotify && shouldWrite && user.email) {
        const ua = c.req.header('user-agent') || '';
        await sendLoginNotify(c.env, user.email, {
          username: user.username,
          timeText: new Date(lastLoginAt).toLocaleString('zh-CN'),
          ua,
        });
      }
    } catch (e) { console.warn('登录写/通知失败（忽略）:', e && e.message); }

    return c.json({ message: '登录成功', user: publicUser({ ...user, lastLoginAt }), token });
  } catch (error) {
    console.error('登录错误:', error);
    return c.json({ error: '登录失败' }, 500);
  }
}

export async function getCurrentUser(c) {
  try {
    const tokenUser = c.get('user');
    const user = await getUserByName(c.env, tokenUser.username);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    return c.json({ user: publicUser(user) });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    return c.json({ error: '获取用户信息失败' }, 500);
  }
}

export async function updateUserAvatar(c) {
  try {
    const tokenUser = c.get('user');
    const { avatarUrl } = await c.req.json();
    const urlCheck = validateHttpUrl(avatarUrl);
    if (!urlCheck.ok) return c.json({ error: urlCheck.error }, 400);

    const user = await getUserByName(c.env, tokenUser.username);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    user.avatarUrl = urlCheck.value;
    user.updatedAt = Date.now();
    await saveUser(c.env, user);
    return c.json({ message: '头像更新成功', user: publicUser(normalizeUser(user, c.env)) });
  } catch (error) {
    console.error('更新头像错误:', error);
    return c.json({ error: '更新头像失败' }, 500);
  }
}

export async function getUserProfile(c) {
  try {
    const tokenUser = c.get('user');
    const user = (tokenUser.id && await getUserById(c.env, tokenUser.id)) || await getUserByName(c.env, tokenUser.username);
    if (!user) return c.json({ error: '用户不存在' }, 404);

    const { totalImages, totalSize } = await dbUserImageTotals(c.env, user.id);
    const dateKey = new Date().toISOString().slice(0, 10);
    const todayUsed = await dbGetUploadCount(c.env, user.id, dateKey);
    const settings = await getSettings(c.env);
    const effectiveLimit = user.uploadLimit !== null ? user.uploadLimit : settings.dailyUploadLimit;

    return c.json({
      user: {
        ...publicUser(user),
        stats: {
          totalImages,
          totalSize,
          todayUsed,
          dailyLimit: effectiveLimit,
        },
      },
    });
  } catch (error) {
    console.error('获取用户资料错误:', error);
    return c.json({ error: '获取用户资料失败' }, 500);
  }
}

export async function getQuota(c) {
  try {
    const tokenUser = c.get('user');
    const user = await getUserByName(c.env, tokenUser.username);
    if (!user) return c.json({ error: '用户不存在' }, 404);

    const admin = isAdmin(user.username, c.env);
    const settings = await getSettings(c.env);
    const dateKey = new Date().toISOString().slice(0, 10);
    const used = await dbGetUploadCount(c.env, user.id, dateKey);
    const limit = user.uploadLimit !== null ? user.uploadLimit : settings.dailyUploadLimit;
    const unlimited = admin || !limit || limit <= 0;
    const remaining = unlimited ? null : Math.max(0, limit - used);

    return c.json({
      used,
      limit: unlimited ? 0 : limit,
      remaining,
      unlimited,
      isAdmin: admin,
    });
  } catch (error) {
    console.error('获取上传配额错误:', error);
    return c.json({ error: '获取配额失败' }, 500);
  }
}

export async function changePassword(c) {
  try {
    const tokenUser = c.get('user');
    const { currentPassword, newPassword } = await c.req.json();
    if (!currentPassword || !newPassword) return c.json({ error: '请填写当前密码和新密码' }, 400);
    const pw = validatePassword(newPassword, { min: 8 });
    if (!pw.ok) return c.json({ error: pw.error }, 400);

    const user = await getUserByName(c.env, tokenUser.username);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    const ok = await verifyPassword(currentPassword, user.password);
    if (!ok) return c.json({ error: '当前密码错误' }, 401);

    user.password = await hashPassword(pw.value);
    await saveUser(c.env, user);
    return c.json({ message: '密码修改成功，请重新登录' });
  } catch (error) {
    console.error('修改密码错误:', error);
    return c.json({ error: '修改密码失败' }, 500);
  }
}

export async function changeEmail(c) {
  try {
    const tokenUser = c.get('user');
    const { password, newEmail } = await c.req.json();
    if (!password || !newEmail) return c.json({ error: '请填写密码和新邮箱' }, 400);
    const em = validateEmail(newEmail);
    if (!em.ok) return c.json({ error: em.error }, 400);
    const normalizedNewEmail = em.value;

    const user = await getUserByName(c.env, tokenUser.username);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    const ok = await verifyPassword(password, user.password);
    if (!ok) return c.json({ error: '密码错误' }, 401);
    if (normalizedNewEmail === String(user.email || '').toLowerCase()) {
      return c.json({ error: '新邮箱与当前邮箱相同' }, 400);
    }
    if (await getUserByEmail(c.env, normalizedNewEmail)) {
      return c.json({ error: '该邮箱已被注册' }, 409);
    }

    const deliver = await checkEmailDeliverable(c.env, normalizedNewEmail);
    if (!deliver.ok) return c.json({ error: deliver.error }, 400);

    const code = generateCode();
    const record = { newEmail: normalizedNewEmail, code, expiresAt: Date.now() + 10 * 60 * 1000 };
    await kvPut(c.env, `emailchange:${user.id}`, record, { expirationTtl: 600 });
    const sent = await sendVerificationCode(normalizedNewEmail, code, c.env);
    return c.json({
      message: '验证码已发送至新邮箱',
      ...(sent.success ? {} : { warning: sent.error }),
      ...(sent.notConfigured && allowDevCode(c.env) ? { devCode: code } : {}),
    });
  } catch (error) {
    console.error('修改邮箱错误:', error);
    return c.json({ error: '修改邮箱失败' }, 500);
  }
}

export async function confirmEmail(c) {
  try {
    const tokenUser = c.get('user');
    const { code } = await c.req.json();
    if (!code) return c.json({ error: '请输入验证码' }, 400);

    const user = await getUserByName(c.env, tokenUser.username);
    if (!user) return c.json({ error: '用户不存在' }, 404);

    const recKey = `emailchange:${user.id}`;
    const record = await kvGet(c.env, recKey, { type: 'json' });
    if (!record) return c.json({ error: '验证码已过期，请重新发起' }, 400);
    if (record.expiresAt && Date.now() > record.expiresAt) {
      await kvDelete(c.env, recKey);
      return c.json({ error: '验证码已过期，请重新发起' }, 400);
    }
    if (String(code) !== String(record.code)) return c.json({ error: '验证码错误' }, 400);

    const taken = await getUserByEmail(c.env, record.newEmail);
    if (taken && taken.username !== user.username) {
      await kvDelete(c.env, recKey);
      return c.json({ error: '该邮箱已被注册' }, 409);
    }

    user.email = record.newEmail;
    user.emailVerified = true;
    await saveUser(c.env, user);
    await kvDelete(c.env, recKey);
    return c.json({ message: '邮箱修改成功', user: publicUser(normalizeUser(user, c.env)) });
  } catch (error) {
    console.error('确认修改邮箱错误:', error);
    return c.json({ error: '确认修改邮箱失败' }, 500);
  }
}

export async function forgotPassword(c) {
  try {
    const rl = await checkRateLimit(c.env, `forgot:${clientKey(c)}`, { limit: 5, windowSec: 900 });
    if (!rl.allowed) return c.json({ error: `请求过于频繁，请 ${rl.retryAfterSec} 秒后再试` }, 429);

    const { email, username } = await c.req.json();
    let user = null;
    if (username) user = await getUserByName(c.env, username);
    else if (email) user = await getUserByEmail(c.env, String(email).trim().toLowerCase());

    const generic = { message: '若该账户存在，重置验证码已发送至其邮箱' };
    if (!user || !user.email) return c.json(generic);

    const issued = await issueEmailCode(c.env, user.email, 'reset');
    return c.json({ ...generic, ...(issued.devCode ? { devCode: issued.devCode } : {}) });
  } catch (error) {
    console.error('忘记密码错误:', error);
    return c.json({ error: '发送失败，请稍后再试' }, 500);
  }
}

export async function resetPassword(c) {
  try {
    const rl = await checkRateLimit(c.env, `reset:${clientKey(c)}`, { limit: 10, windowSec: 900 });
    if (!rl.allowed) return c.json({ error: `尝试过多，请 ${rl.retryAfterSec} 秒后再试` }, 429);

    const { email, username, code, newPassword } = await c.req.json();
    if (!code || !newPassword) return c.json({ error: '请填写验证码和新密码' }, 400);
    const pw = validatePassword(newPassword, { min: 8 });
    if (!pw.ok) return c.json({ error: pw.error }, 400);

    let user = null;
    if (username) user = await getUserByName(c.env, username);
    else if (email) user = await getUserByEmail(c.env, String(email).trim().toLowerCase());

    const ok = user && user.email && await verifyCodeMatches(c.env, user.email, code, 'reset');
    if (!ok) return c.json({ error: '验证码错误或已过期' }, 400);

    user.password = await hashPassword(pw.value);
    await saveUser(c.env, user);
    return c.json({ message: '密码重置成功，请用新密码登录' });
  } catch (error) {
    console.error('重置密码错误:', error);
    return c.json({ error: '重置密码失败' }, 500);
  }
}

export async function updateUserPrefs(c) {
  try {
    const tokenUser = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const user = await getUserByName(c.env, tokenUser.username);
    if (!user) return c.json({ error: '用户不存在' }, 404);

    const prev = user.prefs || {};
    const next = {
      loginNotify: body.loginNotify !== undefined ? !!body.loginNotify : !!prev.loginNotify,
      public: body.public === false ? false : (body.public === true ? true : (prev.public !== false)),
      language: typeof body.language === 'string' ? body.language : (prev.language || 'zh-CN'),
    };
    user.prefs = next;
    await saveUser(c.env, user);
    return c.json({ message: '偏好已保存', prefs: next });
  } catch (error) {
    console.error('更新偏好错误:', error);
    return c.json({ error: '保存偏好失败' }, 500);
  }
}
