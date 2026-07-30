/**
 * 站点品牌应用：拉取后台「站点设置」并应用 Logo、菜单链接、页脚文字。
 * 找不到元素就跳过（各页结构不同，容错）。
 */
(function () {
    /**
     * 安全富文本：只保留文本 + <br> + <a href="http(s)://...|/...">。
     * 后台 pageFooter 历史配置含链接/换行；用 textContent 会把标签当字显示，
     * 用 innerHTML 又有 XSS 风险——折中为白名单重建 DOM。
     */
    function applySafeRichText(el, html) {
        if (!el) return;
        el.textContent = '';
        const tpl = document.createElement('template');
        // 兼容历史错误写法 </br>
        tpl.innerHTML = String(html || '').replace(/<\/br>/gi, '<br>');

        function isSafeHref(href) {
            const h = String(href || '').trim();
            if (!h) return false;
            if (h.startsWith('/')) return true;
            if (/^https?:\/\//i.test(h)) return true;
            if (/^mailto:/i.test(h)) return true;
            return false;
        }

        function walk(src, dest) {
            src.childNodes.forEach((child) => {
                if (child.nodeType === Node.TEXT_NODE) {
                    dest.appendChild(document.createTextNode(child.textContent || ''));
                    return;
                }
                if (child.nodeType !== Node.ELEMENT_NODE) return;
                const tag = child.tagName.toLowerCase();
                if (tag === 'br') {
                    dest.appendChild(document.createElement('br'));
                    return;
                }
                if (tag === 'a') {
                    const href = child.getAttribute('href') || '';
                    if (isSafeHref(href)) {
                        const a = document.createElement('a');
                        a.setAttribute('href', href);
                        a.setAttribute('target', '_blank');
                        a.setAttribute('rel', 'noopener noreferrer');
                        walk(child, a);
                        dest.appendChild(a);
                    } else {
                        // 危险/未知协议：只保留可见文本
                        walk(child, dest);
                    }
                    return;
                }
                // 其它标签（div/span/b/script…）一律展开，丢标签保文本
                walk(child, dest);
            });
        }

        walk(tpl.content, el);
    }

    // 站点配置几乎不变，同标签页内缓存 10 分钟，避免每次翻页都打一次 /api/site
    const SITE_CACHE_KEY = 'siteConfigCache';
    const SITE_CACHE_TTL = 10 * 60 * 1000;

    function readSiteCache() {
        try {
            const raw = sessionStorage.getItem(SITE_CACHE_KEY);
            if (!raw) return null;
            const c = JSON.parse(raw);
            if (!c || !c.at || (Date.now() - c.at) > SITE_CACHE_TTL) return null;
            return c.site || null;
        } catch { return null; }
    }

    function writeSiteCache(site) {
        try {
            sessionStorage.setItem(SITE_CACHE_KEY, JSON.stringify({ at: Date.now(), site }));
        } catch { /* 隐私模式等写入失败：忽略 */ }
    }

    async function applySiteConfig() {
        let site = readSiteCache();
        if (!site) {
            try {
                const res = await fetch('/api/site');
                if (!res.ok) return;
                const data = await res.json();
                site = data.site || {};
                writeSiteCache(site);
            } catch (e) {
                return; // 拉取失败不影响页面
            }
        }

        // 站点名称/标题：更新 Logo 文字与浏览器标题（仅替换品牌词，保留各页前后缀）
        if (site.siteName) {
            document.querySelectorAll('.menu-logo h1, .logo h1').forEach(el => {
                el.textContent = site.siteName;
            });
            if (document.title) {
                document.title = document.title.replace(/鸭鸭图床/g, site.siteName);
            }
        }

        // Logo：更新 src 并约束尺寸（任意尺寸的自定义图都不撑大）
        if (site.logoUrl) {
            document.querySelectorAll('img.logo-img, .menu-logo img').forEach(img => {
                img.src = site.logoUrl;
                img.style.height = '36px';
                img.style.width = 'auto';
                img.style.maxWidth = '140px';
                img.style.objectFit = 'contain';
            });

            // 标签页图标跟随 logo
            let icon = document.querySelector('link[rel="icon"]');
            if (!icon) {
                icon = document.createElement('link');
                icon.rel = 'icon';
                document.head.appendChild(icon);
            }
            icon.href = site.logoUrl;
            icon.removeAttribute('type'); // 自定义图类型未知，交给浏览器嗅探
        }

        // GitHub 链接
        if (site.githubUrl) {
            document.querySelectorAll('a.menu-item[href*="github"], a[href*="github.com"]').forEach(a => {
                a.href = site.githubUrl;
            });
        }

        // 帮助文档链接
        if (site.helpUrl) {
            document.querySelectorAll('a.menu-item[href$="help.html"], a[href$="/help.html"]').forEach(a => {
                a.href = site.helpUrl;
            });
        }

        // 侧边栏底部文字
        if (site.menuFooter) {
            document.querySelectorAll('.menu-footer').forEach(el => {
                el.textContent = site.menuFooter;
            });
        }

        // 页面底部：安全富文本（允许链接与换行，禁止任意 HTML）
        if (site.pageFooter) {
            document.querySelectorAll('footer.footer p').forEach(el => {
                applySafeRichText(el, site.pageFooter);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applySiteConfig);
    } else {
        applySiteConfig();
    }
})();
