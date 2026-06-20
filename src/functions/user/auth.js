/**
 * 用户认证相关API
 */
import { generateToken, hashPassword, verifyPassword, deriveVerifyCode, verifyCodeMatches } from '../utils/auth';
import { errorHandling, telemetryData } from '../utils/middleware';
import { normalizeUser, getUserByName, saveUser, publicUser, isAdmin, getUserImageCount, userMeta } from '../utils/users';
import { getSettings } from '../utils/settings';
import { generateCode, sendVerificationCode } from '../utils/email';

// 验证码有效期（毫秒）与重发间隔
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_KV_TTL = 600; // KV TTL 秒
const RESEND_INTERVAL_MS = 60 * 1000;

/**
 * 登录是否需要写回 user:（写额度节流）。
 * - 老用户（缺新字段）需写一次以持久化字段+列表元数据；
 * - 否则同一 UTC 天内已登录过则跳过写。
 */
function loginShouldWrite(rawUser) {
  if (rawUser.status === undefined || rawUser.emailVerified === undefined || rawUser.uploadLimit === undefined) {
    return true;
  }
  const today = new Date().toISOString().slice(0, 10);
  const last = rawUser.lastLoginAt ? new Date(rawUser.lastLoginAt).toISOString().slice(0, 10) : null;
  return last !== today;
}

/**
 * 发送邮箱验证码（确定性码，不读写 KV）。
 * 返回 { ok, error?, notConfigured?, devCode? }
 */
export async function issueEmailCode(env, email, purpose = 'verify') {
  if (!email) return { ok: false, error: '邮箱不能为空' };

  const code = await deriveVerifyCode(env, email, purpose);
  const sendResult = await sendVerificationCode(email, code, env);

  if (!sendResult.success) {
    return {
      ok: false,
      error: sendResult.error || '验证码发送失败',
      notConfigured: !!sendResult.notConfigured,
      // 降级：邮件服务未配置时回传验证码，仅用于开发联调
      devCode: sendResult.notConfigured ? code : undefined,
    };
  }

  return { ok: true };
}

