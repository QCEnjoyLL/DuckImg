/**
 * 认证端点返回码与限流的回归测试。
 *
 * 覆盖两个真实问题：
 *  1. send-code 对「邮箱域名不可收信 / 一次性邮箱」返回 500 —— 那是用户输入问题，
 *     应为 4xx；当成 500 会把"邮箱写错了"显示成"网站坏了"。
 *  2. 发码的账号维度限流要有短冷却 + 窗口上限两层，且不能一上来就锁 15 分钟。
 */
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const jsonHeaders = { 'content-type': 'application/json' };

function post(path, body, init = {}) {
  return exports.default.fetch(`https://duckimg.test${path}`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
    ...init,
  });
}

describe('send-code 返回码语义', () => {
  it('一次性邮箱域名 → 400（客户端输入问题，不是 500）', async () => {
    const res = await post('/api/auth/send-code', { email: `probe-${Date.now()}@mailinator.com` });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(String(body.error || '')).toMatch(/一次性|临时邮箱/);
  });

  it('格式非法的邮箱 → 400', async () => {
    const res = await post('/api/auth/send-code', { email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('缺少邮箱与用户名 → 400', async () => {
    const res = await post('/api/auth/send-code', {});
    expect(res.status).toBe(400);
  });
});

describe('发码限流分层', () => {
  it('同一邮箱短时间重复请求会被短冷却拦下（且重试秒数很短）', async () => {
    // 用一次性域名会先在 clientError 处返回 400，所以这里用真实域名走限流路径；
    // 由于限流在发信之前判定，即使域名不可达也不会真的发信。
    const email = `cool-${crypto.randomUUID()}@mailinator.com`;
    // 第一次可能因一次性域名返回 400，但限流计数已经发生
    await post('/api/auth/send-code', { email });
    const second = await post('/api/auth/send-code', { email });
    expect(second.status).toBe(429);
    const body = await second.json();
    // 短冷却（60 秒窗口）应给出很小的重试秒数，而不是 800+
    const secs = Number((String(body.error).match(/(\d+)\s*秒/) || [])[1] || 0);
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(60);
  });
});
