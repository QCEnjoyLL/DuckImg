/**
 * 站点配置（D1 kv_store）
 */
import { kvGet, kvPut } from './db.js';

export const DEFAULT_SETTINGS = {
  announcement: {
    enabled: false,
    title: '',
    content: '',
    version: 0,
  },
  // 顶栏中间的一行公告：有文字才显示，过长前端滚动
  topBar: {
    enabled: false,
    text: '',
  },
  nsfw: {
    enabled: false,
    apiUrl: '',
    apiKey: '',
    method: 'POST',
    imageParam: 'url',
    extraParams: '',
    threshold: 0.8,
    scorePath: 'score',
    // allow: 审核服务故障时放行；block: 故障时拦截。
    failurePolicy: 'allow',
  },
  dailyUploadLimit: 0,
  requireEmailVerify: true,
  allowSvg: true,
  // 自动备份频率：off | daily | weekly | monthly（cron 每天检查一次，改频率即时生效无需部署）
  backup: {
    frequency: 'weekly',
  },
  site: {
    siteName: '鸭鸭图床',
    logoUrl: 'https://img2.nloln.de/file/BQACAgUAAyEGAASLVN5eAAJajWouI76K5xQqwB9UMxwJevLAe-rRAAIsHQAChVFwVcRunuaWzrrIPAQ.png',
    githubUrl: 'https://github.com/QCEnjoyLL/DuckImg',
    helpUrl: '/help.html',
    menuFooter: '© 2025 鸭鸭图床',
    pageFooter: '© 2024-2025 鸭鸭图床 · 基于 Telegram 提供技术支持',
  },
  email: {
    provider: 'resend',
    resend: {
      apiKey: '',
      from: '',
    },
    smtp: {
      host: '',
      port: 465,
      username: '',
      password: '',
      passwordEncrypted: '',
      // 兼容升级前的 Cloudflare Secret；后台保存/清除密码后自动关闭回退。
      passwordUseSecret: true,
      encryption: 'ssl',
      fromAddress: '',
      fromName: '鸭鸭图床',
    },
  },
};

const SETTINGS_KEY = 'config:settings';

const BACKUP_FREQS = ['off', 'daily', 'weekly', 'monthly'];
const EMAIL_PROVIDERS = ['resend', 'smtp'];
const SMTP_ENCRYPTIONS = ['ssl', 'starttls', 'none'];
const NSFW_METHODS = ['GET', 'POST'];
const NSFW_FAILURE_POLICIES = ['allow', 'block'];

export class SettingsValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

function expectObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SettingsValidationError(`${label}格式无效`);
  }
  return value;
}

function normalizeString(value, label, maxLength, { trim = true, singleLine = false } = {}) {
  if (typeof value !== 'string') throw new SettingsValidationError(`${label}必须是文本`);
  const normalized = trim ? value.trim() : value;
  if (normalized.length > maxLength) {
    throw new SettingsValidationError(`${label}不能超过 ${maxLength} 个字符`);
  }
  if (singleLine && /[\r\n]/.test(normalized)) {
    throw new SettingsValidationError(`${label}不能包含换行符`);
  }
  return normalized;
}

function normalizeEnum(value, label, allowed, { uppercase = false } = {}) {
  if (typeof value !== 'string') throw new SettingsValidationError(`${label}无效`);
  const normalized = uppercase ? value.toUpperCase() : value;
  if (!allowed.includes(normalized)) throw new SettingsValidationError(`${label}无效`);
  return normalized;
}

function normalizeNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SettingsValidationError(`${label}必须是非负整数`);
  }
  return value;
}

