import { authMiddleware } from "./utils/auth";
import { isAdmin, getUserById, getUserByName } from "./utils/users";
import { getSettings } from "./utils/settings";
import { moderateImage } from "./utils/nsfw";
import { checkRateLimit } from "./utils/ratelimit";
import {
  dbDeleteImage,
  dbReleaseUploadSlot,
  dbReserveUploadSlot,
  dbSetUserImagesBlocked,
  dbUpsertImage,
} from "./utils/db";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_FILE_BYTES = 40 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 20;
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'heic', 'heif']);
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
  'image/avif', 'image/heic', 'image/heif',
]);

function isAllowedImage(file, fileExtension) {
  const mime = String(file.type || '').toLowerCase();
  const extOk = ALLOWED_EXT.has(fileExtension);
  if (!mime || mime === 'application/octet-stream') return extOk;
  return extOk && ALLOWED_MIME.has(mime);
}

function startsWithBytes(bytes, expected) {
  return expected.every((value, index) => bytes[index] === value);
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

/** 只读取文件头，验证内容签名与扩展名一致，避免仅伪造 MIME/文件名。 */
export async function hasMatchingImageSignature(file, extension) {
  if (!file || typeof file.slice !== 'function') return false;
  const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const ext = String(extension || '').toLowerCase();

  if (ext === 'jpg' || ext === 'jpeg') return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  if (ext === 'png') return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (ext === 'gif') return ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a';
  if (ext === 'webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
  if (ext === 'bmp') return ascii(bytes, 0, 2) === 'BM';
  if (ext === 'ico') return startsWithBytes(bytes, [0x00, 0x00, 0x01, 0x00]);
  if (ext === 'svg') {
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
    return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(text);
  }
  if (['avif', 'heic', 'heif'].includes(ext)) {
    if (ascii(bytes, 4, 4) !== 'ftyp') return false;
    const brands = [];
    for (let i = 8; i + 4 <= Math.min(bytes.length, 40); i += 4) brands.push(ascii(bytes, i, 4));
    if (ext === 'avif') return brands.some((brand) => brand === 'avif' || brand === 'avis');
    return brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand));
  }
  return false;
}

export const authenticatedUpload = async (c) => {
  return authMiddleware(c, () => upload(c));
};