// 用户注册
export async function register(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const { username, password, email } = await c.req.json();

    if (!username || !password || !email) {
      return c.json({ error: '用户名、密码和邮箱都是必填项' }, 400);
    }

    // 检查用户名是否已存在
    const existingUser = await c.env.users.get(`user:${username}`);
    if (existingUser) {
      return c.json({ error: '用户名已存在' }, 409);
    }

    // 检查邮箱是否已存在
    const emailKey = `email:${email}`;
    const existingEmail = await c.env.users.get(emailKey);
    if (existingEmail) {
      return c.json({ error: '邮箱已被注册' }, 409);
    }

    // 哈希密码
    const hashedPassword = await hashPassword(password);

    // 管理员用户名：免验证，直接建号 + 令牌
    if (isAdmin(username, c.env)) {
      const userId = crypto.randomUUID();
      const user = {
        id: userId, username, email, password: hashedPassword,
        status: 'active', emailVerified: true, uploadLimit: null,
        createdAt: Date.now(), updatedAt: Date.now()
      };
      await c.env.users.put(`user:${username}`, JSON.stringify(user), { metadata: userMeta(user) });
      await c.env.users.put(`userid:${userId}`, username);
      await c.env.users.put(emailKey, username);
      const token = await generateToken({ id: userId, username, role: 'admin' }, c.env);
      return c.json({ message: '注册成功', user: publicUser(normalizeUser(user, c.env)), token });
    }

    // 关闭「强制邮箱验证」时：直接建号 + 自动登录，不走验证码
    const settings = await getSettings(c.env);
    if (!settings.requireEmailVerify) {
      const userId = crypto.randomUUID();
      const user = {
        id: userId, username, email, password: hashedPassword,
        status: 'active', emailVerified: false, uploadLimit: null,
        createdAt: Date.now(), updatedAt: Date.now()
      };
      await c.env.users.put(`user:${username}`, JSON.stringify(user), { metadata: userMeta(user) });
      await c.env.users.put(`userid:${userId}`, username);
      await c.env.users.put(emailKey, username);
      const token = await generateToken({ id: userId, username, role: 'user' }, c.env);
      return c.json({ message: '注册成功', user: publicUser(normalizeUser(user, c.env)), token });
    }

    // 普通用户：暂不建号，仅存「待验证注册」(首操作即写，TTL 30min)，验证通过后才创建账户
    const pending = {
      username,
      email,
      password: hashedPassword,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    await c.env.users.put(`pendingreg:${email}`, JSON.stringify(pending), { expirationTtl: 1800 });

    // 发送确定性验证码
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

// 用户登录
export async function login(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const { username: identifier, password } = await c.req.json();

    if (!identifier || !password) {
      return c.json({ error: '用户名和密码都是必填项' }, 400);
    }

    const loginId = String(identifier).trim();

    // 支持用户名或邮箱登录：先按用户名查；查不到且形如邮箱则按邮箱索引解析出真实用户名
    let userJson = await c.env.users.get(`user:${loginId}`);
    if (!userJson && loginId.includes('@')) {
      const mappedName = await c.env.users.get(`email:${loginId}`);
      if (mappedName) userJson = await c.env.users.get(`user:${mappedName}`);
    }
    if (!userJson) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    const rawUser = JSON.parse(userJson);

    // 验证密码
    const isPasswordValid = await verifyPassword(password, rawUser.password);
    if (!isPasswordValid) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    const user = normalizeUser(rawUser, c.env);

    // 封禁检查
    if (user.status === 'banned') {
      return c.json({ error: '该账户已被封禁，请联系管理员' }, 403);
    }

    // 管理员：跳过邮箱验证
    if (user.role === 'admin') {
      const lastLoginAt = Date.now();
      if (loginShouldWrite(rawUser)) {
        const toSave = normalizeUser(rawUser, c.env);
        toSave.lastLoginAt = lastLoginAt;
        await saveUser(c.env, toSave);
      }
      const token = await generateToken({ id: user.id, username: user.username, role: 'admin' }, c.env);
      return c.json({ message: '登录成功', user: publicUser({ ...user, lastLoginAt }), token });
    }

    // 普通用户：需邮箱已验证（受全局开关控制）
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
        ...(issued.ok ? {} : { warning: issued.error }),
      }, 403);
    }

    // 正常登录（写节流：同一 UTC 天不重复写 user:）
    const lastLoginAt = Date.now();
    if (loginShouldWrite(rawUser)) {
      const toSave = normalizeUser(rawUser, c.env);
      toSave.lastLoginAt = lastLoginAt;
      await saveUser(c.env, toSave);
    }
    const token = await generateToken({ id: user.id, username: user.username, role: 'user' }, c.env);
    return c.json({ message: '登录成功', user: publicUser({ ...user, lastLoginAt }), token });
  } catch (error) {
    console.error('登录错误:', error);
    return c.json({ error: '登录失败' }, 500);
  }
}

// 获取当前用户信息
export async function getCurrentUser(c) {
  try {
    const tokenUser = c.get('user');
    const user = await getUserByName(c.env, tokenUser.username);

    if (!user) {
      return c.json({ error: '用户不存在' }, 404);
    }

    return c.json({ user: publicUser(user) });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    return c.json({ error: '获取用户信息失败' }, 500);
  }
}

// 更新用户头像
export async function updateUserAvatar(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const tokenUser = c.get('user');
    const { avatarUrl } = await c.req.json();

    if (!avatarUrl) {
      return c.json({ error: '头像链接不能为空' }, 400);
    }

    try {
      new URL(avatarUrl);
    } catch {
      return c.json({ error: '请提供有效的头像链接' }, 400);
    }

    const userJson = await c.env.users.get(`user:${tokenUser.username}`);
    if (!userJson) {
      return c.json({ error: '用户不存在' }, 404);
    }

    const rawUser = JSON.parse(userJson);
    rawUser.avatarUrl = avatarUrl;
    rawUser.updatedAt = Date.now();
    // 用 saveUser 写回（保留列表元数据，避免被无元数据的 put 清除）
    await saveUser(c.env, { ...rawUser });

    return c.json({
      message: '头像更新成功',
      user: publicUser(normalizeUser(rawUser, c.env))
    });
  } catch (error) {
    console.error('更新头像错误:', error);
    return c.json({ error: '更新头像失败' }, 500);
  }
}

