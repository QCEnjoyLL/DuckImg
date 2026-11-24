/**
 * 网站公告弹窗
 * - 自动弹出：启用且当前版本未被"今日关闭/不再弹出"时弹一次
 * - 顶部「公告」按钮：随时强制查看（注入到 .header-actions，位于上传按钮左侧）
 */
(function () {
    let cachedAnnouncement = null;
    let cachedTopBar = null;

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
                        cachedTopBar = c.topBar || null;
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
            cachedTopBar = data.topBar || null;
            try {
                sessionStorage.setItem(ANN_CACHE_KEY, JSON.stringify({ at: Date.now(), announcement: cachedAnnouncement, topBar: cachedTopBar }));
            } catch { /* 忽略 */ }
            return cachedAnnouncement;
        } catch (e) {
            console.warn('加载公告失败:', e);
            return null;
        }
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
        t.setAttribute('role', 'status');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);background:var(--card-bg,#151518);color:var(--text-color,#f3f3f2);border:1px solid var(--border-color,rgba(255,255,255,0.12));padding:9px 16px;border-radius:10px;z-index:100000;font-size:0.875rem;font-weight:500;box-shadow:var(--shadow-md,0 8px 24px rgba(0,0,0,0.16));';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1800);
    }

    function showAnnouncementModal(a) {
        if (document.getElementById('announcementOverlay')) return; // 避免重复
        const overlay = document.createElement('div');
        overlay.id = 'announcementOverlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'annModalTitle');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: var(--scrim, rgba(10,10,12,0.5));
            display: flex; align-items: center; justify-content: center;
            z-index: 99999; padding: 20px; overscroll-behavior: contain;
        `;

        const contentHtml = escapeHtml(a.content).replace(/\n/g, '<br>');

        overlay.innerHTML = `
            <div style="position:relative;background:var(--card-bg,#fff);color:var(--text-color,#141413);border:1px solid var(--border-color,rgba(20,20,19,0.09));border-radius:14px;max-width:440px;width:100%;padding:24px;box-shadow:var(--shadow-lg,0 16px 40px rgba(0,0,0,0.18));font-family:var(--font-sans,system-ui,sans-serif);">
                <button type="button" id="annClose" title="关闭" aria-label="关闭公告" style="position:absolute;top:14px;right:14px;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid transparent;border-radius:8px;font-size:1.25rem;line-height:1;color:var(--text-light,#62625e);cursor:pointer;">&times;</button>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-right:36px;">
                    <i class="ri-notification-3-line" aria-hidden="true" style="color:var(--primary-color,#18181b);font-size:1.2rem;"></i>
                    <h3 id="annModalTitle" style="margin:0;font-size:1.05rem;font-weight:600;letter-spacing:-0.015em;color:var(--text-color,#141413);">${escapeHtml(a.title) || '公告'}</h3>
                </div>
                <div style="font-size:0.9rem;line-height:1.65;color:var(--text-light,#5c5c58);max-height:50vh;overflow-y:auto;overscroll-behavior:contain;">${contentHtml}</div>
                <div style="display:flex;gap:10px;margin-top:20px;">
                    <button type="button" id="annToday" style="flex:1;min-height:40px;padding:0 14px;background:var(--fill-tertiary,rgba(20,20,19,0.05));color:var(--text-color,#141413);border:1px solid var(--border-color,rgba(20,20,19,0.09));border-radius:8px;font-size:0.875rem;font-weight:500;cursor:pointer;">今日关闭</button>
                    <button type="button" id="annNever" style="flex:1;min-height:40px;padding:0 14px;background:var(--primary-color,#18181b);color:var(--text-on-primary,#fff);border:1px solid transparent;border-radius:8px;font-size:0.875rem;font-weight:500;cursor:pointer;">不再弹出</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const onKeyDown = (e) => {
            if (e.key === 'Escape') close();
        };
        const close = () => {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
        };
        document.addEventListener('keydown', onKeyDown);
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

    // 顶栏中间公告：短文静止居中，放不下自动滚动
    function renderTopBar(tb) {
        if (!tb || !tb.enabled || !tb.text) return;
        const host = document.querySelector('.header-center');
        if (!host || document.getElementById('topAnnounce')) return;

        if (!document.getElementById('topAnnounceStyle')) {
            const st = document.createElement('style');
            st.id = 'topAnnounceStyle';
            st.textContent = `
#topAnnounce{display:flex;align-items:center;justify-content:center;width:100%;min-width:0;overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);}
#topAnnounce .ta-text{display:inline-block;white-space:nowrap;font-size:0.88rem;color:var(--text-light,#8b93a7);}
#topAnnounce.scrolling{justify-content:flex-start;}
#topAnnounce.scrolling .ta-text{padding-left:100%;animation:taScroll var(--ta-dur,16s) linear infinite;will-change:transform;}
@keyframes taScroll{from{transform:translateX(0)}to{transform:translateX(-100%)}}
@media (prefers-reduced-motion: reduce){#topAnnounce.scrolling .ta-text{animation:none;padding-left:0;}}`;
            document.head.appendChild(st);
        }

        // header-center 在部分页面是空的零宽 flex 项，补上占位属性
        host.style.flex = host.style.flex || '1 1 auto';
        host.style.minWidth = '0';

        const wrap = document.createElement('div');
        wrap.id = 'topAnnounce';
        const span = document.createElement('span');
        span.className = 'ta-text';
        span.textContent = tb.text; // textContent 防注入
        wrap.appendChild(span);
        host.appendChild(wrap);

        const evalScroll = () => {
            wrap.classList.remove('scrolling'); // 先去掉 padding 再测量真实文字宽
            if (span.scrollWidth > wrap.clientWidth + 4) {
                // 约 50px/s，时长 8–40s 封顶
                const dur = Math.min(40, Math.max(8, Math.round((span.scrollWidth + wrap.clientWidth) / 50)));
                wrap.style.setProperty('--ta-dur', dur + 's');
                wrap.classList.add('scrolling');
            }
        };
        evalScroll();
        window.addEventListener('resize', evalScroll);
    }

    async function start() {
        injectHeaderButton();
        const a = await fetchAnnouncement();
        renderTopBar(cachedTopBar);
        if (a && a.enabled && a.content && !isSuppressed(a)) showAnnouncementModal(a);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