export async function upload(c) {
  const env = c.env;
  const tokenUser = c.get('user');
  const userId = tokenUser ? tokenUser.id : null;

  if (!userId) {
    return c.json({ error: '请先登录后再上传' }, 401);
  }

  // 突发限流：每用户每分钟 20 次上传请求（前端批量多文件同属 1 次请求，正常使用无感）。
  // 每日总量由 dailyUploadLimit 管；这里管的是速度，防止脚本瞬时打满 TG Bot 配额殃及全站。
  const burst = await checkRateLimit(env, `up:${userId}`, { limit: 20, windowSec: 60 });
  if (!burst.allowed) {
    return c.json({ error: `上传过于频繁，请 ${burst.retryAfterSec} 秒后再试` }, 429);
  }

  try {
    // token 里有 id 就按 id 查（1 次查询）；旧 token 回退用户名兼容链
    const user = (await getUserById(env, userId)) || (await getUserByName(env, tokenUser.username));
    if (!user) return c.json({ error: '用户不存在' }, 404);
    if (user.status === 'banned') return c.json({ error: '该账户已被封禁，无法上传' }, 403);

    const settings = await getSettings(env);
    const admin = isAdmin(user.username, env);

    if (!admin && settings.requireEmailVerify && !user.emailVerified) {
      return c.json({ error: '请先验证邮箱后再上传' }, 403);
    }

    const dateKey = new Date().toISOString().slice(0, 10);
    const hasUserLimit = user.uploadLimit !== null;
    // 用户级 0 表示禁用；全局 0 表示不限量。
    const effectiveLimit = admin
      ? null
      : (hasUserLimit
        ? Math.max(0, Number(user.uploadLimit) || 0)
        : (Number(settings.dailyUploadLimit) > 0 ? Number(settings.dailyUploadLimit) : null));

    const formData = await c.req.formData();

    const files = formData.getAll('file');
    if (!files || files.length === 0) throw new Error('未上传文件');
    if (files.length > MAX_FILES_PER_REQUEST) {
      return c.json({ error: `单次最多上传 ${MAX_FILES_PER_REQUEST} 个文件` }, 413);
    }
    const totalFileBytes = files.reduce((sum, file) => sum + (typeof file.size === 'number' ? file.size : 0), 0);
    if (totalFileBytes > MAX_REQUEST_FILE_BYTES) {
      return c.json({ error: '单次上传文件总大小不能超过 40MB' }, 413);
    }

    const origin = env.SITE_URL || new URL(c.req.url).origin;
    const uploadResults = [];

    for (const uploadFile of files) {
      if (!uploadFile) continue;

      const fileName = String(uploadFile.name || 'unnamed').trim();
      if (!fileName || fileName.length > 180 || /[\u0000-\u001f\u007f]/.test(fileName)) {
        uploadResults.push({
          error: '文件名长度需为 1–180 个字符且不能包含控制字符',
          blocked: true,
          fileName: fileName.slice(0, 180),
        });
        continue;
      }
      const fileExtension = (fileName.split('.').pop() || '').toLowerCase();

      if (typeof uploadFile.size === 'number' && uploadFile.size > MAX_UPLOAD_BYTES) {
        uploadResults.push({
          error: `文件超过大小限制（最大 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB）`,
          blocked: true,
          fileName,
        });
        continue;
      }

      if (!isAllowedImage(uploadFile, fileExtension)) {
        uploadResults.push({
          error: '仅支持图片格式：jpg/png/gif/webp/bmp/svg/ico/avif',
          blocked: true,
          fileName,
        });
        continue;
      }

      if (!(await hasMatchingImageSignature(uploadFile, fileExtension))) {
        uploadResults.push({
          error: '文件内容与图片扩展名不匹配',
          blocked: true,
          fileName,
        });
        continue;
      }

      if (settings.allowSvg === false &&
          (uploadFile.type === 'image/svg+xml' || fileExtension === 'svg')) {
        uploadResults.push({ error: '本站已禁止上传 SVG 图片', blocked: true, fileName });
        continue;
      }

      const slot = await dbReserveUploadSlot(env, userId, dateKey, effectiveLimit);
      if (!slot.allowed) {
        return c.json({
          error: effectiveLimit === 0
            ? '该账户已被禁止上传'
            : `已达每日上传上限（${effectiveLimit} 张），请明天再试`,
          limitReached: true,
          results: uploadResults,
        }, 403);
      }

      const telegramFormData = new FormData();
      telegramFormData.append('chat_id', env.TG_Chat_ID);
      const caption = `👤 ${user.username} · ${fileName}`;
      telegramFormData.append('caption', caption.length > 1000 ? caption.slice(0, 1000) : caption);
      telegramFormData.append('document', uploadFile);

      const result = await sendToTelegram(telegramFormData, 'sendDocument', env);
      if (!result.success) {
        await dbReleaseUploadSlot(env, userId, dateKey).catch(() => {});
        uploadResults.push({ error: result.error || '上传到存储失败', fileName, blocked: true });
        continue;
      }

      // Telegram 已实际接收文件；若后续补偿删除失败则保留配额，防止反复制造孤儿文件。
      const fileId = getFileId(result.data);
      const messageId = getMessageId(result.data);
      if (!fileId) {
        if (messageId) {
          const rolledBack = await deleteTelegramMessage(env, messageId);
          if (rolledBack) await dbReleaseUploadSlot(env, userId, dateKey).catch(() => {});
        }
        uploadResults.push({ error: '获取文件 ID 失败', fileName, blocked: true });
        continue;
      }

      const fileKey = `${fileId}.${fileExtension}`;
      const timestamp = Date.now();
      const mimeType = String(uploadFile.type || '').toLowerCase();

      if (settings.nsfw && settings.nsfw.enabled) {
        try {
          const verdict = await moderateImage(`${origin}/file/${fileKey}`, settings);
          if (verdict && verdict.error && settings.nsfw.failurePolicy === 'block') {
            const removed = messageId ? await deleteTelegramMessage(env, messageId) : false;
            if (removed) await dbReleaseUploadSlot(env, userId, dateKey).catch(() => {});
            uploadResults.push({ error: '内容审核服务异常，已按站点策略拦截', blocked: true, fileName });
            continue;
          }
          if (verdict && verdict.flagged) {
            const removed = messageId ? await deleteTelegramMessage(env, messageId) : false;
            if (removed) {
              await dbReleaseUploadSlot(env, userId, dateKey).catch(() => {});
            }
            uploadResults.push({ error: '图片未通过内容审核，已被拦截', blocked: true, fileName });
            continue;
          }
        } catch (e) {
          console.warn('鉴黄调用异常:', e);
          if (settings.nsfw.failurePolicy === 'block') {
            const removed = messageId ? await deleteTelegramMessage(env, messageId) : false;
            if (removed) await dbReleaseUploadSlot(env, userId, dateKey).catch(() => {});
            uploadResults.push({ error: '内容审核服务异常，已按站点策略拦截', blocked: true, fileName });
            continue;
          }
        }
      }

      const listItem = {
        id: fileKey,
        fileName,
        fileSize: uploadFile.size,
        uploadTime: timestamp,
        url: `/file/${fileKey}`,
        messageId: messageId || undefined,
        userId,
      };

      let listed = false;
      try {
        listed = await dbUpsertImage(env, listItem);
      } catch (e) {
        console.error('D1 写入图库异常:', fileKey, e);
      }

      if (!listed && messageId) {
        const rolledBack = await deleteTelegramMessage(env, messageId);
        if (rolledBack) {
          await dbReleaseUploadSlot(env, userId, dateKey).catch(() => {});
          uploadResults.push({ error: '图库索引写入失败，已回滚本次上传', fileName, blocked: true });
          continue;
        }
      }

      uploadResults.push({
        src: `/file/${fileKey}`,
        listed,
        ...(listed ? {} : { warning: '图片已上传到 Telegram，但图库索引写入失败，直链仍可用' }),
      });
    }

    if (!uploadResults.length) {
      return c.json({ error: '上传失败：没有成功的文件' }, 400);
    }
    return c.json(uploadResults);
  } catch (error) {
    console.error('上传错误:', error);
    return c.json({ error: (error && error.message) || '上传失败' }, 500);
  }
}

