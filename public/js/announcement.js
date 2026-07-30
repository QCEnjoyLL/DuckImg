/**
 * 网站公告弹窗
 * - 自动弹出：启用且当前版本未被"今日关闭/不再弹出"时弹一次
 * - 顶部「公告」按钮：随时强制查看（注入到 .header-actions，位于上传按钮左侧）
 */
(function () {
    let cachedAnnouncement = null;

    function todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function isSuppressed(a) {
        // 不再弹出（该版本）
        if (String(localStorage.getItem('announcementDismissedVersion')) === String(a.version)) return true;
        // 今日关闭（该版本 + 今天）
        if (String(localStorage.getItem('announcementClosedVersion')) === String(a.version) &&
            localStorage.getItem('announcementClosedDate') === todayStr()) return true;
        return false;
    }

    // 同标签页缓存 5 分钟，避免每次翻页都打一次 /api/announcement
    const ANN_CACHE_KEY = 'announcementCache';
    const ANN_CACHE_TTL = 5 * 60 * 1000;

    async function fetchAnnouncement(force) {
        if (!force) {
            try {
                const raw = sessionStorage.getItem(ANN_CACHE_KEY);
                if (raw) {
                    const c = JSON.parse(raw);
                    if (c && c.at && (Date.now() - c.at) < ANN_CACHE_TTL) {
                        cachedAnnouncement = c.announcement || null;
                        return cachedAnnouncement;
                    }
                }
            } catch { /* 缓存不可用：正常请求 */ }
        }
        try {
            const res = await fetch('/api/announcement');
            if (!res.ok) return null;
            const data = await res.json();
            cachedAnnouncement = data.announcement || null;
            try {
                sessionStorage.setItem(ANN_CACHE_KEY, JSON.stringify({ at: Date.now(), announcement: cachedAnnouncement }));
            } catch { /* 忽略 */ }
            return cachedAnnouncement;
        } catch (e) {
            console.warn('加载公告失败:', e);
            return null;
        }
    }

    // 自动弹出（受关闭状态控制）
    async function initAnnouncement() {
        const a = await fetchAnnouncement();
        if (!a || !a.enabled || !a.content) return;
        if (isSuppressed(a)) return;
        showAnnouncementModal(a);
    }

    // 强制查看（顶部按钮）：无视关闭状态
    async function openAnnouncement() {
        const a = cachedAnnouncement || await fetchAnnouncement();
        if (!a || !a.enabled || !a.content) {
            showEmptyToast('暂无公告');
            return;
        }
        showAnnouncementModal(a, true);
    }
    window.openAnnouncement = openAnnouncement;

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function showEmptyToast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);background:#374151;color:#fff;padding:10px 18px;border-radius:8px;z-index:100000;font-size:0.9rem;box-shadow:0 6px 20px rgba(0,0,0,0.3);';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1800);
    }

    function showAnnouncementModal(a) {
        if (document.getElementById('announcementOverlay')) return; // 避免重复
        const overlay = document.createElement('div');
        overlay.id = 'announcementOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.5);
            display: flex; align-items: center; justify-content: center;
            z-index: 99999; padding: 20px;
        `;

        const contentHtml = escapeHtml(a.content).replace(/\n/g, '<br>');

        overlay.innerHTML = `
            <div style="position:relative;background:#fff;color:#1f2937;border-radius:14px;max-width:460px;width:100%;padding:28px;box-shadow:0 20px 50px rgba(0,0,0,0.3);font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
                <button id="annClose" title="关闭" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:1.5rem;line-height:1;color:#9ca3af;cursor:pointer;">&times;</button>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-right:24px;">
                    <i class="ri-notification-3-line" style="color:#4361ee;font-size:1.4rem;"></i>
                    <h3 style="margin:0;font-size:1.2rem;color:#4361ee;">${escapeHtml(a.title) || '公告'}</h3>
                </div>
                <div style="font-size:0.95rem;line-height:1.7;color:#444;max-height:50vh;overflow:auto;">${contentHtml}</div>
                <div style="display:flex;gap:10px;margin-top:22px;">
                    <button id="annToday" style="flex:1;padding:0.7rem;background:#eef2ff;color:#4361ee;border:1px solid #c7d2fe;border-radius:8px;font-size:0.95rem;font-weight:500;cursor:pointer;">今日关闭</button>
                    <button id="annNever" style="flex:1;padding:0.7rem;background:linear-gradient(135deg,#4361ee,#3730a3);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:500;cursor:pointer;">不再弹出</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.getElementById('annClose').addEventListener('click', close);
        document.getElementById('annToday').addEventListener('click', () => {
            localStorage.setItem('announcementClosedVersion', String(a.version));
            localStorage.setItem('announcementClosedDate', todayStr());
            close();
        });
        document.getElementById('annNever').addEventListener('click', () => {
            localStorage.setItem('announcementDismissedVersion', String(a.version));
            close();
        });
    }

    // 在顶栏注入「公告」按钮（位于上传按钮左侧）
    function injectHeaderButton() {
        const actions = document.querySelector('.header-actions');
        if (!actions || document.getElementById('announcementHeaderBtn')) return;
        const btn = document.createElement('button');
        btn.id = 'announcementHeaderBtn';
        btn.className = 'header-action-btn';
        btn.title = '公告';
        btn.setAttribute('aria-label', '公告');
        btn.innerHTML = '<i class="ri-notification-3-line"></i>';
        btn.addEventListener('click', (e) => { e.preventDefault(); openAnnouncement(); });
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) actions.insertBefore(btn, uploadBtn);
        else actions.prepend(btn);
    }

    function start() {
        injectHeaderButton();
        initAnnouncement();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
