/**
 * 邮箱验证 API（D1）
 */
import { generateToken, verifyCodeMatches } from '../utils/auth';
import { normalizeUser, getUserByName, getUserByEmail, saveUser, publicUser, isAdmin } from '../utils/users';
import { issueEmailCode } from './auth';
import { checkRateLimit, clientKey } from '../utils/ratelimit';
import { kvGet, kvDelete } from '../utils/db';

export async function sendCode(c) {
  try {

    const rl = await checkRateLimit(c.env, `sendcode:${clientKey(c)}`, { limit: 8, windowSec: 900 });
    if (!rl.allowed) {
      return c.json({ error: `发送过于频繁，请 ${rl.retryAfterSec} 秒后再试` }, 429);
    }

    const { email, username } = await c.req.json();
    let targetEmail = email;
    if (!targetEmail && username) {
      const user = await getUserByName(c.env, username);
      if (user) targetEmail = user.email;
    }
    if (!targetEmail) return c.json({ error: '请提供邮箱或用户名' }, 400);

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

export async function verifyCode(c) {
  try {

    const rl = await checkRateLimit(c.env, `verifycode:${clientKey(c)}`, { limit: 20, windowSec: 900 });
    if (!rl.allowed) {
      return c.json({ error: `验证尝试过多，请 ${rl.retryAfterSec} 秒后再试` }, 429);
    }

    const { email, username, code } = await c.req.json();
    if (!code) return c.json({ error: '请输入验证码' }, 400);

    let existingUser = null;
    if (username) existingUser = await getUserByName(c.env, username);
    if (!existingUser) {
      const byEmail = email || (username && username.includes('@') ? username : null);
      if (byEmail) existingUser = await getUserByEmail(c.env, byEmail);
    }

    if (existingUser) {
      const ok = await verifyCodeMatches(c.env, existingUser.email, code);
      if (!ok) return c.json({ error: '验证码错误或已过期' }, 400);

      existingUser.emailVerified = true;
      existingUser.lastLoginAt = Date.now();
      await saveUser(c.env, existingUser);

      const fresh = normalizeUser(existingUser, c.env);
      const role = isAdmin(fresh.username, c.env) ? 'admin' : 'user';
      const token = await generateToken({
        id: fresh.id,
        username: fresh.username,
        role,
        tv: Number(fresh.tokenVersion) || 0,
      }, c.env);
      return c.json({ message: '邮箱验证成功', user: publicUser(fresh), token });
    }

    if (!email) return c.json({ error: '缺少邮箱信息，请重新注册' }, 400);

    const pending = await kvGet(c.env, `pendingreg:${email}`, { type: 'json' });
    if (!pending) return c.json({ error: '注册请求已过期，请重新注册' }, 400);
    if (pending.expiresAt && Date.now() > pending.expiresAt) {
      await kvDelete(c.env, `pendingreg:${email}`);
      return c.json({ error: '注册请求已过期，请重新注册' }, 400);
    }

    const ok = await verifyCodeMatches(c.env, email, code);
    if (!ok) return c.json({ error: '验证码错误或已过期' }, 400);

    if (await getUserByName(c.env, pending.username)) {
      await kvDelete(c.env, `pendingreg:${email}`);
      return c.json({ error: '用户名已存在' }, 409);
    }
    if (await getUserByEmail(c.env, email)) {
      await kvDelete(c.env, `pendingreg:${email}`);
      return c.json({ error: '邮箱已被注册' }, 409);
    }

    const userId = crypto.randomUUID();
    const user = {
      id: userId,
      username: pending.username,
      email,
      password: pending.password,
      status: 'active',
      emailVerified: true,
      uploadLimit: null,
      tokenVersion: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveUser(c.env, user);
    await kvDelete(c.env, `pendingreg:${email}`);

    const role = isAdmin(pending.username, c.env) ? 'admin' : 'user';
    const token = await generateToken({ id: userId, username: pending.username, role, tv: 0 }, c.env);
    return c.json({
      message: '邮箱验证成功，注册完成',
      user: publicUser(normalizeUser(user, c.env)),
      token,
    });
  } catch (error) {
    console.error('验证验证码错误:', error);
    return c.json({ error: '验证失败' }, 500);
  }
}