function normalizeSettingsPatch(patch) {
  const source = expectObject(patch, '配置');
  const normalized = { ...source };

  if (Object.hasOwn(source, 'dailyUploadLimit')) {
    normalized.dailyUploadLimit = normalizeNonNegativeInteger(source.dailyUploadLimit, '每日上传上限');
  }

  if (Object.hasOwn(source, 'announcement')) {
    const value = expectObject(source.announcement, '公告配置');
    normalized.announcement = { ...value };
    if (Object.hasOwn(value, 'title')) normalized.announcement.title = normalizeString(value.title, '公告标题', 200);
    if (Object.hasOwn(value, 'content')) normalized.announcement.content = normalizeString(value.content, '公告内容', 10000, { trim: false });
  }

  if (Object.hasOwn(source, 'topBar')) {
    const value = expectObject(source.topBar, '顶栏公告配置');
    normalized.topBar = { ...value };
    if (Object.hasOwn(value, 'text')) normalized.topBar.text = normalizeString(value.text, '顶栏公告', 300);
  }

  if (Object.hasOwn(source, 'nsfw')) {
    const value = expectObject(source.nsfw, '鉴黄配置');
    normalized.nsfw = { ...value };
    if (Object.hasOwn(value, 'method')) {
      normalized.nsfw.method = normalizeEnum(value.method, '鉴黄请求方式', NSFW_METHODS, { uppercase: true });
    }
    if (Object.hasOwn(value, 'failurePolicy')) {
      normalized.nsfw.failurePolicy = normalizeEnum(value.failurePolicy, '鉴黄异常策略', NSFW_FAILURE_POLICIES);
    }
    if (Object.hasOwn(value, 'threshold')) {
      if (typeof value.threshold !== 'number' || !Number.isFinite(value.threshold) || value.threshold < 0) {
        throw new SettingsValidationError('鉴黄阈值必须是非负数');
      }
    }
    if (Object.hasOwn(value, 'apiUrl')) normalized.nsfw.apiUrl = normalizeString(value.apiUrl, '鉴黄接口地址', 2048, { singleLine: true });
    if (Object.hasOwn(value, 'imageParam')) normalized.nsfw.imageParam = normalizeString(value.imageParam, '图片字段名', 128, { singleLine: true });
    if (Object.hasOwn(value, 'scorePath')) normalized.nsfw.scorePath = normalizeString(value.scorePath, '分数路径', 256, { singleLine: true });
  }

  if (Object.hasOwn(source, 'backup')) {
    const value = expectObject(source.backup, '备份配置');
    normalized.backup = { ...value };
    if (Object.hasOwn(value, 'frequency')) {
      normalized.backup.frequency = normalizeEnum(value.frequency, '备份频率', BACKUP_FREQS);
    }
  }

  if (Object.hasOwn(source, 'site')) {
    const value = expectObject(source.site, '站点配置');
    normalized.site = { ...value };
    const limits = {
      siteName: ['站点名称', 100],
      logoUrl: ['Logo 地址', 2048],
      githubUrl: ['GitHub 地址', 2048],
      helpUrl: ['帮助地址', 2048],
      menuFooter: ['菜单页脚', 1000],
      pageFooter: ['页面页脚', 1000],
    };
    for (const [key, [label, maxLength]] of Object.entries(limits)) {
      if (Object.hasOwn(value, key)) normalized.site[key] = normalizeString(value[key], label, maxLength, { singleLine: true });
    }
  }

  if (Object.hasOwn(source, 'email')) {
    const value = expectObject(source.email, '邮件配置');
    normalized.email = { ...value };
    if (Object.hasOwn(value, 'provider')) {
      normalized.email.provider = normalizeEnum(value.provider, '发信方式', EMAIL_PROVIDERS);
    }
    if (Object.hasOwn(value, 'resend')) {
      const resend = expectObject(value.resend, 'Resend 配置');
      normalized.email.resend = { ...resend };
      if (Object.hasOwn(resend, 'from')) {
        normalized.email.resend.from = normalizeString(resend.from, 'Resend 发件人', 320, { singleLine: true });
      }
    }
    if (Object.hasOwn(value, 'smtp')) {
      const smtp = expectObject(value.smtp, 'SMTP 配置');
      normalized.email.smtp = { ...smtp };
      if (Object.hasOwn(smtp, 'port')) {
        if (!Number.isInteger(smtp.port) || smtp.port < 1 || smtp.port > 65535) {
          throw new SettingsValidationError('SMTP 端口必须是 1–65535 的整数');
        }
      }
      if (Object.hasOwn(smtp, 'encryption')) {
        normalized.email.smtp.encryption = normalizeEnum(smtp.encryption, 'SMTP 加密方式', SMTP_ENCRYPTIONS);
      }
      if (Object.hasOwn(smtp, 'host')) {
        const host = normalizeString(smtp.host, 'SMTP 主机', 255, { singleLine: true });
        if (host && (/[\u0000-\u0020\u007f/]/.test(host) || host.includes('://'))) {
          throw new SettingsValidationError('SMTP 主机格式无效');
        }
        normalized.email.smtp.host = host;
      }
      if (Object.hasOwn(smtp, 'username')) {
        normalized.email.smtp.username = normalizeString(smtp.username, 'SMTP 用户名', 320, { singleLine: true });
      }
      if (Object.hasOwn(smtp, 'fromAddress')) {
        const address = normalizeString(smtp.fromAddress, 'SMTP 发件地址', 320, { singleLine: true });
        if (address && !/^[^\s@<>]+@[^\s@<>]+$/.test(address)) {
          throw new SettingsValidationError('SMTP 发件地址格式无效');
        }
        normalized.email.smtp.fromAddress = address;
      }
      if (Object.hasOwn(smtp, 'fromName')) {
        normalized.email.smtp.fromName = normalizeString(smtp.fromName, 'SMTP 发件人名称', 200, { singleLine: true });
      }
      if (Object.hasOwn(smtp, 'password')) {
        normalized.email.smtp.password = normalizeString(smtp.password, 'SMTP 密码', 512, { trim: false });
      }
      if (Object.hasOwn(smtp, 'clearPassword') && typeof smtp.clearPassword !== 'boolean') {
        throw new SettingsValidationError('清除 SMTP 密码选项无效');
      }
    }
  }

  return normalized;
}

