/**
 * 邮箱验证 API（D1）
 */
import { generateToken, verifyCodeMatches } from '../utils/auth';
import { normalizeUser, getUserByName, getUserByEmail, saveUser, publicUser, isAdmin } from '../utils/users';
import { issueEmailCode } from './auth';
import { checkRateLimit, accountKey, clientKey } from '../utils/ratelimit';
import { kvGet, kvDelete } from '../utils/db';

export async function sendCode(c) {
  try {

    const rl = await checkRateLimit(c.env, `sendcode:${clientKey(c)}`, { limit: 8, windowSec: 900, failOpen: false });
    if (!rl.allowed) {
      return c.json({ error: `发送过于频繁，请 ${rl.retryAfterSec} 秒后再试` }, 429);
    }

    const { email, username } = await c.req.json();

    // 账号维度发码上限：每次重新发码都会把验证码的 attempts 清零，
    // 所以只按 IP 限会让"6 次尝试"变成"每个 IP 8 次 × 无限 IP"。
    // 分两层：
    //   - 60 秒短冷却：防连点；对"打错字重发"这种正常场景足够宽松
    //   - 5 分钟 3 次：真正的滥用上限（比之前 15 分钟 4 次更早刹车，
    //     但短冷却的存在让正常用户不会一上来就被锁 15 分钟）
    const target = accountKey(email || username);
    if (target) {
      const cool = await checkRateLimit(c.env, `sendcodecool:${target}`, {
        limit: 1, windowSec: 60, failOpen: false,
      });
      if (!cool.allowed) {
        return c.json({ error: `请 ${cool.retryAfterSec} 秒后再重新发送` }, 429);
      }
      const rlAcct = await checkRateLimit(c.env, `sendcodeacct:${target}`, {
        limit: 3, windowSec: 300, failOpen: false,
      });
      if (!rlAcct.allowed) {
        return c.json({ error: `发送过于频繁，请 ${rlAcct.retryAfterSec} 秒后再试` }, 429);
      }
    }

    let targetEmail = email;
    if (!targetEmail && username) {
      const user = await getUserByName(c.env, username);
      if (user) targetEmail = user.email;
    }
    if (!targetEmail) return c.json({ error: '请提供邮箱或用户名' }, 400);

    const issued = await issueEmailCode(c.env, targetEmail);
    if (!issued.ok) {
      // 域名收不了信/一次性邮箱属于用户输入问题 → 400；
      // 只有发信服务本身失败才是 500。此前一律 500，会把"邮箱写错了"
      // 显示成"网站坏了"。
      const status = issued.devCode ? 200 : (issued.clientError ? 400 : 500);
      return c.json({
        error: issued.error || '验证码发送失败',
        ...(issued.devCode ? { devCode: issued.devCode } : {}),
      }, status);
    }
    return c.json({ message: '验证码已发送' });
  } catch (error) {
    console.error('发送验证码错误:', error);
    return c.json({ error: '发送验证码失败' }, 500);
  }
}

export async function verifyCode(c) {
  try {

    const rl = await checkRateLimit(c.env, `verifycode:${clientKey(c)}`, { limit: 20, windowSec: 900, failOpen: false });
    if (!rl.allowed) {
      return c.json({ error: `验证尝试过多，请 ${rl.retryAfterSec} 秒后再试` }, 429);
    }

    const { email, username, code } = await c.req.json();
    if (!code) return c.json({ error: '请输入验证码' }, 400);

    // 账号维度：把「猜验证码」钉在被攻击账号上（验证码本身有 attempts 上限，
    // 这里是纵深防御，覆盖用户不存在/输入错误等不消耗 attempts 的路径）
    const target = accountKey(email || username);
    if (target) {
      const rlAcct = await checkRateLimit(c.env, `verifyacct:${target}`, {
        limit: 20, windowSec: 900, failOpen: false,
      });
      if (!rlAcct.allowed) {
        return c.json({ error: `验证尝试过多，请 ${rlAcct.retryAfterSec} 秒后再试` }, 429);
      }
    }

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
