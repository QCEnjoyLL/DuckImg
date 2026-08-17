import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authenticatedUpload } from './functions/upload';
import { fileHandler } from './functions/file/[id]';
import { register, login, getCurrentUser, updateUserAvatar, getUserProfile, getQuota, changePassword, changeEmail, confirmEmail, forgotPassword, resetPassword, updateUserPrefs } from './functions/user/auth';
import { sendCode, verifyCode } from './functions/user/verify';
import { getUserImages, deleteUserImage, updateImageInfo, searchUserImages, claimUserImage, batchImages } from './functions/user/images';
import { authMiddleware, adminMiddleware } from './functions/utils/auth';
import {
  adminStats, adminListUsers, adminSetUserStatus, adminDeleteUser,
  adminSetUserLimit, adminBatchUsers, adminUserImages, adminDeleteUserImage, adminGetSettings, adminSaveSettings, getAnnouncement, adminTestEmail, getSiteConfig,
  adminRecentUploads, adminSearchImage, adminWarnUser, adminListWarns, adminDismissWarn, adminPreviewTicket,
  adminRunBackup, adminBackupHistory, adminBackupDownload, adminBackupExport
} from './functions/admin/index';
import { maybeRunScheduledBackup } from './functions/utils/backup';

const app = new Hono();

// 安全响应头（全站，含 ASSETS 回退的静态响应）
app.use('/*', async (c, next) => {
  await next();
  try {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'SAMEORIGIN');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // 不设 CSP：页面依赖 jsdelivr CDN 与内联 early-theme 脚本；后续可收紧
  } catch {}
});

// 仅为动态响应提供缓存兜底。Workers Assets 会自行设置 Cache-Control，
// 因此静态资源响应会在上面的 has() 检查处直接保留平台生成的缓存策略。
app.use('/*', async (c, next) => {
  await next();
  try {
    if (c.res && c.res.headers && c.res.headers.has('Cache-Control')) return;
    const p = new URL(c.req.url).pathname;
    if (p.endsWith('.html') || p === '/') {
      c.header('Cache-Control', 'no-cache');
    } else if (p.endsWith('.js') || p.endsWith('.css')) {
      c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    } else if (p.endsWith('.svg') || p.endsWith('.png') || p.endsWith('.ico') || p.endsWith('.woff2')) {
      c.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    }
  } catch {}
});

// —— 业务路由（必须在静态回退之前注册）——

// 上传接口
app.post(
  '/upload',
  bodyLimit({
    maxSize: 50 * 1024 * 1024,
    onError: (c) => c.json({ error: '单次上传请求不能超过 50MB' }, 413),
  }),
  authenticatedUpload,
);

// 文件访问接口
app.get('/file/:id', fileHandler);

// 注意：不要把「/」重定向到 /index.html。
// Workers Assets 会把 /index.html 规范到 /（307），再重定向会形成死循环。
// 根路径与 *.html 一律落到下方 ASSETS 回退。

// 用户认证相关API
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.post('/api/auth/send-code', sendCode);
app.post('/api/auth/verify-code', verifyCode);
app.post('/api/auth/forgot-password', forgotPassword);
app.post('/api/auth/reset-password', resetPassword);
app.get('/api/auth/user', authMiddleware, getCurrentUser);
app.get('/api/auth/profile', authMiddleware, getUserProfile);
app.get('/api/auth/quota', authMiddleware, getQuota);
app.put('/api/auth/avatar', authMiddleware, updateUserAvatar);
app.put('/api/auth/password', authMiddleware, changePassword);
app.post('/api/auth/change-email', authMiddleware, changeEmail);
app.post('/api/auth/confirm-email', authMiddleware, confirmEmail);
app.put('/api/auth/prefs', authMiddleware, updateUserPrefs);

// 用户图片管理相关API
app.get('/api/images', authMiddleware, getUserImages);
app.get('/api/images/search', authMiddleware, searchUserImages);
app.post('/api/images/claim', authMiddleware, claimUserImage);
app.post('/api/images/batch', authMiddleware, batchImages);
app.delete('/api/images/:id', authMiddleware, deleteUserImage);
app.put('/api/images/:id', authMiddleware, updateImageInfo);

// 公开公告接口
app.get('/api/announcement', getAnnouncement);
// 公开站点品牌配置
app.get('/api/site', getSiteConfig);