/** 非法值回退 fallback（读取时用默认，保存时用当前值，避免垃圾输入悄悄改变行为） */
function normalizeBackup(b, fallback) {
  const fb = (fallback && BACKUP_FREQS.includes(fallback.frequency)) ? fallback.frequency : DEFAULT_SETTINGS.backup.frequency;
  const freq = b && BACKUP_FREQS.includes(b.frequency) ? b.frequency : fb;
  return { frequency: freq };
}

function mergeSettings(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const e = s.email && typeof s.email === 'object' ? s.email : {};
  const nsfw = s.nsfw && typeof s.nsfw === 'object' ? s.nsfw : {};
  return {
    announcement: { ...DEFAULT_SETTINGS.announcement, ...(s.announcement || {}) },
    topBar: { ...DEFAULT_SETTINGS.topBar, ...(s.topBar || {}) },
    nsfw: {
      ...DEFAULT_SETTINGS.nsfw,
      ...nsfw,
      failurePolicy: nsfw.failurePolicy === 'block' ? 'block' : 'allow',
      apiKey: '',
      extraParams: '',
    },
    dailyUploadLimit: typeof s.dailyUploadLimit === 'number' ? s.dailyUploadLimit : DEFAULT_SETTINGS.dailyUploadLimit,
    requireEmailVerify: typeof s.requireEmailVerify === 'boolean' ? s.requireEmailVerify : DEFAULT_SETTINGS.requireEmailVerify,
    allowSvg: typeof s.allowSvg === 'boolean' ? s.allowSvg : DEFAULT_SETTINGS.allowSvg,
    backup: normalizeBackup(s.backup),
    site: { ...DEFAULT_SETTINGS.site, ...(s.site || {}) },
    email: {
      provider: e.provider === 'smtp' ? 'smtp' : 'resend',
      resend: { ...DEFAULT_SETTINGS.email.resend, ...(e.resend || {}), apiKey: '' },
      smtp: { ...DEFAULT_SETTINGS.email.smtp, ...(e.smtp || {}), password: '' },
    },
  };
}

