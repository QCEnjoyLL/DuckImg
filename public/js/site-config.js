/**
 * 站点品牌应用：拉取后台「站点设置」并应用 Logo、菜单链接、页脚文字。
 * 找不到元素就跳过（各页结构不同，容错）。
 */
(function () {
    async function applySiteConfig() {
        let site;
        try {
            const res = await fetch('/api/site');
            if (!res.ok) return;
            const data = await res.json();
            site = data.site || {};
        } catch (e) {
            return; // 拉取失败不影响页面
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

        // 页面底部文字（支持 HTML 标签，仅管理员可在后台设置）
        if (site.pageFooter) {
            document.querySelectorAll('footer.footer p').forEach(el => {
                el.innerHTML = site.pageFooter;
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applySiteConfig);
    } else {
        applySiteConfig();
    }
})();
