/**
 * 邮箱验证相关API
 */
import { errorHandling, telemetryData } from '../utils/middleware';
import { generateToken, verifyCodeMatches } from '../utils/auth';
import { normalizeUser, getUserByName, saveUser, publicUser, isAdmin, userMeta } from '../utils/users';
import { issueEmailCode } from './auth';

/**
 * 发送/重发验证码：根据 email 或 username 解析目标邮箱后发确定性码
 * POST /api/auth/send-code  { email? , username? }
 */
export async function sendCode(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const { email, username } = await c.req.json();

    let targetEmail = email;
    if (!targetEmail && username) {
      const user = await getUserByName(c.env, username);
      if (user) targetEmail = user.email;
    }

    if (!targetEmail) {
      return c.json({ error: '请提供邮箱或用户名' }, 400);
    }

    const issued = await issueEmailCode(c.env, targetEmail);
    if (!issued.ok) {
      return c.json({
        error: issued.error || '验证码发送失败',
        ...(issued.devCode ? { devCode: issued.devCode } : {}),
      }, issued.devCode ? 200 : 500);
    }

    return c.json({ message: '验证码已发送' });
  } catch (error) {
    console.error('发送验证码错误:', error);
    return c.json({ error: '发送验证码失败' }, 500);
  }
}

/**
 * 校验验证码：
 * - 账户已存在 → 重新验证模式：把该用户标记为已验证；
 * - 账户不存在 → 注册模式：读取 pendingreg 并创建账户（直接已验证）。
 * 成功均签发令牌（自动登录）。验证码为时间确定性码，不依赖 KV 一致性。
 * POST /api/auth/verify-code  { email? , username? , code }
 */
export async function verifyCode(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const { email, username, code } = await c.req.json();
    if (!code) {
      return c.json({ error: '请输入验证码' }, 400);
    }

    // 先判断账户是否已存在（决定 重新验证 / 注册 模式）
    let existingUser = null;
    if (username) {
      existingUser = await getUserByName(c.env, username);
    }
    // 回退：用户名查不到时按邮箱索引解析（兼容“用邮箱登录”或前端把邮箱当用户名传过来的情况）
    if (!existingUser) {
      const byEmail = email || (username && username.includes('@') ? username : null);
      if (byEmail) {
        const uname = await c.env.users.get(`email:${byEmail}`);
        if (uname) existingUser = await getUserByName(c.env, uname);
      }
    }

    // ===== 重新验证模式（老用户/未验证账户）=====
    if (existingUser) {
      const ok = await verifyCodeMatches(c.env, existingUser.email, code);
      if (!ok) {
        return c.json({ error: '验证码错误或已过期' }, 400);
      }

      const rawJson = await c.env.users.get(`user:${existingUser.username}`);
      const rawUser = JSON.parse(rawJson);
      rawUser.emailVerified = true;
      rawUser.lastLoginAt = Date.now();
      await saveUser(c.env, { ...rawUser });

      const fresh = normalizeUser(rawUser, c.env);
      const role = isAdmin(fresh.username, c.env) ? 'admin' : 'user';
      const token = await generateToken({ id: fresh.id, username: fresh.username, role }, c.env);
      return c.json({ message: '邮箱验证成功', user: publicUser(fresh), token });
    }

    // ===== 注册模式（账户尚未创建）=====
    if (!email) {
      return c.json({ error: '缺少邮箱信息，请重新注册' }, 400);
    }

    const pending = await c.env.users.get(`pendingreg:${email}`, { type: 'json' });
    if (!pending) {
      return c.json({ error: '注册请求已过期，请重新注册' }, 400);
    }
    if (pending.expiresAt && Date.now() > pending.expiresAt) {
      await c.env.users.delete(`pendingreg:${email}`);
      return c.json({ error: '注册请求已过期，请重新注册' }, 400);
    }

    const ok = await verifyCodeMatches(c.env, email, code);
    if (!ok) {
      return c.json({ error: '验证码错误或已过期' }, 400);
    }

    // 创建账户前再次唯一性检查（防并发/抢占）
    if (await c.env.users.get(`user:${pending.username}`)) {
      await c.env.users.delete(`pendingreg:${email}`);
      return c.json({ error: '用户名已存在' }, 409);
    }
    const emailOwner = await c.env.users.get(`email:${email}`);
    if (emailOwner) {
      await c.env.users.delete(`pendingreg:${email}`);
      return c.json({ error: '邮箱已被注册' }, 409);
    }

    // 创建账户（直接已验证）
    const userId = crypto.randomUUID();
    const user = {
      id: userId,
      username: pending.username,
      email,
      password: pending.password,
      status: 'active',
      emailVerified: true,
      uploadLimit: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await c.env.users.put(`user:${pending.username}`, JSON.stringify(user), { metadata: userMeta(user) });
    await c.env.users.put(`userid:${userId}`, pending.username);
    await c.env.users.put(`email:${email}`, pending.username);
    await c.env.users.delete(`pendingreg:${email}`);

    const role = isAdmin(pending.username, c.env) ? 'admin' : 'user';
    const token = await generateToken({ id: userId, username: pending.username, role }, c.env);
    return c.json({ message: '邮箱验证成功，注册完成', user: publicUser(normalizeUser(user, c.env)), token });
  } catch (error) {
    console.error('验证验证码错误:', error);
    return c.json({ error: '验证失败' }, 500);
  }
}
