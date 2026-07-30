/**
 * 用户图片管理 API（D1）
 */
import { deleteTelegramMessage } from '../upload';
import { dbGetImage, dbUpsertImage, dbDeleteImage, dbUserImagesPage } from '../utils/db';

function clampPage(url) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  // ponytail: 上限 5000 支撑收藏/标签/清空等全量场景；超大图库需改前端分页循环
  const limit = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function parseFilters(url) {
  return {
    q: (url.searchParams.get('q') || '').trim(),
    tag: (url.searchParams.get('tag') || '').trim(),
    liked: url.searchParams.get('liked') === '1',
  };
}

export async function getUserImages(c) {
  try {
    const user = c.get('user');
    const url = new URL(c.req.url);
    const { page, limit, offset } = clampPage(url);
    const { q, tag, liked } = parseFilters(url);

    const r = await dbUserImagesPage(c.env, user.id, { q, tag, liked, limit, offset, withStats: true });

    return c.json({
      files: r.files,
      ...r.stats,
      trend: r.trend,
      types: r.types,
      pagination: {
        total: r.total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(r.total / limit) || 1),
      },
      listedCount: r.stats.totalImages,
    });
  } catch (error) {
    console.error('获取用户图片错误:', error);
    return c.json({ error: '获取用户图片失败' }, 500);
  }
}

export async function searchUserImages(c) {
  try {
    const user = c.get('user');
    const url = new URL(c.req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const offset = (page - 1) * limit;
    const { q, tag, liked } = parseFilters(url);

    const r = await dbUserImagesPage(c.env, user.id, { q, tag, liked, limit, offset });
    return c.json({
      files: r.files,
      pagination: {
        total: r.total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(r.total / limit)),
      },
    });
  } catch (error) {
    console.error('搜索用户图片错误:', error);
    return c.json({ error: '搜索用户图片失败' }, 500);
  }
}

export async function deleteUserImage(c) {
  try {
    const user = c.get('user');
    const userId = user.id;
    const fileId = c.req.param('id');
    if (!fileId) return c.json({ error: '文件ID不能为空' }, 400);

    const existing = await dbGetImage(c.env, fileId);
    if (!existing || String(existing.userId) !== String(userId)) {
      return c.json({ error: '无权删除此文件或文件不存在' }, 403);
    }

    await dbDeleteImage(c.env, fileId);
    if (existing.messageId) {
      try { await deleteTelegramMessage(c.env, existing.messageId); } catch (_) {}
    }
    return c.json({ message: '文件删除成功' });
  } catch (error) {
    console.error('删除用户图片错误:', error);
    return c.json({ error: '删除用户图片失败' }, 500);
  }
}

export async function updateImageInfo(c) {
  try {
    const user = c.get('user');
    const userId = user.id;
    const fileId = c.req.param('id');
    const { fileName, tags, liked } = await c.req.json();
    if (!fileId) return c.json({ error: '文件ID不能为空' }, 400);

    const existing = await dbGetImage(c.env, fileId);
    if (!existing || String(existing.userId) !== String(userId)) {
      return c.json({ error: '无权修改此文件或文件不存在' }, 403);
    }

    const next = {
      ...existing,
      userId,
      fileName: fileName || existing.fileName,
      tags: tags || existing.tags || [],
      liked: typeof liked === 'boolean' ? liked : existing.liked,
    };
    await dbUpsertImage(c.env, next);

    return c.json({
      message: '文件信息更新成功',
      file: { id: fileId, ...next },
    });
  } catch (error) {
    console.error('更新图片信息错误:', error);
    return c.json({ error: '更新图片信息失败' }, 500);
  }
}

export async function claimUserImage(c) {
  try {
    const user = c.get('user');
    const userId = user.id;
    const body = await c.req.json().catch(() => ({}));
    let raw = String((body && (body.id || body.url || body.src)) || '').trim();
    if (!raw) return c.json({ error: '请提供图片 id 或直链' }, 400);

    try {
      if (/^https?:\/\//i.test(raw)) raw = new URL(raw).pathname || raw;
    } catch { /* ignore */ }
    raw = raw.replace(/^\/+/, '');
    if (raw.startsWith('file/')) raw = raw.slice(5);
    raw = raw.split('?')[0].split('#')[0];
    if (!raw || raw.length < 8) return c.json({ error: '图片 id 无效' }, 400);
    if (raw.includes('..') || raw.includes('/') || raw.includes('\\')) {
      return c.json({ error: '图片 id 非法' }, 400);
    }

    const fileId = raw;
    const existing = await dbGetImage(c.env, fileId);
    if (existing) {
      if (String(existing.userId) === String(userId)) {
        return c.json({ message: '已在图库中', file: existing, already: true });
      }
      return c.json({ error: '无权认领此图片（归属其他用户）' }, 403);
    }

    const listItem = {
      id: fileId,
      userId,
      fileName: (body && body.fileName) || fileId,
      fileSize: (body && typeof body.fileSize === 'number') ? body.fileSize : 0,
      uploadTime: Date.now(),
      url: `/file/${fileId}`,
    };

    try {
      await dbUpsertImage(c.env, listItem);
    } catch (e) {
      return c.json({ error: '写入图库失败', detail: e && e.message }, 503);
    }

    return c.json({ message: '已加入我的图片', file: listItem });
  } catch (error) {
    console.error('认领图片错误:', error);
    return c.json({ error: '认领失败' }, 500);
  }
}
