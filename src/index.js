import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import { authenticatedUpload } from './functions/upload';
import { fileHandler } from './functions/file/[id]';
import { register, login, getCurrentUser, updateUserAvatar, getUserProfile, getQuota, changePassword, changeEmail, confirmEmail, forgotPassword, resetPassword } from './functions/user/auth';
import { sendCode, verifyCode } from './functions/user/verify';
import { getUserImages, deleteUserImage, updateImageInfo, searchUserImages } from './functions/user/images';
import { authMiddleware, adminMiddleware } from './functions/utils/auth';
import {
  adminStats, adminListUsers, adminSetUserStatus, adminDeleteUser,
  adminSetUserLimit, adminBatchUsers, adminUserImages, adminDeleteUserImage, adminGetSettings, adminSaveSettings, getAnnouncement, adminTestEmail, getSiteConfig,
  adminRecentUploads, adminSearchImage, adminWarnUser
} from './functions/admin/index';

const app = new Hono();

// 静态文本资源（html/js/css）不缓存：保证部署后浏览器/边缘立即取到最新
// 图片 /file/* 与 /images/* 不受影响，仍各自缓存
app.use('/*', async (c, next) => {
  await next();
  try {
    const p = new URL(c.req.url).pathname;
    if (p.endsWith('.html') || p.endsWith('.js') || p.endsWith('.css') || p === '/') {
      c.header('Cache-Control', 'no-cache');
    }
  } catch {}
});

// 静态文件服务
app.get('/*', serveStatic({ root: './' }));

// 上传接口
app.post('/upload', authenticatedUpload);

// 文件访问接口
app.get('/file/:id', fileHandler);

// 根路径重定向到index.html
app.get('/', (c) => c.redirect('/index.html'));

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

// 用户图片管理相关API
app.get('/api/images', authMiddleware, getUserImages);
app.get('/api/images/search', authMiddleware, searchUserImages);
app.delete('/api/images/:id', authMiddleware, deleteUserImage);
app.put('/api/images/:id', authMiddleware, updateImageInfo);

// 公开公告接口
app.get('/api/announcement', getAnnouncement);
// 公开站点品牌配置
app.get('/api/site', getSiteConfig);

// 管理后台API（需管理员权限）
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
app.delete('/api/admin/users/:username', adminMiddleware, adminDeleteUser);
app.get('/api/admin/settings', adminMiddleware, adminGetSettings);
app.put('/api/admin/settings', adminMiddleware, adminSaveSettings);
app.post('/api/admin/test-email', adminMiddleware, adminTestEmail);

export default app;
