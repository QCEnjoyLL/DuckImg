/**
 * 管理后台相关API（全部需经 adminMiddleware）
 */
import { errorHandling, telemetryData } from '../utils/middleware';
import { listUserSummaries, getAdminStats, getUserByName, saveUser, getUserImageCount, isAdmin, saveUserFiles } from '../utils/users';
import { getSettings, saveSettings } from '../utils/settings';
import { sendTestEmail, sendViolationWarning } from '../utils/email';
import { deleteTelegramMessage, removeFromRecentUploads, removeUserFromRecentUploads, setUserImagesBlocked } from '../upload';
import { setUserBanned } from '../utils/bans';

// 查看指定用户上传的图片（管理员）
export async function adminUserImages(c) {
  try {
    const username = c.req.param('username');
    const user = await getUserByName(c.env, username);
    if (!user) return c.json({ error: '用户不存在' }, 404);

    let files = await c.env.img_url.get(`user:${user.id}:files`, { type: 'json' }) || [];
    files.sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0));
    const totalSize = files.reduce((sum, f) => sum + (f.fileSize || 0), 0);

    return c.json({ username, files, totalImages: files.length, totalSize });
  } catch (error) {
    console.error('查看用户图片错误:', error);
    return c.json({ error: '获取用户图片失败' }, 500);
  }
}

// 删除指定用户的单张图片（管理员定向删除违规图片）
export async function adminDeleteUserImage(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const username = c.req.param('username');
    const fileId = c.req.param('id');
    const user = await getUserByName(c.env, username);

    // 用户已不存在：视为遗留失效条目，仅清理元数据与最近上传日志，仍返回成功
    if (!user) {
      try { await c.env.img_url.delete(fileId); } catch {}
      await removeFromRecentUploads(c.env, [fileId]);
      return c.json({ message: '失效记录已清理' });
    }

    const filesKey = `user:${user.id}:files`;
    let files = await c.env.img_url.get(filesKey, { type: 'json' }) || [];
    const target = files.find(f => f.id === fileId);

    // 容忍“已删除的遗留条目”：即使不在用户文件列表里，也清理元数据与最近上传日志
    if (target) {
      files = files.filter(f => f.id !== fileId);
      await saveUserFiles(c.env, user.id, files);
      if (target.messageId) { try { await deleteTelegramMessage(c.env, target.messageId); } catch {} }
    }
    try { await c.env.img_url.delete(fileId); } catch {}
    await removeFromRecentUploads(c.env, [fileId]);

    return c.json({ message: target ? '图片已删除' : '失效记录已清理' });
  } catch (error) {
    console.error('删除用户图片错误:', error);
    return c.json({ error: '删除图片失败' }, 500);
  }
}