function containsLegacySecrets(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const e = s.email && typeof s.email === 'object' ? s.email : {};
  return !!(
    (s.nsfw && (s.nsfw.apiKey || s.nsfw.extraParams))
    || (e.resend && e.resend.apiKey)
    || (e.smtp && e.smtp.password)
  );
}

/** 返回可安全持久化/备份的设置副本。 */
export function settingsForStorage(settings) {
  const clean = mergeSettings(settings);
  clean.nsfw.apiKey = '';
  clean.nsfw.extraParams = '';
  clean.email.resend.apiKey = '';
  clean.email.smtp.password = '';
  delete clean.email.smtp.passwordSource;
  delete clean.email.smtp.passwordError;
  return clean;
}

/** 异地备份不携带邮件凭据；恢复后由管理员重新输入。 */
export function settingsForBackup(settings) {
  const clean = settingsForStorage(settings);
  clean.email.smtp.passwordEncrypted = '';
  clean.email.smtp.passwordUseSecret = true;
  return clean;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function settingsEncryptionKey(env, usages) {
  const secret = String((env && env.JWT_SECRET) || '');
  if (!secret) throw new Error('缺少 JWT_SECRET，无法安全保存 SMTP 密码');
  const material = new TextEncoder().encode(`DuckImg settings v1\0${secret}`);
  const keyBytes = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, usages);
}

async function encryptSettingSecret(env, plaintext) {
  const key = await settingsEncryptionKey(env, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(String(plaintext));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return `enc:v1:${bytesToBase64(iv)}:${bytesToBase64(encrypted)}`;
}

async function decryptSettingSecret(env, payload) {
  const parts = String(payload || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('SMTP 密码密文格式无效');
  }
  const key = await settingsEncryptionKey(env, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(parts[2]) },
    key,
    base64ToBytes(parts[3]),
  );
  return new TextDecoder().decode(decrypted);
}

async function withRuntimeSecrets(settings, env) {
  const runtime = mergeSettings(settings);
  runtime.nsfw.apiKey = String((env && env.NSFW_API_KEY) || '');
  runtime.nsfw.extraParams = String((env && env.NSFW_EXTRA_PARAMS) || '');
  runtime.email.resend.apiKey = String((env && env.RESEND_API_KEY) || '');
  const encrypted = String(runtime.email.smtp.passwordEncrypted || '');
  if (encrypted) {
    try {
      runtime.email.smtp.password = await decryptSettingSecret(env, encrypted);
      runtime.email.smtp.passwordSource = 'database';
    } catch (error) {
      runtime.email.smtp.password = '';
      runtime.email.smtp.passwordSource = 'database';
      runtime.email.smtp.passwordError = '已保存的 SMTP 密码无法解密，请重新输入';
      console.error(JSON.stringify({
        event: 'smtp_password_decrypt_failed',
        error: error && error.message ? error.message : String(error),
      }));
    }
  } else if (runtime.email.smtp.passwordUseSecret !== false && env && env.SMTP_PASSWORD) {
    runtime.email.smtp.password = String(env.SMTP_PASSWORD);
    runtime.email.smtp.passwordSource = 'secret';
  } else {
    runtime.email.smtp.password = '';
    runtime.email.smtp.passwordSource = 'none';
  }
  return runtime;
}

let _settingsCache = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL_MS = 60 * 1000;

export async function getSettings(env) {
  const now = Date.now();
  if (_settingsCache && (now - _settingsCacheAt) < SETTINGS_TTL_MS) {
    return _settingsCache;
  }
  try {
    const stored = await kvGet(env, SETTINGS_KEY, { type: 'json' });
    const persisted = settingsForStorage(stored);
    // 旧版本允许把 API Key/SMTP 密码写入 D1；首次读取时主动清除。
    if (containsLegacySecrets(stored)) {
      try { await kvPut(env, SETTINGS_KEY, persisted); } catch { /* 本次仍使用已脱敏的内存副本 */ }
    }
    _settingsCache = await withRuntimeSecrets(persisted, env);
  } catch {
    _settingsCache = await withRuntimeSecrets(mergeSettings(null), env);
  }
  _settingsCacheAt = now;
  return _settingsCache;
}

