/**
 * 用户图片管理 API（D1）
 */
import { deleteTelegramMessage } from '../upload';
import {
  dbGetImage, dbUpsertImage, dbDeleteImage, dbUserImagesPage,
  dbBatchImagesByIds, dbDeleteImagesByIds, dbUpdateImageTags,
} from '../utils/db';

// 每次批量 ≤40：Telegram 删消息按张算子请求（Workers 配额 50/请求），D1 绑定参数也有 100 上限
export const BATCH_MAX = 40;

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

export async function batchImages(c) {
  try {
    const user = c.get('user');
    const userId = user.id;
    const body = await c.req.json().catch(() => ({}));
    const action = body && body.action;
    const rawIds = Array.isArray(body && body.ids) ? body.ids : [];
    if (rawIds.length > BATCH_MAX) {
      return c.json({ error: `单次批量操作不超过 ${BATCH_MAX} 张图片` }, 400);
    }
    if (rawIds.some((x) => typeof x !== 'string' || !x || x.length > 1024)) {
      return c.json({ error: '图片 id 列表格式不正确' }, 400);
    }
    const ids = [...new Set(rawIds)];
    if (!ids.length) return c.json({ error: '请提供图片 id 列表' }, 400);
    if (action !== 'delete' && action !== 'tag') return c.json({ error: '不支持的操作' }, 400);

    // 只操作确属当前用户的图，其余 id 静默跳过
    const owned = await dbBatchImagesByIds(c.env, userId, ids);
    if (!owned.length) return c.json({ error: '没有可操作的图片' }, 403);

    if (action === 'delete') {
      const results = await Promise.all(owned.map(async (row) => {
        if (!row.message_id) return { id: row.id, deleted: true };
        const removed = await deleteTelegramMessage(c.env, row.message_id);
        return { id: row.id, deleted: removed };
      }));
      const deletedIds = results.filter((r) => r.deleted).map((r) => r.id);
      const failedIds = results.filter((r) => !r.deleted).map((r) => r.id);
      if (deletedIds.length) await dbDeleteImagesByIds(c.env, userId, deletedIds);
      return c.json({
        message: failedIds.length ? '部分图片删除失败，记录已保留以便重试' : '删除成功',
        deleted: deletedIds.length,
        failed: failedIds,
        skipped: ids.length - owned.length,
      }, failedIds.length ? 207 : 200);
    }

    // tag：把新标签合并进每张图现有标签
    if (!Array.isArray(body.tags) || body.tags.length > 20) {
      return c.json({ error: '标签必须为数组且最多 20 个' }, 400);
    }
    const addTags = [];
    for (const tag of body.tags) {
      if (typeof tag !== 'string') return c.json({ error: '标签必须是字符串' }, 400);
      const value = tag.trim();
      if (!value || value.length > 32 || /[\u0000-\u001f\u007f]/.test(value)) {
        return c.json({ error: '每个标签长度需为 1–32 个字符且不能包含控制字符' }, 400);
      }
      if (!addTags.includes(value)) addTags.push(value);
    }
    if (!addTags.length) return c.json({ error: '请提供标签' }, 400);
    const entries = [];
    for (const r of owned) {
      let cur = [];
      try { cur = r.tags ? JSON.parse(r.tags) : []; } catch { cur = []; }
      if (!Array.isArray(cur)) cur = [];
      const merged = [...new Set([...cur, ...addTags])];
      if (merged.length > 20) return c.json({ error: '合并后每张图片最多保留 20 个标签' }, 400);
      entries.push({ id: r.id, tags: merged });
    }
    await dbUpdateImageTags(c.env, userId, entries);
    return c.json({ message: '标签已添加', updated: entries.length, skipped: ids.length - owned.length });
  } catch (error) {
    console.error('批量操作错误:', error);
    return c.json({ error: '批量操作失败' }, 500);
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

    if (existing.messageId) {
      const removed = await deleteTelegramMessage(c.env, existing.messageId);
      if (!removed) return c.json({ error: '存储端删除失败，图库记录已保留，请稍后重试' }, 502);
    }
    await dbDeleteImage(c.env, fileId);
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

    if (fileName !== undefined && typeof fileName !== 'string') {
      return c.json({ error: '文件名必须是字符串' }, 400);
    }
    const normalizedName = fileName === undefined ? existing.fileName : fileName.trim();
    if (!normalizedName || normalizedName.length > 180 || /[\u0000-\u001f\u007f]/.test(normalizedName)) {
      return c.json({ error: '文件名长度需为 1–180 个字符且不能包含控制字符' }, 400);
    }
    const normalizedTags = tags === undefined ? (existing.tags || []) : tags;
    if (!Array.isArray(normalizedTags) || normalizedTags.length > 20) {
      return c.json({ error: '标签必须为数组且最多 20 个' }, 400);
    }
    const cleanTags = [];
    for (const tag of normalizedTags) {
      if (typeof tag !== 'string') return c.json({ error: '标签必须是字符串' }, 400);
      const value = tag.trim();
      if (!value || value.length > 32 || /[\u0000-\u001f\u007f]/.test(value)) {
        return c.json({ error: '每个标签长度需为 1–32 个字符且不能包含控制字符' }, 400);
      }
      if (!cleanTags.includes(value)) cleanTags.push(value);
    }

    const next = {
      ...existing,
      userId,
      fileName: normalizedName,
      tags: cleanTags,
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
    if (!/^[A-Za-z0-9_-]{4,1000}\.(?:jpe?g|png|gif|webp|bmp|svg|ico|avif|heic|heif)$/i.test(raw)) {
      return c.json({ error: '图片 id 非法或格式不受支持' }, 400);
    }

    const fileId = raw;
    const existing = await dbGetImage(c.env, fileId);
    if (existing) {
      if (String(existing.userId) === String(userId)) {
        return c.json({ message: '已在图库中', file: existing, already: true });
      }
      return c.json({ error: '无权认领此图片（归属其他用户）' }, 403);
    }

    const claimedName = body && body.fileName !== undefined ? body.fileName : fileId;
    if (typeof claimedName !== 'string') return c.json({ error: '文件名必须是字符串' }, 400);
    const cleanName = claimedName.trim();
    if (!cleanName || cleanName.length > 180 || /[\u0000-\u001f\u007f]/.test(cleanName)) {
      return c.json({ error: '文件名长度需为 1–180 个字符且不能包含控制字符' }, 400);
    }
    if (body && body.fileSize !== undefined && (!Number.isFinite(body.fileSize) || body.fileSize < 0)) {
      return c.json({ error: '文件大小格式不正确' }, 400);
    }

    const listItem = {
      id: fileId,
      userId,
      fileName: cleanName,
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