// 一键提醒：向用户发送“限期清理违规图片”邮件
export async function adminWarnUser(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const username = c.req.param('username');
    const user = await getUserByName(c.env, username);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    if (!user.email) return c.json({ error: '该用户没有邮箱，无法发送提醒' }, 400);

    const settings = await getSettings(c.env);
    const siteName = (settings.site && settings.site.siteName) || '鸭鸭图床';
    let siteUrl = c.env.SITE_URL || '';
    if (!siteUrl) { try { siteUrl = new URL(c.req.url).origin; } catch {} }

    const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const deadlineText = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`;

    const r = await sendViolationWarning(c.env, user.email, { username: user.username, siteName, siteUrl, deadlineText });
    if (!r.success) {
      return c.json({ error: r.error || '邮件发送失败，请检查后台邮件配置' }, 500);
    }
    return c.json({ message: `已向 ${user.email} 发送违规清理提醒（截止 ${deadlineText}）` });
  } catch (error) {
    console.error('发送违规提醒错误:', error);
    return c.json({ error: '发送提醒失败' }, 500);
  }
}

// 最近上传（全局，含上传者）：读单个日志键，零扫描
export async function adminRecentUploads(c) {
  try {
    const url = new URL(c.req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '60', 10) || 60, 300);
    const log = await c.env.img_url.get('recent_uploads', { type: 'json' }) || [];
    return c.json({ items: log.slice(0, limit), total: log.length });
  } catch (error) {
    console.error('获取最近上传错误:', error);
    return c.json({ error: '获取最近上传失败' }, 500);
  }
}

// 按文件名查上传者：扫描图片元数据（list 自带 metadata，不逐条读），解析 userId→用户名
export async function adminSearchImage(c) {
  try {
    const url = new URL(c.req.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (!q) return c.json({ error: '请输入要查询的文件名' }, 400);

    const MAX_PAGES = 200;        // 扫描页数上限（每页 1000 个键）
    const MAX_RESULTS = 100;      // 返回结果上限
    const matches = [];
    const nameCache = new Map();  // userId -> username，去重缓存
    let cursor;
    let pages = 0;
    let truncated = false;

    outer:
    do {
      const list = await c.env.img_url.list({ limit: 1000, cursor });
      pages++;
      for (const key of list.keys) {
        const name = key.name;
        // 跳过非图片键
        if (name.startsWith('user:') || name.startsWith('uploadcount:') || name === 'recent_uploads') continue;
        const m = key.metadata || {};
        const fileName = m.fileName || '';
        if (!fileName || !fileName.toLowerCase().includes(q)) continue;

        // 解析上传者用户名
        let username = null;
        if (m.userId) {
          if (nameCache.has(m.userId)) username = nameCache.get(m.userId);
          else {
            username = await c.env.users.get(`userid:${m.userId}`);
            nameCache.set(m.userId, username || null);
          }
        }

        matches.push({
          fileKey: name,
          fileName,
          fileSize: m.fileSize || 0,
          time: m.TimeStamp || 0,
          userId: m.userId || null,
          username: username || null,
          url: `/file/${name}`,
        });
        if (matches.length >= MAX_RESULTS) { truncated = true; break outer; }
      }
      cursor = list.list_complete ? undefined : list.cursor;
      if (pages >= MAX_PAGES) { truncated = !list.list_complete; break; }
    } while (cursor);

    matches.sort((a, b) => (b.time || 0) - (a.time || 0));
    return c.json({ items: matches, truncated });
  } catch (error) {
    console.error('按文件名查图片错误:', error);
    return c.json({ error: '查询失败' }, 500);
  }
}

// 概览统计（低成本：元数据 join，无 per-user 读、无回填写）
export async function adminStats(c) {
  try {
    const stats = await getAdminStats(c.env);
    return c.json({ stats });
  } catch (error) {
    console.error('获取后台统计错误:', error);
    return c.json({ error: '获取统计失败', detail: error.message }, 500);
  }
}

// 用户列表：一次返回全部摘要（KV 元数据 join，零 per-user 读），前端做翻页/排序
export async function adminListUsers(c) {
  try {
    const users = await listUserSummaries(c.env);
    // 默认按注册时间倒序（前端也可再排序）
    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return c.json({ users, total: users.length });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    return c.json({ error: '获取用户列表失败', detail: error.message }, 500);
  }
}

// 封禁/解封用户
export async function adminSetUserStatus(c, status) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const username = c.req.param('username');
    const admin = c.get('user');

    if (username === admin.username) {
      return c.json({ error: '不能封禁自己' }, 400);
    }

    const rawJson = await c.env.users.get(`user:${username}`);
    if (!rawJson) {
      return c.json({ error: '用户不存在' }, 404);
    }

    const rawUser = JSON.parse(rawJson);
    rawUser.status = status;
    await saveUser(c.env, { ...rawUser });
    // 维护封禁集合 + 给其图片打/清屏蔽标记（解封→恢复）
    await setUserBanned(c.env, rawUser.id, status === 'banned');
    await setUserImagesBlocked(c.env, rawUser.id, status === 'banned');

    return c.json({ message: status === 'banned' ? '用户已封禁' : '用户已解封', status });
  } catch (error) {
    console.error('设置用户状态错误:', error);
    return c.json({ error: '操作失败' }, 500);
  }
}

// 删除用户（账户与图片引用）
export async function adminDeleteUser(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const username = c.req.param('username');
    const admin = c.get('user');

    if (username === admin.username) {
      return c.json({ error: '不能删除自己' }, 400);
    }

    const rawJson = await c.env.users.get(`user:${username}`);
    if (!rawJson) {
      return c.json({ error: '用户不存在' }, 404);
    }

    const rawUser = JSON.parse(rawJson);

    // 清空该用户上传的图片：删 Telegram 原图（有 messageId 的新图）+ 删每图 KV 元数据
    if (rawUser.id) {
      try {
        const files = await c.env.img_url.get(`user:${rawUser.id}:files`, { type: 'json' }) || [];
        const MAX_PURGE = 300; // 上限保护，避免单次子请求/KV 操作过多
        let purged = 0;
        for (const f of files) {
          if (purged >= MAX_PURGE) break;
          if (f.messageId) { try { await deleteTelegramMessage(c.env, f.messageId); } catch {} }
          if (f.id) { try { await c.env.img_url.delete(f.id); } catch {} }
          purged++;
        }
        // 删除用户图片列表引用
        await c.env.img_url.delete(`user:${rawUser.id}:files`);
        // 从全局「最近上传」日志移除该用户的全部条目
        await removeUserFromRecentUploads(c.env, rawUser.id);
      } catch (e) {
        console.warn('清空用户图片出错（忽略，仍继续删账户）:', e);
      }
    }

    // 删除账户相关 key
    await c.env.users.delete(`user:${username}`);
    if (rawUser.id) await c.env.users.delete(`userid:${rawUser.id}`);
    if (rawUser.email) await c.env.users.delete(`email:${rawUser.email}`);
    if (rawUser.id) { try { await setUserBanned(c.env, rawUser.id, false); } catch {} }

    return c.json({ message: '用户及其图片已删除' });
  } catch (error) {
    console.error('删除用户错误:', error);
    return c.json({ error: '删除用户失败' }, 500);
  }
}

// 设置用户每日上传上限（null 表示恢复使用全局设置）
export async function adminSetUserLimit(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const username = c.req.param('username');
    const { uploadLimit } = await c.req.json();

    const rawJson = await c.env.users.get(`user:${username}`);
    if (!rawJson) {
      return c.json({ error: '用户不存在' }, 404);
    }

    const rawUser = JSON.parse(rawJson);
    if (uploadLimit === null || uploadLimit === '' || uploadLimit === undefined) {
      rawUser.uploadLimit = null;
    } else {
      const n = parseInt(uploadLimit, 10);
      if (Number.isNaN(n) || n < 0) {
        return c.json({ error: '上限必须为非负整数' }, 400);
      }
      rawUser.uploadLimit = n;
    }
    await saveUser(c.env, { ...rawUser });

    return c.json({ message: '已更新上传上限', uploadLimit: rawUser.uploadLimit });
  } catch (error) {
    console.error('设置上传上限错误:', error);
    return c.json({ error: '操作失败' }, 500);
  }
}

// 批量管理用户：ban / unban / delete / limit
export async function adminBatchUsers(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const admin = c.get('user');
    const { action, usernames, uploadLimit } = await c.req.json();

    if (!['ban', 'unban', 'delete', 'limit'].includes(action)) {
      return c.json({ error: '不支持的操作' }, 400);
    }
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return c.json({ error: '请选择至少一个用户' }, 400);
    }
    if (usernames.length > 100) {
      return c.json({ error: '单次批量操作不超过 100 个用户' }, 400);
    }

    // limit 动作预先解析上限值
    let limitValue = null;
    if (action === 'limit') {
      if (uploadLimit === null || uploadLimit === '' || uploadLimit === undefined) {
        limitValue = null;
      } else {
        const n = parseInt(uploadLimit, 10);
        if (Number.isNaN(n) || n < 0) return c.json({ error: '上限必须为非负整数' }, 400);
        limitValue = n;
      }
    }

    let ok = 0;
    const failed = [];

    for (const username of usernames) {
      try {
        if (username === admin.username) { failed.push({ username, error: '不能操作自己' }); continue; }
        if (isAdmin(username, c.env)) { failed.push({ username, error: '不能操作管理员' }); continue; }

        const rawJson = await c.env.users.get(`user:${username}`);
        if (!rawJson) { failed.push({ username, error: '用户不存在' }); continue; }
        const rawUser = JSON.parse(rawJson);

        if (action === 'ban') {
          rawUser.status = 'banned';
          await saveUser(c.env, { ...rawUser });
          await setUserBanned(c.env, rawUser.id, true);
          await setUserImagesBlocked(c.env, rawUser.id, true);
        } else if (action === 'unban') {
          rawUser.status = 'active';
          await saveUser(c.env, { ...rawUser });
          await setUserBanned(c.env, rawUser.id, false);
          await setUserImagesBlocked(c.env, rawUser.id, false);
        } else if (action === 'limit') {
          rawUser.uploadLimit = limitValue;
          await saveUser(c.env, { ...rawUser });
        } else if (action === 'delete') {
          await c.env.users.delete(`user:${username}`);
          if (rawUser.id) await c.env.users.delete(`userid:${rawUser.id}`);
          if (rawUser.email) await c.env.users.delete(`email:${rawUser.email}`);
          if (rawUser.id) { try { await c.env.img_url.delete(`user:${rawUser.id}:files`); } catch {} }
          if (rawUser.id) { try { await removeUserFromRecentUploads(c.env, rawUser.id); } catch {} }
          if (rawUser.id) { try { await setUserBanned(c.env, rawUser.id, false); } catch {} }
        }
        ok++;
      } catch (e) {
        failed.push({ username, error: '处理失败' });
      }
    }

    return c.json({ ok, failed, total: usernames.length });
  } catch (error) {
    console.error('批量操作用户错误:', error);
    return c.json({ error: '批量操作失败' }, 500);
  }
}

// 读取站点配置
export async function adminGetSettings(c) {
  try {
    const settings = await getSettings(c.env);
    // 脱敏：不把密钥/密码回传到浏览器，改用是否已配置的标记
    const masked = {
      ...settings,
      email: {
        provider: settings.email.provider,
        resend: {
          from: settings.email.resend.from,
          apiKeySet: !!settings.email.resend.apiKey,
          apiKey: '',
        },
        smtp: {
          ...settings.email.smtp,
          passwordSet: !!settings.email.smtp.password,
          password: '',
        },
      },
    };
    // nsfw.apiKey 同样脱敏
    masked.nsfw = { ...settings.nsfw, apiKeySet: !!settings.nsfw.apiKey, apiKey: '' };
    return c.json({ settings: masked });
  } catch (error) {
    console.error('获取配置错误:', error);
    return c.json({ error: '获取配置失败', detail: error.message }, 500);
  }
}

// 保存站点配置
export async function adminSaveSettings(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const patch = await c.req.json();
    const settings = await saveSettings(c.env, patch);
    return c.json({ message: '配置已保存' });
  } catch (error) {
    console.error('保存配置错误:', error);
    return c.json({ error: '保存配置失败' }, 500);
  }
}

// 公开公告接口（无需登录）
export async function getAnnouncement(c) {
  try {
    const settings = await getSettings(c.env);
    return c.json({ announcement: settings.announcement });
  } catch (error) {
    console.error('获取公告错误:', error);
    return c.json({ announcement: { enabled: false } });
  }
}

// 公开站点品牌配置（无需登录，供各页应用 Logo/页脚/菜单链接）
export async function getSiteConfig(c) {
  try {
    const settings = await getSettings(c.env);
    return c.json({ site: settings.site });
  } catch (error) {
    console.error('获取站点配置错误:', error);
    return c.json({ site: {} });
  }
}

// 测试发信：用当前邮件配置给指定邮箱发一封测试邮件
export async function adminTestEmail(c) {
  try {
    await errorHandling(c);
    telemetryData(c);

    const { to } = await c.req.json();
    if (!to) {
      return c.json({ error: '请填写收件邮箱' }, 400);
    }

    const result = await sendTestEmail(c.env, to);
    if (!result.success) {
      return c.json({ error: result.error || '测试邮件发送失败', notConfigured: !!result.notConfigured }, 500);
    }
    return c.json({ message: '测试邮件已发送，请查收' });
  } catch (error) {
    console.error('测试发信错误:', error);
    return c.json({ error: '测试发信失败', detail: error.message }, 500);
  }
}