function getFileId(response) {
  if (!response.ok || !response.result) return null;
  const result = response.result;
  if (result.photo) {
    return result.photo.reduce((prev, current) =>
      (prev.file_size > current.file_size) ? prev : current
    ).file_id;
  }
  if (result.document) return result.document.file_id;
  if (result.video) return result.video.file_id;
  if (result.audio) return result.audio.file_id;
  return null;
}

function getMessageId(response) {
  if (!response || !response.ok || !response.result) return null;
  return response.result.message_id || null;
}

export async function deleteTelegramMessage(env, messageId) {
  if (!messageId || !env.TG_Bot_Token || !env.TG_Chat_ID) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TG_Bot_Token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TG_Chat_ID, message_id: messageId }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data && data.ok === true) return true;
    // 上次删除已在 Telegram 生效但响应丢失时，重试会得到“not found”；此时存储目标已不存在。
    const description = String((data && data.description) || '');
    return /message to delete not found/i.test(description);
  } catch (e) {
    console.warn('删除 Telegram 消息失败（忽略）:', messageId, e);
    return false;
  }
}

/** D1 下 recent 由 images 表按时间查询，此函数保留为空操作以兼容调用方 */
export async function removeFromRecentUploads(_env, _fileKeys) {
  // no-op：删除图片时已从 images 表移除
}

export async function removeUserFromRecentUploads(_env, _userId) {
  // no-op
}

export async function setUserImagesBlocked(env, userId, blocked) {
  try {
    await dbSetUserImagesBlocked(env, userId, blocked);
  } catch (e) {
    console.warn('标记用户图片屏蔽态失败（忽略）:', e);
  }
}

async function sendToTelegram(formData, apiEndpoint, env, retryCount = 0) {
  const MAX_RETRIES = 2;
  const apiUrl = `https://api.telegram.org/bot${env.TG_Bot_Token}/${apiEndpoint}`;
  try {
    const response = await fetch(apiUrl, { method: 'POST', body: formData });
    const responseData = await response.json();
    if (response.ok && responseData && responseData.ok === true) return { success: true, data: responseData };
    return { success: false, error: responseData.description || '上传到Telegram失败' };
  } catch (error) {
    console.error('网络错误:', error);
    if (retryCount < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * (retryCount + 1)));
      return sendToTelegram(formData, apiEndpoint, env, retryCount + 1);
    }
    return { success: false, error: '发生网络错误' };
  }
}

// re-export for admin purge helpers
export { dbDeleteImage };
