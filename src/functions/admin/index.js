/**
 * 管理后台 API（D1）
 */
import {
  listUserSummaries, getAdminStats, getUserByName, saveUser, isAdmin, loadUserFiles, deleteUserRecord,
} from '../utils/users';
import { getSettings, saveSettings } from '../utils/settings';
import { sendTestEmail, sendViolationWarning } from '../utils/email';
import { deleteTelegramMessage, setUserImagesBlocked } from '../upload';
import { setUserBanned } from '../utils/bans';
import { createPreviewTicket } from '../utils/auth';
import {
  kvGet, kvPut, dbDeleteImage, dbGetImage, dbRecentImages, dbGetUserById,
} from '../utils/db';
import { runDbBackup, buildBackupSql, getBackupHistory } from '../utils/backup';

export async function adminUserImages(c) {
  try {
    const username = c.req.param('username');
    const user = await getUserByName(c.env, username);
    if (!user) return c.json({ error: '用户不存在' }, 404);

    const files = await loadUserFiles(c.env, user.id);
    files.sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0));
    const totalSize = files.reduce((sum, f) => sum + (f.fileSize || 0), 0);
    return c.json({ username, files, totalImages: files.length, totalSize });
  } catch (error) {
    console.error('查看用户图片错误:', error);
    return c.json({ error: '获取用户图片失败' }, 500);
  }
}

export async function adminDeleteUserImage(c) {
  try {

    const username = c.req.param('username');
    const fileId = c.req.param('id');
    const user = await getUserByName(c.env, username);
    const img = await dbGetImage(c.env, fileId);

    if (!user && !img) {
      return c.json({ message: '失效记录已清理' });
    }
    if (user && img && String(img.userId) !== String(user.id)) {
      return c.json({ error: '图片不属于该用户，拒绝删除' }, 409);
    }
    if (img && img.messageId) {
      const removed = await deleteTelegramMessage(c.env, img.messageId);
      if (!removed) return c.json({ error: '存储端删除失败，图库记录已保留，请稍后重试' }, 502);
    }
    if (img) await dbDeleteImage(c.env, fileId);
    return c.json({ message: img ? '图片已删除' : '失效记录已清理' });
  } catch (error) {
    console.error('删除用户图片错误:', error);
    return c.json({ error: '删除图片失败' }, 500);
  }
}

