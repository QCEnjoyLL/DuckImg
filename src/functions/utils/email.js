/**
 * 邮件发送工具函数
 * 支持 Resend 与 SMTP 两种发信方式，由后台站点配置 email.provider 切换。
 */
import { getSettings } from './settings';
import { sendMail as sendViaSmtp } from './smtp';

/**
 * 生成 6 位数字验证码
 */
export function generateCode() {
  // crypto.getRandomValues 在 Workers 中可用，避免 Math.random
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const code = (arr[0] % 1000000).toString().padStart(6, '0');
  return code;
}

// 通过 Resend 发送
async function sendViaResend(apiKey, from, { to, subject, html }) {
  if (!apiKey || !from) {
    return { success: false, notConfigured: true, error: 'Resend 未配置' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const data = await res.json();
        detail = data.message || JSON.stringify(data);
      } catch {
        detail = `HTTP ${res.status}`;
      }
      console.error('Resend 发送失败:', detail);
      return { success: false, error: `Resend 发送失败: ${detail}` };
    }
    return { success: true };
  } catch (error) {
    console.error('Resend 网络错误:', error);
    return { success: false, error: 'Resend 发送失败（网络错误）' };
  }
}

/**
 * 根据站点配置选择发信方式，发送一封邮件。
 * 返回 { success, error?, notConfigured? }
 */
export async function sendMail(env, { to, subject, html }) {
  const settings = await getSettings(env);
  const cfg = settings.email || {};

  if (cfg.provider === 'smtp' && cfg.smtp && cfg.smtp.host) {
    return sendViaSmtp(cfg.smtp, { to, subject, html });
  }

  // 默认 Resend：配置留空则回退到环境变量
  const apiKey = (cfg.resend && cfg.resend.apiKey) || env.RESEND_API_KEY;
  const from = (cfg.resend && cfg.resend.from) || env.RESEND_FROM;
  return sendViaResend(apiKey, from, { to, subject, html });
}

// 验证码邮件 HTML 模板
function verificationHtml(code) {
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#4361ee;margin-bottom:8px;">鸭鸭图床 邮箱验证</h2>
      <p style="color:#444;">您的验证码为：</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1f2937;background:#f3f4f6;padding:16px;text-align:center;border-radius:8px;margin:12px 0;">${code}</div>
      <p style="color:#888;font-size:13px;">验证码 10 分钟内有效，请勿泄露给他人。如非本人操作请忽略本邮件。</p>
    </div>
  `;
}

/**
 * 发送验证码邮件（按当前 provider）。
 */
export async function sendVerificationCode(email, code, env) {
  return sendMail(env, {
    to: email,
    subject: '鸭鸭图床 邮箱验证码',
    html: verificationHtml(code),
  });
}

/**
 * 发送违规内容清理提醒邮件（后台「一键提醒」使用）。
 * 返回 { success, error?, notConfigured? }
 */
export async function sendViolationWarning(env, to, { username, siteName, siteUrl, deadlineText } = {}) {
  const name = siteName || '鸭鸭图床';
  const manageUrl = siteUrl ? `${siteUrl}/dashboard.html` : '/dashboard.html';
  const hi = username ? `${username} 您好：` : '您好：';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#333;line-height:1.75;">
      <h2 style="color:#ef4444;margin:0 0 14px;">⚠️ 违规内容清理提醒</h2>
      <p>${hi}</p>
      <p>我们在内容审核中发现，您在 <b>${name}</b> 上传的图片中存在<b>违反法律法规或本站规定</b>的内容（例如：色情低俗、暴力血腥、侵权或其他违法不良信息）。</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:14px 0;">
        请于 <b>3 天内（截止 ${deadlineText || '3 天后'}）</b> 登录账户，自行删除全部违规图片。<br>
        <b>逾期未处理，我们将封禁您的账户并清除相关图片</b>，由此产生的一切后果由您自行承担。
      </div>
      <p>处理方式：登录后进入「我的图片」，逐一删除违规内容。<br>
         管理地址：<a href="${manageUrl}" style="color:#4361ee;">${manageUrl}</a></p>
      <p style="color:#888;font-size:13px;margin-top:18px;">本邮件由 ${name} 管理团队发送。若您认为存在误判，请尽快回复本邮件或联系管理员申诉。请勿再上传任何违规内容，感谢您的配合。</p>
    </div>`;
  return sendMail(env, { to, subject: `【${name}】违规内容清理提醒（请于 3 天内处理）`, html });
}

/**
 * 发送测试邮件（后台"测试发信"使用）。
 */
export async function sendTestEmail(env, to) {
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#4361ee;">鸭鸭图床 邮件配置测试</h2>
      <p style="color:#444;">这是一封测试邮件。如果你收到它，说明当前发信配置可正常工作。</p>
      <p style="color:#888;font-size:13px;">发送时间：${new Date().toUTCString()}</p>
    </div>
  `;
  return sendMail(env, { to, subject: '鸭鸭图床 邮件配置测试', html });
}
