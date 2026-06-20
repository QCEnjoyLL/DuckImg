import { errorHandling, telemetryData } from "./utils/middleware";
import { authMiddleware } from "./utils/auth";
import { isAdmin, getUserByName, saveUserFiles } from "./utils/users";
import { getSettings } from "./utils/settings";
import { moderateImage } from "./utils/nsfw";

// 上传强制要求登录（已关闭匿名上传）
export const authenticatedUpload = async (c) => {
    return authMiddleware(c, () => upload(c));
};

export async function upload(c) {
    const env = c.env;
    // 已通过 authMiddleware，必定有用户
    const tokenUser = c.get('user');
    const userId = tokenUser ? tokenUser.id : null;

    if (!userId) {
        return c.json({ error: '请先登录后再上传' }, 401);
    }

    try {
        // 读取用户与站点配置，进行权限/配额校验
        const user = await getUserByName(env, tokenUser.username);
        if (!user) {
            return c.json({ error: '用户不存在' }, 404);
        }
        if (user.status === 'banned') {
            return c.json({ error: '该账户已被封禁，无法上传' }, 403);
        }

        const settings = await getSettings(env);
        const admin = isAdmin(user.username, env);

        // 邮箱验证校验（管理员豁免）
        if (!admin && settings.requireEmailVerify && !user.emailVerified) {
            return c.json({ error: '请先验证邮箱后再上传' }, 403);
        }

        // 每日上传限制（管理员豁免）
        const dateKey = new Date().toISOString().slice(0, 10);
        const countKey = `uploadcount:${userId}:${dateKey}`;
        const effectiveLimit = user.uploadLimit !== null ? user.uploadLimit : settings.dailyUploadLimit;
        let todayCount = parseInt(await env.img_url.get(countKey) || '0', 10);

        const formData = await c.req.formData();

        // 错误处理和遥测数据
        await errorHandling(c);
        telemetryData(c);

        // 检查是否是批量上传
        const files = formData.getAll('file');
        if (!files || files.length === 0) {
            throw new Error('未上传文件');
        }

        // 站点来源（鉴黄需要可公网访问的图片URL）
        const origin = env.SITE_URL || new URL(c.req.url).origin;

        console.log(`接收到${files.length}个文件上传请求`);

        // 用户文件列表只读取一次、累积后一次性写回（减少 KV 写）
        const userFilesKey = `user:${userId}:files`;
        let userFiles = await env.img_url.get(userFilesKey, { type: "json" }) || [];
        let filesDirty = false;   // 用户文件列表是否有变更待写
        let countDirty = false;   // 每日计数是否有变更待写
        let recentNew = [];       // 本次新上传（待并入全局最近上传日志）

        // 统一持久化（用户文件列表 + 每日计数 + 全局最近上传日志），仅在有变更时各写一次
        const persist = async () => {
            if (filesDirty) { await saveUserFiles(env, userId, userFiles); filesDirty = false; }
            if (countDirty) { await env.img_url.put(countKey, String(todayCount), { expirationTtl: 60 * 60 * 48 }); countDirty = false; }
            if (recentNew.length) {
                try {
                    const log = await env.img_url.get('recent_uploads', { type: 'json' }) || [];
                    const merged = [...recentNew.slice().reverse(), ...log].slice(0, 300);
                    await env.img_url.put('recent_uploads', JSON.stringify(merged));
                } catch (e) { console.warn('写入最近上传日志失败（忽略）:', e); }
                recentNew = [];
            }
        };

        // 处理所有文件上传
        const uploadResults = [];
        for (const uploadFile of files) {
            if (!uploadFile) continue;

            // 每日上传限制检查（管理员豁免，0 表示不限制）
            if (!admin && effectiveLimit > 0 && todayCount >= effectiveLimit) {
                await persist(); // 先持久化已上传部分
                return c.json({
                    error: `已达每日上传上限（${effectiveLimit} 张），请明天再试`,
                    limitReached: true,
                    results: uploadResults,
                }, 403);
            }

            const fileName = uploadFile.name;
            const fileExtension = fileName.split('.').pop().toLowerCase();

            // SVG 安全开关：关闭时拒收 SVG（不发送到 TG、不入库、不计数）
            if (settings.allowSvg === false &&
                (uploadFile.type === 'image/svg+xml' || fileExtension === 'svg')) {
                uploadResults.push({ error: '本站已禁止上传 SVG 图片', blocked: true, fileName });
                continue;
            }

            const telegramFormData = new FormData();
            telegramFormData.append("chat_id", env.TG_Chat_ID);
            // 频道帖子标注上传者，便于在 TG 频道直接看出是谁上传（截断防超长）
            const caption = `👤 ${user.username} · ${fileName}`;
            telegramFormData.append("caption", caption.length > 1000 ? caption.slice(0, 1000) : caption);

            // 根据文件类型选择合适的上传方式
            let apiEndpoint;
            if (uploadFile.type.startsWith('image/')) {
                // 对于图片类型，使用sendDocument以保持原图质量
                telegramFormData.append("document", uploadFile);
                apiEndpoint = 'sendDocument';
            } else if (uploadFile.type.startsWith('audio/')) {
                telegramFormData.append("audio", uploadFile);
                apiEndpoint = 'sendAudio';
            } else if (uploadFile.type.startsWith('video/')) {
                telegramFormData.append("video", uploadFile);
                apiEndpoint = 'sendVideo';
            } else {
                telegramFormData.append("document", uploadFile);
                apiEndpoint = 'sendDocument';
            }

            const result = await sendToTelegram(telegramFormData, apiEndpoint, env);

            if (!result.success) {
                console.error(`文件 ${fileName} 上传失败:`, result.error);
                continue;
            }

            const fileId = getFileId(result.data);
            const messageId = getMessageId(result.data);

            if (!fileId) {
                console.error(`文件 ${fileName} 获取文件ID失败`);
                continue;
            }

            // 将文件信息保存到 KV 存储
            const fileKey = `${fileId}.${fileExtension}`;
            const timestamp = Date.now();

            // 图片鉴黄：命中即拒收（删掉刚发到 Telegram 的图、不入库、不计数）
            if (settings.nsfw.enabled && uploadFile.type.startsWith('image/')) {
                const verdict = await moderateImage(`${origin}/file/${fileKey}`, settings);
                if (verdict.flagged) {
                    if (messageId) { await deleteTelegramMessage(env, messageId); }
                    uploadResults.push({ error: '图片未通过内容审核，已被拦截', blocked: true, fileName });
                    continue;
                }
            }

            if (env.img_url) {
                // 创建文件元数据
                const metadata = {
                    TimeStamp: timestamp,
                    ListType: "None",
                    Label: "None",
                    liked: false,
                    fileName: fileName,
                    fileSize: uploadFile.size,
                    userId: userId,
                    messageId: messageId || undefined,
                };

                // 保存文件元数据（每文件独立 KV 项，必须逐个写）
                await env.img_url.put(fileKey, "", { metadata });

                // 累积到用户文件列表（循环结束后一次性写回）
                const newFile = {
                    id: fileKey,
                    fileName: fileName,
                    fileSize: uploadFile.size,
                    uploadTime: timestamp,
                    url: `/file/${fileKey}`,
                    messageId: messageId || undefined,
                };

                userFiles.push(newFile);
                filesDirty = true;

                // 记入本次最近上传（含上传者，供后台审核）
                recentNew.push({
                    fileKey,
                    fileName,
                    fileSize: uploadFile.size,
                    userId,
                    username: user.username,
                    time: timestamp,
                    url: `/file/${fileKey}`,
                });
            }

            // 每日计数自增（管理员也计数，但不受限）；循环结束后一次性写回
            todayCount += 1;
            countDirty = true;

            // 添加到上传结果
            uploadResults.push({ 'src': `/file/${fileKey}` });
        }

        // 一次性持久化用户文件列表与每日计数
        await persist();

        console.log(`成功上传${uploadResults.length}个文件`);
        return c.json(uploadResults);
    } catch (error) {
        console.error('上传错误:', error);
        return c.json({ error: error.message }, 500);
    }
}

