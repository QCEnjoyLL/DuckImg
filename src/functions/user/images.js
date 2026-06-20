/**
 * 用户图片管理相关API
 */
import { errorHandling, telemetryData } from '../utils/middleware';
import { saveUserFiles } from '../utils/users';
import { deleteTelegramMessage, removeFromRecentUploads } from '../upload';

// 获取用户图片列表
export async function getUserImages(c) {
  try {
    // 错误处理和遥测数据
    await errorHandling(c);
    telemetryData(c);

    const user = c.get('user');
    const userId = user.id;

    console.log('获取用户图片 - 用户信息:', JSON.stringify(user));
    console.log('获取用户图片 - 用户ID:', userId);

    // 获取分页参数
    const url = new URL(c.req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    console.log('获取用户图片 - 分页参数:', { page, limit, offset });

    // 获取用户的文件列表
    const userFilesKey = `user:${userId}:files`;
    console.log('获取用户图片 - 文件列表键:', userFilesKey);

    let userFiles = await c.env.img_url.get(userFilesKey, { type: "json" }) || [];
    console.log('获取用户图片 - 文件列表:', userFiles.length ? `找到${userFiles.length}个文件` : '列表为空');

    // 按上传时间倒序排序
    userFiles.sort((a, b) => b.uploadTime - a.uploadTime);

    // 基于完整列表（分页前）计算统计信息
    const totalFiles = userFiles.length;
    const totalSize = userFiles.reduce((sum, file) => sum + (file.fileSize || 0), 0);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentUploads = userFiles.filter(file => (file.uploadTime || 0) >= sevenDaysAgo).length;
    const averageFileSize = totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0;

    // 分页
    const paginatedFiles = userFiles.slice(offset, offset + limit);

    return c.json({
      files: paginatedFiles,
      // 统计信息（供仪表盘统计卡片使用）
      totalImages: totalFiles,
      totalSize,
      recentUploads,
      averageFileSize,
      pagination: {
        total: totalFiles,
        page,
        limit,
        totalPages: Math.ceil(totalFiles / limit)
      }
    });
  } catch (error) {
    console.error('获取用户图片错误:', error);
    return c.json({ error: '获取用户图片失败' }, 500);
  }
}

// 删除用户图片
export async function deleteUserImage(c) {
  try {
    // 错误处理和遥测数据
    await errorHandling(c);
    telemetryData(c);

    const user = c.get('user');
    const userId = user.id;
    const fileId = c.req.param('id');

    if (!fileId) {
      return c.json({ error: '文件ID不能为空' }, 400);
    }

    // 以用户文件列表作为归属凭证（兼容缺少 userId 元数据的老图片）
    const userFilesKey = `user:${userId}:files`;
    let userFiles = await c.env.img_url.get(userFilesKey, { type: "json" }) || [];

    const ownsFile = userFiles.some(file => file.id === fileId);
    if (!ownsFile) {
      // 不在用户列表中，才视为无权或不存在
      return c.json({ error: '无权删除此文件或文件不存在' }, 403);
    }

    // 取出该文件（用于删除 Telegram 原图）
    const target = userFiles.find(file => file.id === fileId);

    // 从列表中移除文件并保存
    userFiles = userFiles.filter(file => file.id !== fileId);
    await saveUserFiles(c.env, userId, userFiles);

    // 删除 Telegram 原图（新图带 messageId）+ 删除文件元数据（缺失不报错）
    if (target && target.messageId) {
      try { await deleteTelegramMessage(c.env, target.messageId); } catch (e) { /* ignore */ }
    }
    try {
      await c.env.img_url.delete(fileId);
    } catch (e) {
      console.warn('删除文件元数据失败（忽略）:', fileId, e);
    }
    // 同步从全局「最近上传」日志移除，避免后台审核遗留失效条目
    await removeFromRecentUploads(c.env, [fileId]);

    return c.json({ message: '文件删除成功' });
  } catch (error) {
    console.error('删除用户图片错误:', error);
    return c.json({ error: '删除用户图片失败' }, 500);
  }
}

// 更新图片信息
export async function updateImageInfo(c) {
  try {
    // 错误处理和遥测数据
    await errorHandling(c);
    telemetryData(c);

    const user = c.get('user');
    const userId = user.id;
    const fileId = c.req.param('id');
    const { fileName, tags } = await c.req.json();

    if (!fileId) {
      return c.json({ error: '文件ID不能为空' }, 400);
    }

    // 以用户文件列表作为归属凭证（兼容老图片元数据缺 userId）
    const userFilesKey = `user:${userId}:files`;
    let userFiles = await c.env.img_url.get(userFilesKey, { type: "json" }) || [];

    if (!userFiles.some(file => file.id === fileId)) {
      return c.json({ error: '无权修改此文件或文件不存在' }, 403);
    }

    // 获取文件元数据（可能不存在/不完整，做兜底）
    const fileData = await c.env.img_url.getWithMetadata(fileId);
    const existingMetadata = (fileData && fileData.metadata) ? fileData.metadata : {};

    // 更新元数据
    const updatedMetadata = {
      ...existingMetadata,
      userId: existingMetadata.userId || userId,
      fileName: fileName || existingMetadata.fileName || fileId,
      tags: tags || existingMetadata.tags || [],
      updatedAt: Date.now()
    };

    // 保存更新后的元数据
    await c.env.img_url.put(fileId, "", { metadata: updatedMetadata });

    // 更新用户文件列表中的文件信息
    userFiles = userFiles.map(file => {
      if (file.id === fileId) {
        return {
          ...file,
          fileName: fileName || file.fileName,
          tags: tags || file.tags
        };
      }
      return file;
    });

    // 保存更新后的文件列表
    await saveUserFiles(c.env, userId, userFiles);

    return c.json({
      message: '文件信息更新成功',
      file: {
        id: fileId,
        ...updatedMetadata
      }
    });
  } catch (error) {
    console.error('更新图片信息错误:', error);
    return c.json({ error: '更新图片信息失败' }, 500);
  }
}

// 搜索用户图片
export async function searchUserImages(c) {
  try {
    // 错误处理和遥测数据
    await errorHandling(c);
    telemetryData(c);

    const user = c.get('user');
    const userId = user.id;

    // 获取搜索参数
    const url = new URL(c.req.url);
    const query = url.searchParams.get('q') || '';
    const tag = url.searchParams.get('tag') || '';

    // 获取用户的文件列表
    const userFilesKey = `user:${userId}:files`;
    let userFiles = await c.env.img_url.get(userFilesKey, { type: "json" }) || [];

    // 根据查询条件过滤
    if (query) {
      userFiles = userFiles.filter(file =>
        file.fileName.toLowerCase().includes(query.toLowerCase())
      );
    }

    if (tag) {
      userFiles = userFiles.filter(file =>
        file.tags && file.tags.includes(tag)
      );
    }

    // 按上传时间倒序排序
    userFiles.sort((a, b) => b.uploadTime - a.uploadTime);

    return c.json({ files: userFiles });
  } catch (error) {
    console.error('搜索用户图片错误:', error);
    return c.json({ error: '搜索用户图片失败' }, 500);
  }
}