/** 仅用于隔离测试中的模块缓存，生产请求无需调用。 */
export function resetSettingsCacheForTests() {
  _settingsCache = null;
  _settingsCacheAt = 0;
}

export async function saveSettings(env, patch) {
  patch = normalizeSettingsPatch(patch);
  const current = await getSettings(env);

  const next = {
    announcement: { ...current.announcement, ...(patch.announcement || {}) },
    topBar: patch.topBar
      ? { enabled: !!patch.topBar.enabled, text: String(patch.topBar.text || '').trim().slice(0, 300) }
      : current.topBar,
    nsfw: {
      ...current.nsfw,
      ...(patch.nsfw || {}),
      failurePolicy: patch.nsfw && patch.nsfw.failurePolicy === 'block'
        ? 'block'
        : (patch.nsfw && patch.nsfw.failurePolicy === 'allow' ? 'allow' : current.nsfw.failurePolicy),
      apiKey: current.nsfw.apiKey,
      extraParams: current.nsfw.extraParams,
    },
    dailyUploadLimit: typeof patch.dailyUploadLimit === 'number' ? patch.dailyUploadLimit : current.dailyUploadLimit,
    requireEmailVerify: typeof patch.requireEmailVerify === 'boolean' ? patch.requireEmailVerify : current.requireEmailVerify,
    allowSvg: typeof patch.allowSvg === 'boolean' ? patch.allowSvg : current.allowSvg,
    backup: patch.backup ? normalizeBackup(patch.backup, current.backup) : current.backup,
    site: { ...current.site, ...(patch.site || {}) },
    email: current.email,
  };

  if (patch.email) {
    const pe = patch.email;
    const smtpPatch = pe.smtp && typeof pe.smtp === 'object' ? pe.smtp : {};
    const merged = {
      provider: pe.provider === 'smtp' ? 'smtp' : (pe.provider === 'resend' ? 'resend' : current.email.provider),
      resend: { ...current.email.resend, ...(pe.resend || {}), apiKey: current.email.resend.apiKey },
      smtp: {
        ...current.email.smtp,
        ...smtpPatch,
        password: current.email.smtp.password,
        passwordEncrypted: current.email.smtp.passwordEncrypted,
        passwordUseSecret: current.email.smtp.passwordUseSecret !== false,
      },
    };

    const password = typeof smtpPatch.password === 'string' ? smtpPatch.password : '';
    if (password) {
      if (password.length > 512) throw new Error('SMTP 密码不能超过 512 个字符');
      merged.smtp.passwordEncrypted = await encryptSettingSecret(env, password);
      merged.smtp.passwordUseSecret = false;
      merged.smtp.password = password;
    } else if (smtpPatch.clearPassword === true) {
      merged.smtp.passwordEncrypted = '';
      merged.smtp.passwordUseSecret = false;
      merged.smtp.password = '';
    }
    delete merged.smtp.clearPassword;
    delete merged.smtp.passwordSource;
    delete merged.smtp.passwordError;
    next.email = merged;
  }

  if (patch.announcement) {
    const changed =
      patch.announcement.title !== current.announcement.title ||
      patch.announcement.content !== current.announcement.content ||
      patch.announcement.enabled !== current.announcement.enabled;
    if (changed) {
      next.announcement.version = (current.announcement.version || 0) + 1;
    }
  }

  const persisted = settingsForStorage(next);
  await kvPut(env, SETTINGS_KEY, persisted);
  _settingsCache = await withRuntimeSecrets(persisted, env);
  _settingsCacheAt = Date.now();
  return _settingsCache;
}