/**
 * 获取上传文件的ID
 * 对于图片，我们现在使用document类型上传以保持原图质量
 */
function getFileId(response) {
    if (!response.ok || !response.result) return null;

    const result = response.result;
    // 保留photo处理逻辑以兼容旧数据，但新上传的图片会走document逻辑
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

/**
 * 取 Telegram 消息 ID（用于日后彻底删除原图）
 */
function getMessageId(response) {
    if (!response || !response.ok || !response.result) return null;
    return response.result.message_id || null;
}

/**
 * 删除 Telegram 消息（彻底移除原图）。best-effort：失败仅记录日志。
 */
export async function deleteTelegramMessage(env, messageId) {
    if (!messageId || !env.TG_Bot_Token || !env.TG_Chat_ID) return false;
    try {
        const res = await fetch(`https://api.telegram.org/bot${env.TG_Bot_Token}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: env.TG_Chat_ID, message_id: messageId }),
        });
        return res.ok;
    } catch (e) {
        console.warn('删除 Telegram 消息失败（忽略）:', messageId, e);
        return false;
    }
}

/**
 * 从全局「最近上传」日志中移除若干 fileKey（删除图片时调用，避免遗留失效条目）。
 */
export async function removeFromRecentUploads(env, fileKeys) {
    try {
        const set = new Set((fileKeys || []).filter(Boolean));
        if (!set.size) return;
        const log = await env.img_url.get('recent_uploads', { type: 'json' });
        if (!Array.isArray(log) || !log.length) return;
        const filtered = log.filter(item => !set.has(item.fileKey));
        if (filtered.length !== log.length) {
            await env.img_url.put('recent_uploads', JSON.stringify(filtered));
        }
    } catch (e) { console.warn('清理最近上传日志失败（忽略）:', e); }
}

/**
 * 从全局「最近上传」日志中移除某用户的全部条目（删除用户时调用）。
 */
export async function removeUserFromRecentUploads(env, userId) {
    try {
        if (!userId) return;
        const log = await env.img_url.get('recent_uploads', { type: 'json' });
        if (!Array.isArray(log) || !log.length) return;
        const filtered = log.filter(item => item.userId !== userId);
        if (filtered.length !== log.length) {
            await env.img_url.put('recent_uploads', JSON.stringify(filtered));
        }
    } catch (e) { console.warn('清理最近上传日志失败（忽略）:', e); }
}

/**
 * 封禁/解封时，给该用户的图片元数据打/清 blocked 标记。
 * 这样即使老图元数据缺 userId，也能可靠地在公网屏蔽（管理员仍可看）。
 * 带上限保护，避免单次 KV 操作过多。
 */
export async function setUserImagesBlocked(env, userId, blocked) {
  if (!userId) return;
  try {
    const files = await env.img_url.get(`user:${userId}:files`, { type: 'json' }) || [];
    const MAX = 400;
    let n = 0;
    for (const f of files) {
      if (n >= MAX) break;
      if (!f || !f.id) continue;
      try {
        const rec = await env.img_url.getWithMetadata(f.id);
        const meta = (rec && rec.metadata) ? rec.metadata : {};
        meta.blocked = !!blocked;
        if (!meta.userId) meta.userId = userId; // 顺便补齐归属
        await env.img_url.put(f.id, (rec && rec.value) || '', { metadata: meta });
      } catch { /* 单张失败忽略 */ }
      n++;
    }
  } catch (e) { console.warn('标记用户图片屏蔽态失败（忽略）:', e); }
}

async function sendToTelegram(formData, apiEndpoint, env, retryCount = 0) {
    const MAX_RETRIES = 2;
    const apiUrl = `https://api.telegram.org/bot${env.TG_Bot_Token}/${apiEndpoint}`;

    try {
        const response = await fetch(apiUrl, { method: "POST", body: formData });
        const responseData = await response.json();

        if (response.ok) {
            return { success: true, data: responseData };
        }

        // 不再需要从sendPhoto转为sendDocument的重试逻辑，因为我们直接使用sendDocument

        return {
            success: false,
            error: responseData.description || '上传到Telegram失败'
        };
    } catch (error) {
        console.error('网络错误:', error);
        if (retryCount < MAX_RETRIES) {
            // 网络错误时的重试逻辑保留
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return await sendToTelegram(formData, apiEndpoint, env, retryCount + 1);
        }
        return { success: false, error: '发生网络错误' };
    }
}