// 获取用户资料
export async function getUserProfile(c) {
  try {
    const tokenUser = c.get('user');
    const user = await getUserByName(c.env, tokenUser.username);

    if (!user) {
      return c.json({ error: '用户不存在' }, 404);
    }

    // 统计信息（兜底，避免 NaN）
    const userFiles = await c.env.img_url.get(`user:${user.id}:files`, { type: 'json' }) || [];
    const totalImages = userFiles.length;
    const totalSize = userFiles.reduce((sum, file) => sum + (file.fileSize || 0), 0);

    // 当日上传量（用于资料页展示配额）
    const dateKey = new Date().toISOString().slice(0, 10);
    const todayUsed = parseInt(await c.env.img_url.get(`uploadcount:${user.id}:${dateKey}`) || '0', 10);
    const settings = await getSettings(c.env);
    const effectiveLimit = user.uploadLimit !== null ? user.uploadLimit : settings.dailyUploadLimit;

    return c.json({
      user: {
        ...publicUser(user),
        stats: {
          totalImages,
          totalSize,
          todayUsed,
          dailyLimit: effectiveLimit, // 0 表示不限制
        }
      }
    });
  } catch (error) {
    console.error('获取用户资料错误:', error);
    return c.json({ error: '获取用户资料失败' }, 500);
  }
}

// 获取当前用户的每日上传配额
export async function getQuota(c) {
  try {
    const tokenUser = c.get('user');
    const user = await getUserByName(c.env, tokenUser.username);

    if (!user) {
      return c.json({ error: '用户不存在' }, 404);
    }

    const admin = isAdmin(user.username, c.env);
    const settings = await getSettings(c.env);
    const dateKey = new Date().toISOString().slice(0, 10);
    const used = parseInt(await c.env.img_url.get(`uploadcount:${user.id}:${dateKey}`) || '0', 10);

    // 个人覆盖优先；0 表示不限制；管理员不限制
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

// 修改密码
export async function changePassword(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const tokenUser = c.get('user');
    const { currentPassword, newPassword } = await c.req.json();

    if (!currentPassword || !newPassword) {
      return c.json({ error: '请填写当前密码和新密码' }, 400);
    }
    if (newPassword.length < 6) {
      return c.json({ error: '新密码至少 6 位' }, 400);
    }

    const userJson = await c.env.users.get(`user:${tokenUser.username}`);
    if (!userJson) return c.json({ error: '用户不存在' }, 404);

    const rawUser = JSON.parse(userJson);
    const ok = await verifyPassword(currentPassword, rawUser.password);
    if (!ok) return c.json({ error: '当前密码错误' }, 401);

    rawUser.password = await hashPassword(newPassword);
    await saveUser(c.env, { ...rawUser });

    return c.json({ message: '密码修改成功，请重新登录' });
  } catch (error) {
    console.error('修改密码错误:', error);
    return c.json({ error: '修改密码失败' }, 500);
  }
}

// 发起修改邮箱：校验密码，向新邮箱发送验证码
export async function changeEmail(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const tokenUser = c.get('user');
    const { password, newEmail } = await c.req.json();

    if (!password || !newEmail) {
      return c.json({ error: '请填写密码和新邮箱' }, 400);
    }

    const userJson = await c.env.users.get(`user:${tokenUser.username}`);
    if (!userJson) return c.json({ error: '用户不存在' }, 404);

    const rawUser = JSON.parse(userJson);
    const ok = await verifyPassword(password, rawUser.password);
    if (!ok) return c.json({ error: '密码错误' }, 401);

    if (newEmail === rawUser.email) {
      return c.json({ error: '新邮箱与当前邮箱相同' }, 400);
    }

    // 检查新邮箱是否被占用
    const taken = await c.env.users.get(`email:${newEmail}`);
    if (taken) return c.json({ error: '该邮箱已被注册' }, 409);

    // 生成验证码，发送到新邮箱
    const code = generateCode();
    const record = { newEmail, code, expiresAt: Date.now() + 10 * 60 * 1000 };
    await c.env.users.put(`emailchange:${rawUser.id}`, JSON.stringify(record), { expirationTtl: 600 });

    const sent = await sendVerificationCode(newEmail, code, c.env);
    return c.json({
      message: '验证码已发送至新邮箱',
      ...(sent.success ? {} : { warning: sent.error }),
      ...(sent.notConfigured ? { devCode: code } : {}),
    });
  } catch (error) {
    console.error('修改邮箱错误:', error);
    return c.json({ error: '修改邮箱失败' }, 500);
  }
}