// 管理后台API（需管理员权限）
app.get('/api/admin/version', adminMiddleware, (c) => {
  const metadata = c.env && c.env.CF_VERSION_METADATA;
  const id = metadata && typeof metadata.id === 'string' && metadata.id
    ? metadata.id
    : 'local';
  const tag = metadata && typeof metadata.tag === 'string' ? metadata.tag : '';
  const deployedAt = metadata && typeof metadata.timestamp === 'string'
    ? metadata.timestamp
    : null;

  c.header('Cache-Control', 'no-store');
  return c.json({
    version: {
      id,
      shortId: id === 'local' ? id : id.slice(0, 8),
      tag,
      deployedAt,
    },
  });
});
app.get('/api/admin/stats', adminMiddleware, adminStats);
app.get('/api/admin/users', adminMiddleware, adminListUsers);
app.get('/api/admin/users/:username/images', adminMiddleware, adminUserImages);
app.get('/api/admin/recent', adminMiddleware, adminRecentUploads);
app.get('/api/admin/search-image', adminMiddleware, adminSearchImage);
app.delete('/api/admin/users/:username/images/:id', adminMiddleware, adminDeleteUserImage);
app.post('/api/admin/users/batch', adminMiddleware, adminBatchUsers);
app.post('/api/admin/users/:username/ban', adminMiddleware, (c) => adminSetUserStatus(c, 'banned'));
app.post('/api/admin/users/:username/unban', adminMiddleware, (c) => adminSetUserStatus(c, 'active'));
app.post('/api/admin/users/:username/limit', adminMiddleware, adminSetUserLimit);
app.post('/api/admin/users/:username/warn', adminMiddleware, adminWarnUser);
app.get('/api/admin/warns', adminMiddleware, adminListWarns);
app.delete('/api/admin/warns/:id', adminMiddleware, adminDismissWarn);
app.get('/api/admin/preview-ticket', adminMiddleware, adminPreviewTicket);
app.delete('/api/admin/users/:username', adminMiddleware, adminDeleteUser);
app.get('/api/admin/settings', adminMiddleware, adminGetSettings);
app.put('/api/admin/settings', adminMiddleware, adminSaveSettings);
app.post('/api/admin/test-email', adminMiddleware, adminTestEmail);

// 数据库备份管理
app.post('/api/admin/backup/run', adminMiddleware, adminRunBackup);
app.get('/api/admin/backup/history', adminMiddleware, adminBackupHistory);
app.get('/api/admin/backup/download', adminMiddleware, adminBackupDownload);
app.get('/api/admin/backup/export', adminMiddleware, adminBackupExport);

// —— 静态回退：Workers Static Assets（不再使用 Sites / __STATIC_CONTENT）——
// html_handling=none 时不会把「/」自动映射到 index.html，这里手动补上。
app.all('*', async (c) => {
  const assets = c.env && c.env.ASSETS;
  if (!assets || typeof assets.fetch !== 'function') {
    return c.text('Static assets binding (ASSETS) missing. Check wrangler [assets] config.', 500);
  }

  try {
    const url = new URL(c.req.url);
    // 根路径 → 首页；避免 404 空页（浏览器有时显示成 500/打不开）
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/index.html';
      const req = new Request(url.toString(), c.req.raw);
      return assets.fetch(req);
    }
    return assets.fetch(c.req.raw);
  } catch (e) {
    console.error(JSON.stringify({
      event: 'assets_fetch_failed',
      error: e && e.message ? e.message : String(e),
    }));
    return c.text('Static asset error', 500);
  }
});

// —— 定时任务（Cron Triggers）：按触发的 cron 表达式分流 ——
// ⚠️ 表达式必须与 wrangler.toml [triggers].crons 完全一致，改任一侧都要同步另一侧，
//    否则备份分支永远不会命中（该时段只会跑一次无害的清理）。
// '17 3 * * *'   每日清理：过期限流桶 + 过期 kv_store 行（tgpath 缓存等）
// '37 19 * * *'  每日备份检查（UTC 19:37 = 北京 03:37）：是否真正执行由后台
//                「自动备份频率」设置（off/daily/weekly/monthly）+ 上次备份时间决定，
//                改频率无需重新部署。
const BACKUP_CRON = '37 19 * * *';

function logScheduledCleanupFailure(table, error) {
  console.warn(JSON.stringify({
    event: 'scheduled_cleanup_failed',
    table,
    error: error && error.message ? error.message : String(error),
  }));
}

async function scheduled(event, env, _ctx) {
  if (event && event.cron === BACKUP_CRON) {
    await maybeRunScheduledBackup(env);
    return;
  }
  const now = Date.now();
  try {
    await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now).run();
  } catch (e) { logScheduledCleanupFailure('rate_limits', e); }
  try {
    await env.DB.prepare('DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at < ?').bind(now).run();
  } catch (e) { logScheduledCleanupFailure('kv_store', e); }
  try {
    await env.DB.prepare('DELETE FROM verification_codes WHERE expires_at < ?').bind(now).run();
  } catch (e) { logScheduledCleanupFailure('verification_codes', e); }
}

export default { fetch: app.fetch, scheduled };