export async function adminWarnUser(c) {
  try {

    const username = c.req.param('username');
    const admin = c.get('user');
    const user = await getUserByName(c.env, username);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    if (!user.email) return c.json({ error: '该用户没有邮箱，无法发送提醒' }, 400);

    const settings = await getSettings(c.env);
    const siteName = (settings.site && settings.site.siteName) || '鸭鸭图床';
    let siteUrl = c.env.SITE_URL || '';
    if (!siteUrl) { try { siteUrl = new URL(c.req.url).origin; } catch {} }

    const now = Date.now();
    const deadlineMs = now + 3 * 24 * 60 * 60 * 1000;
    const deadline = new Date(deadlineMs);
    const deadlineText = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`;

    const r = await sendViolationWarning(c.env, user.email, { username: user.username, siteName, siteUrl, deadlineText });
    if (!r.success) {
      return c.json({ error: r.error || '邮件发送失败，请检查后台邮件配置' }, 500);
    }

    try {
      user.lastWarnAt = now;
      user.lastWarnDeadline = deadlineMs;
      user.warnCount = (typeof user.warnCount === 'number' ? user.warnCount : 0) + 1;
      await saveUser(c.env, user);
    } catch (e) {
      console.warn('更新用户提醒字段失败（邮件已发）:', e);
    }

    try {
      const KEY = 'admin:violation_warns';
      const log = (await kvGet(c.env, KEY, { type: 'json' })) || [];
      const entry = {
        id: `${now}-${username}`,
        username,
        email: user.email,
        at: now,
        deadline: deadlineMs,
        by: (admin && admin.username) || 'admin',
      };
      log.unshift(entry);
      await kvPut(c.env, KEY, log.slice(0, 500));
    } catch (e) {
      console.warn('写入提醒日志失败（邮件已发）:', e);
    }

    return c.json({
      message: `已向 ${user.email} 发送违规清理提醒（截止 ${deadlineText}）`,
      lastWarnAt: now,
      lastWarnDeadline: deadlineMs,
    });
  } catch (error) {
    console.error('发送违规提醒错误:', error);
    return c.json({ error: '发送提醒失败' }, 500);
  }
}

export async function adminListWarns(c) {
  try {
    const url = new URL(c.req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
    const username = (url.searchParams.get('username') || '').trim();
    let log = (await kvGet(c.env, 'admin:violation_warns', { type: 'json' })) || [];
    if (!Array.isArray(log)) log = [];
    if (username) log = log.filter((x) => x && x.username === username);
    return c.json({ items: log.slice(0, limit), total: log.length });
  } catch (error) {
    console.error('读取提醒历史错误:', error);
    return c.json({ error: '获取提醒历史失败' }, 500);
  }
}

/** 移除一条提醒记录（用户已清理完毕等场景）；若是该用户最新提醒，同步清除用户上的提醒标记 */
export async function adminDismissWarn(c) {
  try {
    const id = c.req.param('id');
    if (!id) return c.json({ error: '缺少记录 ID' }, 400);
    const KEY = 'admin:violation_warns';
    let log = (await kvGet(c.env, KEY, { type: 'json' })) || [];
    if (!Array.isArray(log)) log = [];
    const entry = log.find((x) => x && x.id === id);
    if (!entry) return c.json({ error: '记录不存在或已移除' }, 404);
    await kvPut(c.env, KEY, log.filter((x) => x && x.id !== id));

    try {
      const user = await getUserByName(c.env, entry.username);
      if (user && user.lastWarnAt === entry.at) {
        user.lastWarnAt = null;
        user.lastWarnDeadline = null;
        await saveUser(c.env, user);
      }
    } catch (e) {
      console.warn('清除用户提醒标记失败（记录已移除）:', e);
    }
    return c.json({ message: '提醒记录已移除' });
  } catch (error) {
    console.error('移除提醒记录错误:', error);
    return c.json({ error: '移除失败' }, 500);
  }
}

export async function adminRecentUploads(c) {
  try {
    const url = new URL(c.req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '60', 10) || 60, 300);
    const items = await dbRecentImages(c.env, limit);
    return c.json({ items, total: items.length });
  } catch (error) {
    console.error('获取最近上传错误:', error);
    return c.json({ error: '获取最近上传失败' }, 500);
  }
}

export async function adminSearchImage(c) {
  try {
    const url = new URL(c.req.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (!q) return c.json({ error: '请输入要查询的文件名' }, 400);

    const res = await c.env.DB.prepare(
      `SELECT i.*, u.username AS username
       FROM images i
       LEFT JOIN users u ON u.id = i.user_id
       WHERE lower(i.file_name) LIKE ? OR lower(i.id) LIKE ?
       ORDER BY i.upload_time DESC
       LIMIT 100`
    ).bind(`%${q}%`, `%${q}%`).all();

    const items = (res.results || []).map((row) => ({
      fileKey: row.id,
      fileName: row.file_name || '',
      fileSize: row.file_size || 0,
      time: row.upload_time || 0,
      userId: row.user_id || null,
      username: row.username || null,
      url: row.url || `/file/${row.id}`,
    }));
    return c.json({ items, truncated: items.length >= 100 });
  } catch (error) {
    console.error('按文件名查图片错误:', error);
    return c.json({ error: '查询失败' }, 500);
  }
}

export async function adminStats(c) {
  try {
    const stats = await getAdminStats(c.env);
    return c.json({ stats });
  } catch (error) {
    console.error('获取后台统计错误:', error);
    return c.json({ error: '获取统计失败', detail: error.message }, 500);
  }
}

export async function adminListUsers(c) {
  try {
    const users = await listUserSummaries(c.env);
    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return c.json({ users, total: users.length });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    return c.json({ error: '获取用户列表失败', detail: error.message }, 500);
  }
}

export async function adminSetUserStatus(c, status) {
  try {

    const username = c.req.param('username');
    const admin = c.get('user');
    if (username === admin.username) return c.json({ error: '不能封禁自己' }, 400);

    const user = await getUserByName(c.env, username);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    if (String(user.id) === String(admin.id) || isAdmin(user.username, c.env)) {
      return c.json({ error: '不能封禁管理员账号' }, 400);
    }

    user.status = status;
    await saveUser(c.env, user);
    await setUserBanned(c.env, user.id, status === 'banned');
    await setUserImagesBlocked(c.env, user.id, status === 'banned');
    return c.json({ message: status === 'banned' ? '用户已封禁' : '用户已解封', status });
  } catch (error) {
    console.error('设置用户状态错误:', error);
    return c.json({ error: '操作失败' }, 500);
  }
}

export async function adminDeleteUser(c) {
  try {

    const username = c.req.param('username');
    const admin = c.get('user');
    if (username === admin.username) return c.json({ error: '不能删除自己' }, 400);

    const user = await getUserByName(c.env, username);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    if (String(user.id) === String(admin.id) || isAdmin(user.username, c.env)) {
      return c.json({ error: '不能删除管理员账号' }, 400);
    }

    if (user.id) {
      try {
        const files = await loadUserFiles(c.env, user.id);
        const MAX_PURGE = 40;
        if (files.length > MAX_PURGE) {
          return c.json({ error: `该用户有 ${files.length} 张图片，请先在图库中分批清理后再删除账号` }, 409);
        }
        for (const f of files) {
          if (f.messageId) {
            const removed = await deleteTelegramMessage(c.env, f.messageId);
            if (!removed) return c.json({ error: '部分图片删除失败；已成功删除的记录已同步，其余可稍后重试' }, 502);
          }
          await dbDeleteImage(c.env, f.id);
        }
      } catch (e) {
        console.warn('清空用户图片出错，账号保留:', e);
        return c.json({ error: '清理用户图片失败；账号已保留，可稍后重试' }, 502);
      }
    }

    await deleteUserRecord(c.env, user);
    return c.json({ message: '用户及其图片已删除' });
  } catch (error) {
    console.error('删除用户错误:', error);
    return c.json({ error: '删除用户失败' }, 500);
  }
}

export async function adminSetUserLimit(c) {
  try {

    const username = c.req.param('username');
    const { uploadLimit } = await c.req.json();
    const user = await getUserByName(c.env, username);
    if (!user) return c.json({ error: '用户不存在' }, 404);
    if (isAdmin(user.username, c.env)) return c.json({ error: '不能修改管理员上传上限' }, 400);

    if (uploadLimit === null || uploadLimit === '' || uploadLimit === undefined) {
      user.uploadLimit = null;
    } else {
      const n = parseInt(uploadLimit, 10);
      if (Number.isNaN(n) || n < 0) return c.json({ error: '上限必须为非负整数' }, 400);
      user.uploadLimit = n;
    }
    await saveUser(c.env, user);
    return c.json({ message: '已更新上传上限', uploadLimit: user.uploadLimit });
  } catch (error) {
    console.error('设置上传上限错误:', error);
    return c.json({ error: '操作失败' }, 500);
  }
}

export async function adminBatchUsers(c) {
  try {

    const admin = c.get('user');
    const { action, usernames, uploadLimit } = await c.req.json();

    if (!['ban', 'unban', 'delete', 'limit'].includes(action)) {
      return c.json({ error: '不支持的操作' }, 400);
    }
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return c.json({ error: '请选择至少一个用户' }, 400);
    }
    if (usernames.length > 500) {
      return c.json({ error: '单次批量操作不超过 500 个用户' }, 400);
    }

    let limitValue = null;
    if (action === 'limit') {
      if (uploadLimit === null || uploadLimit === '' || uploadLimit === undefined) limitValue = null;
      else {
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

        const user = await getUserByName(c.env, username);
        if (!user) { failed.push({ username, error: '用户不存在' }); continue; }
        if (String(user.id) === String(admin.id) || isAdmin(user.username, c.env)) {
          failed.push({ username, error: '不能操作管理员' });
          continue;
        }

        if (action === 'ban') {
          user.status = 'banned';
          await saveUser(c.env, user);
          await setUserBanned(c.env, user.id, true);
          await setUserImagesBlocked(c.env, user.id, true);
        } else if (action === 'unban') {
          user.status = 'active';
          await saveUser(c.env, user);
          await setUserBanned(c.env, user.id, false);
          await setUserImagesBlocked(c.env, user.id, false);
        } else if (action === 'limit') {
          user.uploadLimit = limitValue;
          await saveUser(c.env, user);
        } else if (action === 'delete') {
          if (user.id) {
            const files = await loadUserFiles(c.env, user.id);
            if (files.length) {
              failed.push({ username, error: '请先清空该用户图片，再批量删除账号' });
              continue;
            }
          }
          await deleteUserRecord(c.env, user);
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

export async function adminGetSettings(c) {
  try {
    const settings = await getSettings(c.env);
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
    masked.nsfw = {
      ...settings.nsfw,
      apiKeySet: !!settings.nsfw.apiKey,
      extraParamsSet: !!settings.nsfw.extraParams,
      apiKey: '',
      extraParams: '',
    };
    return c.json({ settings: masked });
  } catch (error) {
    console.error('获取配置错误:', error);
    return c.json({ error: '获取配置失败', detail: error.message }, 500);
  }
}

export async function adminSaveSettings(c) {
  try {
    const patch = await c.req.json();
    await saveSettings(c.env, patch);
    return c.json({ message: '配置已保存' });
  } catch (error) {
    console.error('保存配置错误:', error);
    return c.json({ error: '保存配置失败' }, 500);
  }
}

export async function getAnnouncement(c) {
  try {
    const settings = await getSettings(c.env);
    return c.json({ announcement: settings.announcement, topBar: settings.topBar });
  } catch (error) {
    console.error('获取公告错误:', error);
    return c.json({ announcement: { enabled: false }, topBar: { enabled: false } });
  }
}

export async function getSiteConfig(c) {
  try {
    const settings = await getSettings(c.env);
    return c.json({ site: settings.site });
  } catch (error) {
    console.error('获取站点配置错误:', error);
    return c.json({ site: {} });
  }
}

export async function adminTestEmail(c) {
  try {
    const { to } = await c.req.json();
    if (!to) return c.json({ error: '请填写收件邮箱' }, 400);
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

export async function adminPreviewTicket(c) {
  try {
    const user = c.get('user');
    const ticket = await createPreviewTicket(c.env, { username: user && user.username });
    return c.json({ ticket, expiresIn: 600 });
  } catch (error) {
    console.error('签发预览票错误:', error);
    return c.json({ error: '签发预览票失败' }, 500);
  }
}

// ===== 数据库备份管理 =====

/** 立即执行一次备份（发到 TG 频道并记入历史） */
export async function adminRunBackup(c) {
  try {
    const entry = await runDbBackup(c.env, { trigger: 'manual' });
    if (!entry.ok) {
      return c.json({ error: `备份失败：${entry.error || '未知错误'}`, entry }, 500);
    }
    return c.json({ message: `备份完成：${entry.fileName}`, entry });
  } catch (error) {
    console.error('手动备份错误:', error);
    return c.json({ error: '备份执行失败' }, 500);
  }
}

/** 备份历史（含失败记录，最多 60 条） */
export async function adminBackupHistory(c) {
  try {
    const items = await getBackupHistory(c.env);
    return c.json({ items, total: items.length });
  } catch (error) {
    console.error('读取备份历史错误:', error);
    return c.json({ error: '获取备份历史失败' }, 500);
  }
}

/**
 * 下载历史备份：经 Bot 从 Telegram 取回并透传。
 * fid 必须存在于备份历史中，防止用该接口代理 Bot 可见的任意文件。
 * 注意 Bot 下载上限 20MB，超限时提示到频道手动下载。
 */
export async function adminBackupDownload(c) {
  try {
    const env = c.env;
    const fid = (c.req.query('fid') || '').trim();
    if (!fid) return c.json({ error: '缺少文件标识' }, 400);

    const history = await getBackupHistory(env);
    const entry = history.find((it) => it && it.ok && it.tgFileId === fid);
    if (!entry) return c.json({ error: '备份记录不存在' }, 404);

    const gf = await fetch(
      `https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${encodeURIComponent(fid)}`
    );
    const gd = await gf.json().catch(() => null);
    if (!gd || !gd.ok || !gd.result || !gd.result.file_path) {
      const desc = (gd && gd.description) || `HTTP ${gf.status}`;
      if (/too big/i.test(desc)) {
        return c.json({
          error: '该备份超过 Bot 下载上限（20MB），请到 Telegram 频道手动下载',
          tgLink: entry.tgLink || null,
        }, 413);
      }
      return c.json({ error: `获取备份文件失败：${desc}` }, 502);
    }

    const fres = await fetch(`https://api.telegram.org/file/bot${env.TG_Bot_Token}/${gd.result.file_path}`);
    if (!fres.ok) return c.json({ error: `下载备份文件失败（HTTP ${fres.status}）` }, 502);

    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${entry.fileName || 'backup.sql'}"`);
    headers.set('Cache-Control', 'no-store');
    const len = fres.headers.get('Content-Length');
    if (len) headers.set('Content-Length', len);
    return new Response(fres.body, { status: 200, headers });
  } catch (error) {
    console.error('下载备份错误:', error);
    return c.json({ error: '下载备份失败' }, 500);
  }
}

/** 即时导出：现场生成最新 dump 直接下载，不经过 TG、不记历史 */
export async function adminBackupExport(c) {
  try {
    const { sql } = await buildBackupSql(c.env);
    const dateTag = new Date().toISOString().slice(0, 10);
    const headers = new Headers();
    headers.set('Content-Type', 'application/sql; charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="duckimg-export-${dateTag}.sql"`);
    headers.set('Cache-Control', 'no-store');
    return new Response(sql, { status: 200, headers });
  } catch (error) {
    console.error('即时导出错误:', error);
    return c.json({ error: '导出失败：' + (error && error.message) }, 500);
  }
}