// 确认修改邮箱：校验验证码后更新邮箱
export async function confirmEmail(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const tokenUser = c.get('user');
    const { code } = await c.req.json();
    if (!code) return c.json({ error: '请输入验证码' }, 400);

    const userJson = await c.env.users.get(`user:${tokenUser.username}`);
    if (!userJson) return c.json({ error: '用户不存在' }, 404);
    const rawUser = JSON.parse(userJson);

    const recKey = `emailchange:${rawUser.id}`;
    const record = await c.env.users.get(recKey, { type: 'json' });
    if (!record) return c.json({ error: '验证码已过期，请重新发起' }, 400);
    if (record.expiresAt && Date.now() > record.expiresAt) {
      await c.env.users.delete(recKey);
      return c.json({ error: '验证码已过期，请重新发起' }, 400);
    }
    if (String(code) !== String(record.code)) {
      return c.json({ error: '验证码错误' }, 400);
    }

    // 二次确认新邮箱仍未被占用
    const taken = await c.env.users.get(`email:${record.newEmail}`);
    if (taken && taken !== rawUser.username) {
      await c.env.users.delete(recKey);
      return c.json({ error: '该邮箱已被注册' }, 409);
    }

    // 迁移 email: 索引并更新用户对象
    const oldEmail = rawUser.email;
    rawUser.email = record.newEmail;
    rawUser.emailVerified = true;
    await saveUser(c.env, { ...rawUser });
    if (oldEmail) { try { await c.env.users.delete(`email:${oldEmail}`); } catch {} }
    await c.env.users.put(`email:${record.newEmail}`, rawUser.username);
    await c.env.users.delete(recKey);

    return c.json({ message: '邮箱修改成功', user: publicUser(normalizeUser(rawUser, c.env)) });
  } catch (error) {
    console.error('确认修改邮箱错误:', error);
    return c.json({ error: '确认修改邮箱失败' }, 500);
  }
}

// 忘记密码：发送重置验证码（防枚举：无论账户是否存在都返回成功）
export async function forgotPassword(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const { email, username } = await c.req.json();

    // 解析目标用户的邮箱
    let user = null;
    if (username) {
      user = await getUserByName(c.env, username);
    } else if (email) {
      const uname = await c.env.users.get(`email:${email}`);
      if (uname) user = await getUserByName(c.env, uname);
    }

    const generic = { message: '若该账户存在，重置验证码已发送至其邮箱' };

    if (!user || !user.email) {
      return c.json(generic);
    }

    // 发送 reset 用途的确定性验证码
    const issued = await issueEmailCode(c.env, user.email, 'reset');
    return c.json({
      ...generic,
      // 邮件未配置时回传验证码，便于自托管调试（仅账户存在时）
      ...(issued.devCode ? { devCode: issued.devCode } : {}),
    });
  } catch (error) {
    console.error('忘记密码错误:', error);
    return c.json({ error: '发送失败，请稍后再试' }, 500);
  }
}

// 重置密码：校验 reset 验证码后写入新密码
export async function resetPassword(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const { email, username, code, newPassword } = await c.req.json();

    if (!code || !newPassword) {
      return c.json({ error: '请填写验证码和新密码' }, 400);
    }
    if (newPassword.length < 6) {
      return c.json({ error: '新密码至少 6 位' }, 400);
    }

    // 解析目标用户
    let user = null;
    if (username) {
      user = await getUserByName(c.env, username);
    } else if (email) {
      const uname = await c.env.users.get(`email:${email}`);
      if (uname) user = await getUserByName(c.env, uname);
    }

    // 统一错误，不泄露账户是否存在
    const ok = user && user.email && await verifyCodeMatches(c.env, user.email, code, 'reset');
    if (!ok) {
      return c.json({ error: '验证码错误或已过期' }, 400);
    }

    const rawJson = await c.env.users.get(`user:${user.username}`);
    if (!rawJson) return c.json({ error: '验证码错误或已过期' }, 400);
    const rawUser = JSON.parse(rawJson);
    rawUser.password = await hashPassword(newPassword);
    await saveUser(c.env, { ...rawUser });

    return c.json({ message: '密码重置成功，请用新密码登录' });
  } catch (error) {
    console.error('重置密码错误:', error);
    return c.json({ error: '重置密码失败' }, 500);
  }
}
