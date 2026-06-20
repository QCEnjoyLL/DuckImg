/**
 * 站点配置工具函数
 * 统一存取 config:settings（公告、鉴黄、每日上传上限、是否强制邮箱验证）。
 */

// 默认配置，读取时与已存配置合并，保证缺字段不报错
export const DEFAULT_SETTINGS = {
  announcement: {
    enabled: false,
    title: '',
    content: '',
    version: 0, // 每次修改后递增，用于前端去重弹窗
  },
  nsfw: {
    enabled: false,
    apiUrl: '',
    apiKey: '',
    method: 'POST',      // 'POST'(JSON+Bearer) | 'GET'(查询参数，适配多数免费服务)
    imageParam: 'url',   // 请求体/查询中图片URL的字段名
    extraParams: '',     // GET 附加查询串，如 "key=xxx" 或 "api_user=..&api_secret=.."
    threshold: 0.8,      // 判定违规的分数阈值（部分服务返回0-100，阈值相应填大）
    scorePath: 'score',  // 返回JSON中分数的点路径，如 "predictions.adult" / "nudity.sexual_activity"
  },
  dailyUploadLimit: 0,   // 0 表示不限制
  requireEmailVerify: true,
  allowSvg: true,        // 是否允许上传 SVG（出于安全可在后台关闭）
  // 站点品牌自定义（后台可改，公开可读）
  site: {
    siteName: '鸭鸭图床',  // 站点名称/标题（应用到 Logo 文字与浏览器标题）
    logoUrl: 'https://img2.nloln.de/file/BQACAgUAAyEGAASLVN5eAAJajWouI76K5xQqwB9UMxwJevLAe-rRAAIsHQAChVFwVcRunuaWzrrIPAQ.png',          // 留空使用默认 ./images/logo.svg
    githubUrl: 'https://github.com/QCEnjoyLL/DuckImg',
    helpUrl: '/help.html',
    menuFooter: '© 2025 鸭鸭图床',
    pageFooter: '© 2024-2025 鸭鸭图床 · 基于 Telegram 提供技术支持',
  },
  // 邮件发送配置（可在后台切换 Resend / SMTP）
  email: {
    provider: 'resend',  // 'resend' | 'smtp'
    resend: {
      apiKey: '',        // 留空回退 env.RESEND_API_KEY
      from: '',          // 留空回退 env.RESEND_FROM
    },
    smtp: {
      host: '',
      port: 465,
      username: '',
      password: '',
      encryption: 'ssl', // 'ssl'(465隐式TLS) | 'starttls'(587) | 'none'(25)
      fromAddress: '',
      fromName: '鸭鸭图床',
    },
  },
};

const SETTINGS_KEY = 'config:settings';

/**
 * 深合并默认值与已存配置（仅一层嵌套对象，满足当前结构）
 */
function mergeSettings(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const e = s.email && typeof s.email === 'object' ? s.email : {};
  return {
    announcement: { ...DEFAULT_SETTINGS.announcement, ...(s.announcement || {}) },
    nsfw: { ...DEFAULT_SETTINGS.nsfw, ...(s.nsfw || {}) },
    dailyUploadLimit: typeof s.dailyUploadLimit === 'number' ? s.dailyUploadLimit : DEFAULT_SETTINGS.dailyUploadLimit,
    requireEmailVerify: typeof s.requireEmailVerify === 'boolean' ? s.requireEmailVerify : DEFAULT_SETTINGS.requireEmailVerify,
    allowSvg: typeof s.allowSvg === 'boolean' ? s.allowSvg : DEFAULT_SETTINGS.allowSvg,
    site: { ...DEFAULT_SETTINGS.site, ...(s.site || {}) },
    email: {
      provider: e.provider === 'smtp' ? 'smtp' : 'resend',
      resend: { ...DEFAULT_SETTINGS.email.resend, ...(e.resend || {}) },
      smtp: { ...DEFAULT_SETTINGS.email.smtp, ...(e.smtp || {}) },
    },
  };
}

/**
 * 读取站点配置（始终返回完整结构）。
 * 带模块级内存缓存（per-isolate，约 60s），大幅降低 KV 读次数。
 * config:settings 变化不频繁，60s 内的轻微滞后可接受。
 */
let _settingsCache = null;       // 已合并的完整配置
let _settingsCacheAt = 0;        // 缓存写入时间戳(ms)
const SETTINGS_TTL_MS = 15 * 1000;

export async function getSettings(env) {
  const now = Date.now();
  if (_settingsCache && (now - _settingsCacheAt) < SETTINGS_TTL_MS) {
    return _settingsCache;
  }
  try {
    const stored = await env.users.get(SETTINGS_KEY, { type: 'json' });
    _settingsCache = mergeSettings(stored);
  } catch {
    _settingsCache = mergeSettings(null);
  }
  _settingsCacheAt = now;
  return _settingsCache;
}

/**
 * 保存站点配置（与现有配置合并后写回）
 * patch 可以是部分配置；announcement 修改时自动递增 version。
 */
export async function saveSettings(env, patch) {
  const current = await getSettings(env);

  const next = {
    announcement: { ...current.announcement, ...(patch.announcement || {}) },
    nsfw: { ...current.nsfw, ...(patch.nsfw || {}) },
    dailyUploadLimit: typeof patch.dailyUploadLimit === 'number' ? patch.dailyUploadLimit : current.dailyUploadLimit,
    requireEmailVerify: typeof patch.requireEmailVerify === 'boolean' ? patch.requireEmailVerify : current.requireEmailVerify,
    allowSvg: typeof patch.allowSvg === 'boolean' ? patch.allowSvg : current.allowSvg,
    site: { ...current.site, ...(patch.site || {}) },
    email: current.email,
  };

  // 鉴黄密钥留空则保留原值
  if (patch.nsfw && (patch.nsfw.apiKey === '' || patch.nsfw.apiKey === undefined)) {
    next.nsfw.apiKey = current.nsfw.apiKey;
  }

  // 邮件配置合并：密钥/密码留空则保留原值（前端密码框留空=不修改）
  if (patch.email) {
    const pe = patch.email;
    const merged = {
      provider: pe.provider === 'smtp' ? 'smtp' : (pe.provider === 'resend' ? 'resend' : current.email.provider),
      resend: { ...current.email.resend, ...(pe.resend || {}) },
      smtp: { ...current.email.smtp, ...(pe.smtp || {}) },
    };
    // 空字符串视为"不修改"，保留原密钥/密码
    if (pe.resend && (pe.resend.apiKey === '' || pe.resend.apiKey === undefined)) {
      merged.resend.apiKey = current.email.resend.apiKey;
    }
    if (pe.smtp && (pe.smtp.password === '' || pe.smtp.password === undefined)) {
      merged.smtp.password = current.email.smtp.password;
    }
    next.email = merged;
  }

  // 公告内容/标题/开关有变化时递增版本号，便于前端重新弹窗
  if (patch.announcement) {
    const changed =
      patch.announcement.title !== current.announcement.title ||
      patch.announcement.content !== current.announcement.content ||
      patch.announcement.enabled !== current.announcement.enabled;
    if (changed) {
      next.announcement.version = (current.announcement.version || 0) + 1;
    }
  }

  await env.users.put(SETTINGS_KEY, JSON.stringify(next));
  // 刷新本 isolate 缓存（其他 isolate 在 TTL 内自然过期）
  _settingsCache = next;
  _settingsCacheAt = Date.now();
  return next;
}
