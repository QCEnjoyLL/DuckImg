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
      encryption: 'ssl',
      fromAddress: '',
      fromName: '鸭鸭图床',
    },
  },
};

const SETTINGS_KEY = 'config:settings';

const BACKUP_FREQS = ['off', 'daily', 'weekly', 'monthly'];

/** 非法值回退 fallback（读取时用默认，保存时用当前值，避免垃圾输入悄悄改变行为） */
function normalizeBackup(b, fallback) {
  const fb = (fallback && BACKUP_FREQS.includes(fallback.frequency)) ? fallback.frequency : DEFAULT_SETTINGS.backup.frequency;
  const freq = b && BACKUP_FREQS.includes(b.frequency) ? b.frequency : fb;
  return { frequency: freq };
}

function mergeSettings(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const e = s.email && typeof s.email === 'object' ? s.email : {};
  return {
    announcement: { ...DEFAULT_SETTINGS.announcement, ...(s.announcement || {}) },
    topBar: { ...DEFAULT_SETTINGS.topBar, ...(s.topBar || {}) },
    nsfw: { ...DEFAULT_SETTINGS.nsfw, ...(s.nsfw || {}) },
    dailyUploadLimit: typeof s.dailyUploadLimit === 'number' ? s.dailyUploadLimit : DEFAULT_SETTINGS.dailyUploadLimit,
    requireEmailVerify: typeof s.requireEmailVerify === 'boolean' ? s.requireEmailVerify : DEFAULT_SETTINGS.requireEmailVerify,
    allowSvg: typeof s.allowSvg === 'boolean' ? s.allowSvg : DEFAULT_SETTINGS.allowSvg,
    backup: normalizeBackup(s.backup),
    site: { ...DEFAULT_SETTINGS.site, ...(s.site || {}) },
    email: {
      provider: e.provider === 'smtp' ? 'smtp' : 'resend',
      resend: { ...DEFAULT_SETTINGS.email.resend, ...(e.resend || {}) },
      smtp: { ...DEFAULT_SETTINGS.email.smtp, ...(e.smtp || {}) },
    },
  };
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
    _settingsCache = mergeSettings(stored);
  } catch {
    _settingsCache = mergeSettings(null);
  }
  _settingsCacheAt = now;
  return _settingsCache;
}

export async function saveSettings(env, patch) {
  const current = await getSettings(env);

  const next = {
    announcement: { ...current.announcement, ...(patch.announcement || {}) },
    topBar: patch.topBar
      ? { enabled: !!patch.topBar.enabled, text: String(patch.topBar.text || '').trim().slice(0, 300) }
      : current.topBar,
    nsfw: { ...current.nsfw, ...(patch.nsfw || {}) },
    dailyUploadLimit: typeof patch.dailyUploadLimit === 'number' ? patch.dailyUploadLimit : current.dailyUploadLimit,
    requireEmailVerify: typeof patch.requireEmailVerify === 'boolean' ? patch.requireEmailVerify : current.requireEmailVerify,
    allowSvg: typeof patch.allowSvg === 'boolean' ? patch.allowSvg : current.allowSvg,
    backup: patch.backup ? normalizeBackup(patch.backup, current.backup) : current.backup,
    site: { ...current.site, ...(patch.site || {}) },
    email: current.email,
  };

  if (patch.nsfw && (patch.nsfw.apiKey === '' || patch.nsfw.apiKey === undefined)) {
    next.nsfw.apiKey = current.nsfw.apiKey;
  }

  if (patch.email) {
    const pe = patch.email;
    const merged = {
      provider: pe.provider === 'smtp' ? 'smtp' : (pe.provider === 'resend' ? 'resend' : current.email.provider),
      resend: { ...current.email.resend, ...(pe.resend || {}) },
      smtp: { ...current.email.smtp, ...(pe.smtp || {}) },
    };
    if (pe.resend && (pe.resend.apiKey === '' || pe.resend.apiKey === undefined)) {
      merged.resend.apiKey = current.email.resend.apiKey;
    }
    if (pe.smtp && (pe.smtp.password === '' || pe.smtp.password === undefined)) {
      merged.smtp.password = current.email.smtp.password;
    }
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

  await kvPut(env, SETTINGS_KEY, next);
  _settingsCache = next;
  _settingsCacheAt = Date.now();
  return next;
}
