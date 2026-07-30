import { verifyPreviewTicket } from '../utils/auth';
import { getBannedSet } from '../utils/bans';
import { dbGetImage, kvGet, kvPut } from '../utils/db';

// Telegram getFile 返回的 file_path 约 1 小时失效；缓存 50 分钟
const TG_PATH_TTL_SEC = 50 * 60;
// isolate 内内存缓存，避免同 isolate 重复 KV/API
const _tgPathMem = new Map(); // fileId -> { path, exp }

// 是否为携带有效管理员令牌的查看者（后台看图用 ?t=<jwt> 放行被屏蔽图片）
async function isAdminViewer(c, env) {
    try {
        const t = new URL(c.req.url).searchParams.get('t');
        if (!t) return false;
        const { valid } = await verifyPreviewTicket(t, env);
        return !!valid;
    } catch { return false; }
}

// 被封禁用户图片的友好屏蔽页（404）。直接打开链接显示此页；<img> 嵌入则显示裂图（=什么都没有）。
function blockedImagePage(c) {
    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>图片暂不可用</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0f23 0%,#1a1a2e 50%,#16213e 100%);color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px}
.card{max-width:460px;width:100%;text-align:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:44px 30px;box-shadow:0 20px 50px rgba(0,0,0,.35);backdrop-filter:blur(10px)}
.icon{font-size:66px;line-height:1;margin-bottom:14px}
.code{font-size:12px;letter-spacing:4px;color:#8b93a7;margin-bottom:10px}
h1{font-size:1.5rem;color:#fff;margin-bottom:16px;font-weight:600}
p{color:#aab2c5;line-height:1.85;font-size:.96rem}
.tip{margin-top:16px;font-size:.84rem;color:#6b7280}
a.btn{display:inline-block;margin-top:24px;padding:11px 26px;background:linear-gradient(135deg,#4361ee,#3730a3);color:#fff;text-decoration:none;border-radius:10px;font-size:.92rem;transition:opacity .2s}
a.btn:hover{opacity:.88}
</style></head>
<body>
<div class="card">
<div class="icon">🚫</div>
<div class="code">404 · IMAGE UNAVAILABLE</div>
<h1>该图片暂不可用</h1>
<p>该图片可能因<b>上传用户被封禁</b>等原因暂时无法访问。<br>如有疑问，可联系管理员处理。</p>
<p class="tip">注：图片并未被删除，恢复后即可正常查看。</p>
<a class="btn" href="/">返回首页</a>
</div>
</body></html>`;
    return c.html(html, 404);
}

export async function fileHandler(c) {
    const env = c.env;
    const id = c.req.param('id');
    const url = new URL(c.req.url);

    // 检查是否为下载请求
    const isDownload = url.searchParams.get('download') === 'true';

    // 检查是否为预览请求
    const isPreview = url.searchParams.get('preview') === 'true';

    try {
        // 封禁屏蔽：图片归属用户被封禁时，对公网屏蔽（管理员凭 ?t= 放行）。无人被封时零额外开销。
        // 必须在边缘缓存命中前检查，避免封禁后仍吐出缓存图。
        const banned = await getBannedSet(env);
        if (banned.size > 0 && !(await isAdminViewer(c, env))) {
            try {
                const img = await dbGetImage(env, id);
                const ownerId = img && img.userId;
                if ((img && img.blocked) || (ownerId && banned.has(String(ownerId)))) {
                    return blockedImagePage(c);
                }
            } catch { /* 元数据读取失败则放行，不误伤 */ }
        }

        // 预览页不需要拉 Telegram，直接出 HTML
        if (isPreview) {
            return createPreviewPage(c, id);
        }

        // 边缘 Cache API：命中则零 Telegram / 零 getFile（仍经过上方封禁检查）
        // 仅缓存「纯展示」路径；?download=true / ?t= 管理员令牌不走缓存
        const canUseEdgeCache = !isDownload && !url.searchParams.has('t');
        // cache key 带版本：避免沿用旧的 application/octet-stream 缓存
        const cacheKey = new Request(new URL(url.pathname + '?_ct=2', url.origin), { method: 'GET' });
        if (canUseEdgeCache) {
            try {
                const hit = await caches.default.match(cacheKey);
                if (hit) return hit;
            } catch { /* Cache API 不可用时降级 */ }
        }

        let fileUrl = null;

        // 通过 Telegram Bot API 上传的文件（长 file_id 或带扩展名）
        if (id.length > 30 || id.includes('.')) {
            const fileId = id.split('.')[0];
            const filePath = await getFilePath(env, fileId);
            if (filePath) {
                fileUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;
            }
        } else {
            // 兼容旧 Telegraph 链接
            fileUrl = `https://telegra.ph/file/${id}`;
        }

        if (!fileUrl) {
            return c.text('文件不存在', 404);
        }

        return await proxyFile(c, fileUrl, { cacheKey: canUseEdgeCache ? cacheKey : null, isDownload });
    } catch (error) {
        console.error('文件访问错误:', error);
        return c.text('服务器错误', 500);
    }
}

/** HTML 文本/属性转义（预览页内嵌 id 防 XSS） */
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 创建图片预览页面
 * 只使用同源 /file/:id 代理地址，避免 Bot Token 泄露到页面源码
 */
function createPreviewPage(c, id) {
    const safeIdHtml = escapeHtml(id);
    // JSON.stringify 保证安全嵌入 <script>
    const idJs = JSON.stringify(String(id ?? ''));

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>图片预览 - 鸭鸭图床</title>
    <meta name="description" content="高质量图片在线预览">
    <link rel="icon" href="/images/favicon.ico" type="image/x-icon">
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            --primary-color: #4361ee;
            --primary-dark: #3730a3;
            --text-color: #ffffff;
            --text-muted: rgba(255, 255, 255, 0.7);
            --bg-dark: #000000;
            --bg-overlay: rgba(0, 0, 0, 0.9);
            --bg-panel: rgba(17, 25, 40, 0.9);
            --border-color: rgba(255, 255, 255, 0.1);
            --success-color: #10b981;
            --error-color: #ef4444;
            --shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
            --radius: 16px;
            --radius-sm: 8px;
        }
        
        body {
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
            color: var(--text-color);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            overflow: hidden;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            position: relative;
        }
        
        /* 动态背景效果 */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at 25% 25%, rgba(67, 97, 238, 0.1) 0%, transparent 50%),
                        radial-gradient(circle at 75% 75%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
            z-index: 0;
            animation: backgroundShift 20s ease-in-out infinite alternate;
        }
        
        @keyframes backgroundShift {
            0% { transform: translate(0, 0) rotate(0deg); }
            100% { transform: translate(-10px, -10px) rotate(1deg); }
        }
        
        .preview-container {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: zoom-in;
            z-index: 1;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .preview-container.fullscreen {
            cursor: zoom-out;
        }
        
        .preview-image {
            max-width: 85%;
            max-height: 85%;
            object-fit: contain;
            border-radius: var(--radius);
            box-shadow: var(--shadow);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid var(--border-color);
            opacity: 0;
            transform: scale(0.9) translateY(20px);
        }
        
        .preview-image.loaded {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
        
        .preview-image:hover:not(.fullscreen) {
            transform: scale(1.02);
            box-shadow: 0 32px 64px -12px rgba(0, 0, 0, 0.9);
        }
        
        .preview-image.fullscreen {
            max-width: 100%;
            max-height: 100%;
            border-radius: 0;
            border: none;
            box-shadow: none;
        }
        
        /* 控制面板 */
        .controls {
            position: fixed;
            bottom: 30px;
            right: 30px;
            display: flex;
            gap: 12px;
            z-index: 1000;
            opacity: 0;
            transform: translateY(20px);
            animation: slideUp 0.6s ease-out 0.8s forwards;
        }
        
        @keyframes slideUp {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .control-btn {
            width: 56px;
            height: 56px;
            background: var(--bg-panel);
            border: 1px solid var(--border-color);
            border-radius: 50%;
            color: var(--text-color);
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(20px);
            position: relative;
            overflow: hidden;
        }
        
        .control-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(45deg, var(--primary-color), var(--primary-dark));
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: -1;
        }
        
        .control-btn:hover {
            transform: translateY(-4px) scale(1.05);
            box-shadow: 0 12px 24px rgba(67, 97, 238, 0.3);
            border-color: var(--primary-color);
        }
        
        .control-btn:hover::before {
            opacity: 1;
        }
        
        .control-btn:active {
            transform: translateY(-2px) scale(1.02);
        }
        
        .control-btn.large {
            width: 64px;
            height: 64px;
            font-size: 24px;
            background: linear-gradient(45deg, var(--primary-color), var(--primary-dark));
            border-color: var(--primary-color);
        }
        
        .control-btn.large::before {
            opacity: 1;
            background: linear-gradient(45deg, var(--primary-dark), #6366f1);
        }
        
        /* 信息面板 */
        .info-panel {
            position: fixed;
            top: 30px;
            left: 30px;
            background: var(--bg-panel);
            border: 1px solid var(--border-color);
            padding: 20px;
            border-radius: var(--radius);
            backdrop-filter: blur(20px);
            font-size: 14px;
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1000;
            min-width: 200px;
        }
        
        .info-panel.show {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
        
        .info-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
            font-weight: 600;
            color: var(--primary-color);
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 8px 0;
            border-bottom: 1px solid var(--border-color);
        }
        
        .info-item:last-child {
            margin-bottom: 0;
            border-bottom: none;
        }
        
        .info-label {
            color: var(--text-muted);
            font-size: 13px;
        }
        
        .info-value {
            color: var(--text-color);
            font-weight: 500;
        }
        
        /* 加载状态 */
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            z-index: 100;
        }
        
        .loading-spinner {
            width: 48px;
            height: 48px;
            border: 3px solid var(--border-color);
            border-top: 3px solid var(--primary-color);
            border-radius: 50%;
            animation: spin 1s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .loading-text {
            color: var(--text-muted);
            font-size: 16px;
            font-weight: 500;
        }
        
        /* 错误状态 */
        .error {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: var(--error-color);
            background: var(--bg-panel);
            padding: 40px;
            border-radius: var(--radius);
            border: 1px solid var(--border-color);
            backdrop-filter: blur(20px);
            z-index: 100;
        }
        
        .error-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.7;
        }
        
        .error-text {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .error-subtitle {
            font-size: 14px;
            color: var(--text-muted);
        }
        
        /* 快捷键提示 */
        .hotkeys {
            position: fixed;
            bottom: 30px;
            left: 30px;
            background: var(--bg-panel);
            border: 1px solid var(--border-color);
            padding: 16px 20px;
            border-radius: var(--radius);
            backdrop-filter: blur(20px);
            font-size: 13px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1000;
        }
        
        .hotkeys.show {
            opacity: 1;
            transform: translateY(0);
        }
        
        .hotkeys kbd {
            background: var(--border-color);
            padding: 4px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
            font-weight: bold;
            margin: 0 4px;
        }
        
        /* 品牌标识 */
        .brand {
            position: fixed;
            top: 30px;
            right: 30px;
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--text-muted);
            font-size: 14px;
            font-weight: 500;
            opacity: 0;
            animation: fadeIn 0.6s ease-out 1s forwards;
            z-index: 1000;
        }
        
        @keyframes fadeIn {
            to { opacity: 1; }
        }
        
        .brand-icon {
            width: 24px;
            height: 24px;
            background: var(--primary-color);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: white;
        }
        
        /* 成功提示 */
        .toast {
            position: fixed;
            top: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(-100px);
            background: var(--success-color);
            color: white;
            padding: 12px 20px;
            border-radius: var(--radius-sm);
            font-weight: 500;
            z-index: 2000;
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        
        /* 响应式设计 */
        @media (max-width: 768px) {
            .controls {
                bottom: 20px;
                right: 20px;
                gap: 10px;
            }
            
            .control-btn {
                width: 48px;
                height: 48px;
                font-size: 18px;
            }
            
            .control-btn.large {
                width: 56px;
                height: 56px;
                font-size: 22px;
            }
            
            .info-panel {
                top: 20px;
                left: 20px;
                right: 20px;
                font-size: 13px;
                padding: 16px;
            }
            
            .hotkeys {
                display: none;
            }
            
            .brand {
                top: 20px;
                right: 20px;
                font-size: 12px;
            }
            
            .preview-image {
                max-width: 95%;
                max-height: 95%;
            }
        }
        
        @media (max-width: 480px) {
            .controls {
                bottom: 16px;
                right: 16px;
                gap: 8px;
            }
            
            .info-panel {
                top: 16px;
                left: 16px;
                right: 16px;
            }
            
            .brand {
                top: 16px;
                right: 16px;
            }
        }
    </style>
</head>
<body>
    <!-- 品牌标识 -->
    <div class="brand">
        <div class="brand-icon">
            <i class="ri-image-line"></i>
        </div>
        鸭鸭图床
    </div>

    <!-- 主预览容器 -->
    <div class="preview-container" id="previewContainer">
        <div class="loading" id="loading">
            <div class="loading-spinner"></div>
            <div class="loading-text">正在加载图片...</div>
        </div>
        
        <img class="preview-image" id="previewImage" style="display: none;" />
        
        <div class="error" id="error" style="display: none;">
            <div class="error-icon">
                <i class="ri-error-warning-line"></i>
            </div>
            <div class="error-text">图片加载失败</div>
            <div class="error-subtitle">请检查网络连接或稍后重试</div>
        </div>
    </div>
    
    <!-- 信息面板 -->
    <div class="info-panel" id="infoPanel">
        <div class="info-header">
            <i class="ri-information-line"></i>
            图片信息
        </div>
        <div class="info-item">
            <span class="info-label">文件名</span>
            <span class="info-value" id="fileName">${safeIdHtml}</span>
        </div>
        <div class="info-item">
            <span class="info-label">尺寸</span>
            <span class="info-value" id="dimensions">-</span>
        </div>
        <div class="info-item">
            <span class="info-label">类型</span>
            <span class="info-value" id="fileType">-</span>
        </div>
        <div class="info-item">
            <span class="info-label">大小</span>
            <span class="info-value" id="fileSize">-</span>
        </div>
    </div>
    
    <!-- 控制按钮 -->
    <div class="controls">
        <button class="control-btn" id="infoBtn" onclick="toggleInfo()" title="显示/隐藏信息 (I)">
            <i class="ri-information-line"></i>
        </button>
        <button class="control-btn" id="fullscreenBtn" onclick="toggleFullscreen()" title="全屏查看 (F)">
            <i class="ri-fullscreen-line"></i>
        </button>
        <button class="control-btn large" id="downloadBtn" onclick="downloadImage()" title="下载原图 (D)">
            <i class="ri-download-line"></i>
        </button>
    </div>
    
    <!-- 快捷键提示 -->
    <div class="hotkeys" id="hotkeys">
        <kbd>F</kbd> 全屏 <kbd>I</kbd> 信息 <kbd>D</kbd> 下载 <kbd>ESC</kbd> 关闭
    </div>

    <!-- 成功提示 -->
    <div class="toast" id="toast"></div>

    <script>
        // 同源代理，绝不内嵌 Telegram 直链 / Bot Token
        const fileId = ${idJs};
        const imageUrl = '/file/' + fileId;
        const downloadUrl = imageUrl + '?download=true';
        const previewImage = document.getElementById('previewImage');
        const previewContainer = document.getElementById('previewContainer');
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const infoPanel = document.getElementById('infoPanel');
        const hotkeys = document.getElementById('hotkeys');
        const toast = document.getElementById('toast');
        const fullscreenBtn = document.getElementById('fullscreenBtn');

        let isFullscreen = false;
        let infoVisible = false;

        // 显示提示消息
        function showToast(message) {
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 2000);
        }

        // 加载图片
        previewImage.onload = function() {
            loading.style.display = 'none';
            previewImage.style.display = 'block';

            // 添加加载完成动画
            setTimeout(() => {
                previewImage.classList.add('loaded');
            }, 100);

            // 更新图片信息
            updateImageInfo();

            // 显示快捷键提示
            setTimeout(() => {
                hotkeys.classList.add('show');
                setTimeout(() => {
                    hotkeys.classList.remove('show');
                }, 4000);
            }, 1500);
        };

        previewImage.onerror = function() {
            loading.style.display = 'none';
            error.style.display = 'block';
        };

        previewImage.src = imageUrl;

        // 更新图片信息
        function updateImageInfo() {
            document.getElementById('dimensions').textContent =
                previewImage.naturalWidth + ' × ' + previewImage.naturalHeight + ' px';

            // 从文件名推断类型
            const extension = String(fileId).split('.').pop().toLowerCase();
            const typeMap = {
                'jpg': 'JPEG',
                'jpeg': 'JPEG',
                'png': 'PNG',
                'gif': 'GIF',
                'webp': 'WebP',
                'svg': 'SVG'
            };
            document.getElementById('fileType').textContent = typeMap[extension] || '未知';

            // 计算文件大小（估算）
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = previewImage.naturalWidth;
            canvas.height = previewImage.naturalHeight;

            try {
                ctx.drawImage(previewImage, 0, 0);
                const dataUrl = canvas.toDataURL();
                const sizeInBytes = Math.round((dataUrl.length - 22) * 3 / 4);
                document.getElementById('fileSize').textContent = formatFileSize(sizeInBytes);
            } catch (e) {
                document.getElementById('fileSize').textContent = '未知';
            }
        }

        // 格式化文件大小
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        // 切换信息面板
        function toggleInfo() {
            infoVisible = !infoVisible;
            if (infoVisible) {
                infoPanel.classList.add('show');
            } else {
                infoPanel.classList.remove('show');
            }
        }

        // 切换全屏
        function toggleFullscreen() {
            isFullscreen = !isFullscreen;
            if (isFullscreen) {
                previewContainer.classList.add('fullscreen');
                previewImage.classList.add('fullscreen');
                fullscreenBtn.innerHTML = '<i class="ri-fullscreen-exit-line"></i>';
                fullscreenBtn.title = '退出全屏 (F)';
            } else {
                previewContainer.classList.remove('fullscreen');
                previewImage.classList.remove('fullscreen');
                fullscreenBtn.innerHTML = '<i class="ri-fullscreen-line"></i>';
                fullscreenBtn.title = '全屏查看 (F)';
            }
        }

        // 下载图片
        function downloadImage() {
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileId;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showToast('开始下载图片...');
        }
        
        // 点击图片切换全屏
        previewContainer.addEventListener('click', function(e) {
            if (e.target === previewImage || e.target === previewContainer) {
                toggleFullscreen();
            }
        });
        
        // 键盘快捷键
        document.addEventListener('keydown', function(e) {
            switch(e.key.toLowerCase()) {
                case 'escape':
                    if (isFullscreen) {
                        toggleFullscreen();
                    } else if (infoVisible) {
                        toggleInfo();
                    } else {
                        window.close();
                    }
                    break;
                case 'f':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'd':
                    e.preventDefault();
                    downloadImage();
                    break;
                case 'i':
                    e.preventDefault();
                    toggleInfo();
                    break;
            }
        });
        
        // 防止右键菜单
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });
        
        // 添加页面离开前的确认
        window.addEventListener('beforeunload', function(e) {
            // 可以在这里添加离开确认逻辑
        });
    </script>
</body>
</html>`;

    return c.html(html);
}

/**
 * 获取 Telegram 文件路径。
 * 三级缓存：isolate 内存 → KV(50min TTL) → Telegram getFile API。
 * file_path 约 1h 失效，故 KV TTL 取 50min。
 */
async function getFilePath(env, fileId) {
    if (!fileId) return null;
    const now = Date.now();

    const mem = _tgPathMem.get(fileId);
    if (mem && mem.exp > now) return mem.path;

    const kvKey = `tgpath:${fileId}`;
    try {
        const cached = await kvGet(env, kvKey);
        if (cached) {
            _tgPathMem.set(fileId, { path: cached, exp: now + TG_PATH_TTL_SEC * 1000 });
            return cached;
        }
    } catch { /* ignore */ }

    try {
        const url = `https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${encodeURIComponent(fileId)}`;
        const res = await fetch(url, { method: 'GET' });

        if (!res.ok) {
            console.error(`getFile HTTP错误! 状态: ${res.status}`);
            return null;
        }

        const responseData = await res.json();
        if (responseData.ok && responseData.result && responseData.result.file_path) {
            const path = responseData.result.file_path;
            _tgPathMem.set(fileId, { path, exp: now + TG_PATH_TTL_SEC * 1000 });
            try {
                await kvPut(env, kvKey, path, { expirationTtl: TG_PATH_TTL_SEC });
            } catch { /* ignore */ }
            return path;
        }
        console.error('getFile 响应数据错误:', responseData);
        return null;
    } catch (error) {
        console.error('获取文件路径错误:', error.message);
        return null;
    }
}

/**
 * 代理文件请求：透传原图，写入边缘缓存（可选）。
 * @param {{ cacheKey: Request|null, isDownload: boolean }} opts
 */
async function proxyFile(c, fileUrl, opts = {}) {
    const { cacheKey = null, isDownload = false } = opts;

    // 干净 GET，不转发浏览器头（避免 Host/Accept-Encoding 干扰 Telegram）
    const response = await fetch(fileUrl, { method: 'GET' });

    if (!response.ok) {
        return c.text('文件获取失败', response.status);
    }

    const headers = new Headers();
    // 只透传安全/有用的响应头，避免把 Telegram 的 set-cookie 等带出去
    const pass = ['content-type', 'content-length', 'etag', 'last-modified'];
    response.headers.forEach((value, key) => {
        if (pass.includes(key.toLowerCase())) headers.set(key, value);
    });

    // 浏览器缓存 1 年（内容按 file_id 寻址，视为不可变）
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    // Content-Type：Telegram 常返回 application/octet-stream，优先用我们 URL 里的扩展名
    const reqId = (c.req.param('id') || '').toLowerCase();
    const extFromId = (reqId.split('.').pop() || '').toLowerCase();
    const extFromUrl = (fileUrl.split('.').pop() || '').toLowerCase().split('?')[0];
    const mimeMap = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
        bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon',
        heic: 'image/heic', heif: 'image/heif',
    };
    const mimeFromExt = mimeMap[extFromId] || mimeMap[extFromUrl];
    const upstreamType = (headers.get('Content-Type') || '').toLowerCase();
    const upstreamIsGeneric = !upstreamType || upstreamType.includes('octet-stream') || upstreamType === 'application/download';
    if (mimeFromExt && (upstreamIsGeneric || !upstreamType.startsWith('image/'))) {
        headers.set('Content-Type', mimeFromExt);
    } else if (!headers.get('Content-Type') && mimeFromExt) {
        headers.set('Content-Type', mimeFromExt);
    }

    // SVG 安全：附件下载 + nosniff；其它图片内联
    const isSvg = reqId.endsWith('.svg') || (headers.get('Content-Type') || '').includes('svg');
    if (isSvg) {
        headers.set('Content-Type', 'image/svg+xml');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Content-Disposition', 'attachment');
    } else if (isDownload) {
        headers.set('Content-Disposition', 'attachment');
    } else {
        headers.set('Content-Disposition', 'inline');
    }

    const out = new Response(response.body, {
        status: response.status,
        headers,
    });

    // 边缘缓存：异步写入，不挡响应
    if (cacheKey && response.ok && !isSvg) {
        try {
            const toCache = out.clone();
            // Cache API 要求 Response 可缓存：确保 Cache-Control 允许
            c.executionCtx.waitUntil(caches.default.put(cacheKey, toCache));
        } catch { /* ignore */ }
    }

    return out;
}