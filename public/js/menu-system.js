/**
 * 菜单管理系统 - 鸭鸭图床
 * 统一渲染侧边菜单与顶栏用户下拉，处理导航/可见性/激活态。
 * 渲染在脚本执行时同步进行（脚本位于 body 末尾，#sideMenu 已存在），
 * 早于各页 DOMContentLoaded 处理器，故页面脚本仍能正确绑定到统一后的菜单元素。
 */

// ===== 规范侧边菜单（所有页面统一） =====
// 导航只保留页面入口；上传/统计走顶栏或 dashboard 内按钮，避免与「我的图片」重叠
const CANONICAL_MENU_HTML = `
    <div class="menu-category" data-i18n="menu.main">主要功能</div>
    <a href="/" class="menu-item">
        <div class="menu-item-icon"><i class="ri-home-5-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.home">首页</div>
        <div class="menu-tooltip" data-i18n="menu.home">首页</div>
    </a>
    <a href="/dashboard.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-image-2-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.images">我的图片</div>
        <div class="menu-tooltip" data-i18n="menu.images">我的图片</div>
    </a>
    <a href="/favorites.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-star-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.favorites">收藏图片</div>
        <div class="menu-tooltip" data-i18n="menu.favorites">收藏图片</div>
    </a>
    <a href="/tags.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-price-tag-3-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.tags">标签管理</div>
        <div class="menu-tooltip" data-i18n="menu.tags">标签管理</div>
    </a>

    <div class="menu-category" data-i18n="menu.account">账户</div>
    <a href="/login.html" class="menu-item" id="loginMenuItem" style="display: none;">
        <div class="menu-item-icon"><i class="ri-login-box-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.login">登录</div>
        <div class="menu-tooltip" data-i18n="menu.login">登录</div>
    </a>
    <a href="/profile.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-user-settings-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.profile">用户资料</div>
        <div class="menu-tooltip" data-i18n="menu.profile">用户资料</div>
    </a>
    <a href="/settings.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-settings-3-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.settings">系统设置</div>
        <div class="menu-tooltip" data-i18n="menu.settings">系统设置</div>
    </a>
    <a href="/admin.html" class="menu-item" id="adminMenuItem" style="display: none;">
        <div class="menu-item-icon"><i class="ri-shield-star-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.admin">管理后台</div>
        <div class="menu-tooltip" data-i18n="menu.admin">管理后台</div>
    </a>
    <a href="#" class="menu-item" id="logoutMenuItem">
        <div class="menu-item-icon"><i class="ri-logout-box-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.logout">退出登录</div>
        <div class="menu-tooltip" data-i18n="menu.logout">退出登录</div>
    </a>

    <div class="menu-category" data-i18n="menu.more">更多</div>
    <a href="https://github.com/QCEnjoyLL/DuckImg" target="_blank" class="menu-item">
        <div class="menu-item-icon"><i class="ri-github-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.github">GitHub</div>
        <div class="menu-tooltip" data-i18n="menu.github">GitHub</div>
    </a>
    <a href="/help.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-question-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.help">帮助文档</div>
        <div class="menu-tooltip" data-i18n="menu.help">帮助文档</div>
    </a>
    <a href="#" class="menu-item" id="themeMenuItem">
        <div class="menu-item-icon"><i class="ri-palette-line"></i></div>
        <div class="menu-item-text" data-i18n="menu.palette">切换配色</div>
        <div class="menu-tooltip" data-i18n="menu.palette">切换配色</div>
    </a>
`;

// 顶栏用户下拉的规范内容（各页统一）
const CANONICAL_DROPDOWN_HTML = `
    <a href="/dashboard.html" class="dropdown-item">
        <i class="ri-image-2-line"></i>
        <span data-i18n="menu.images">我的图片</span>
    </a>
    <a href="/profile.html" class="dropdown-item">
        <i class="ri-user-settings-line"></i>
        <span data-i18n="menu.profile">用户资料</span>
    </a>
    <a href="#" class="dropdown-item" id="logoutBtn">
        <i class="ri-logout-box-line"></i>
        <span data-i18n="menu.logout">退出登录</span>
    </a>
`;

// 同步渲染统一菜单与下拉（脚本执行即生效）
function renderSideMenu() {
    const menuContent = document.querySelector('#sideMenu .menu-content');
    if (menuContent) menuContent.innerHTML = CANONICAL_MENU_HTML;

    const dropdownContent = document.querySelector('#userDropdown .user-dropdown-content');
    if (dropdownContent) dropdownContent.innerHTML = CANONICAL_DROPDOWN_HTML;

    // 应用当前语言
    if (window.UserPrefs && typeof window.UserPrefs.applyLanguage === 'function') {
        const lang = (window.UserPrefs.read && window.UserPrefs.read().language) || localStorage.getItem('userSettings') && (() => { try { return JSON.parse(localStorage.getItem('userSettings')).language; } catch { return 'zh-CN'; } })() || 'zh-CN';
        window.UserPrefs.applyLanguage(lang);
    }
}
renderSideMenu();

// 语言切换后刷新菜单（menu 若被重绘也会再走 renderSideMenu）
window.addEventListener('languageChanged', () => {
    // data-i18n 已在 applyLanguage 中处理；此处无需重绘
});
window.addEventListener('userPrefsChanged', (e) => {
    if (e.detail && e.detail.language && window.UserPrefs) {
        window.UserPrefs.applyLanguage(e.detail.language);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // 初始化菜单系统
    initMenuSystem();

    // 初始化菜单项状态
    updateMenuItemsState();

    // 顶栏用户下拉：点击切换（修复悬停间隙导致点不到的问题）
    initUserDropdownToggle();
});

/**
 * 初始化菜单系统
 */
function initMenuSystem() {
    // 获取菜单元素
    const sideMenu = document.getElementById('sideMenu');
    const menuToggle = document.getElementById('menuToggle');
    const menuOverlay = document.getElementById('menuOverlay');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const appContainer = document.querySelector('.app-container');
    const uploadMenuBtn = document.getElementById('uploadMenuBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const themeMenuItem = document.getElementById('themeMenuItem');
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    // statsMenuItem / recentMenuItem 已从侧栏移除，仅兼容旧 DOM（若仍有）
    const statsMenuItem = document.getElementById('statsMenuItem');
    const recentMenuItem = document.getElementById('recentMenuItem');

    // 检查元素是否存在
    if (!sideMenu || !appContainer) {
        console.error('菜单元素未找到');
        return;
    }

    // 从本地存储中获取菜单状态
    const menuState = localStorage.getItem('menuState') || 'expanded';

    // 根据保存的状态设置初始菜单状态
    if (menuState === 'collapsed') {
        sideMenu.classList.add('collapsed');
        appContainer.classList.remove('menu-expanded');
        appContainer.classList.add('menu-collapsed');
    }

    // 桌面折叠：pointerdown 立即响应（比 click 快，且避免子元素吞事件）
    if (menuToggle) {
        let toggling = false;
        const onToggle = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (toggling) return;
            // 移动端：该按钮应隐藏；若仍显示则关闭抽屉
            if (window.innerWidth <= 768) {
                if (window.DuckShell) window.DuckShell.closeDrawer();
                return;
            }
            toggling = true;
            toggleMenu();
            setTimeout(() => { toggling = false; }, 80);
        };
        menuToggle.addEventListener('pointerdown', onToggle);
        if (!menuToggle.hasAttribute('tabindex')) menuToggle.setAttribute('tabindex', '0');
        if (!menuToggle.hasAttribute('role')) menuToggle.setAttribute('role', 'button');
        menuToggle.setAttribute('aria-label', '展开或折叠侧边栏');
        menuToggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') onToggle(e);
        });
    }

    // 移动端抽屉：统一走 DuckShell（可靠关闭 + scroll lock）
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.DuckShell) window.DuckShell.toggleDrawer();
            else {
                sideMenu.classList.toggle('mobile-visible');
                if (menuOverlay) menuOverlay.classList.toggle('active');
            }
        });
    }

    if (menuOverlay) {
        menuOverlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.DuckShell) window.DuckShell.closeDrawer();
            else {
                sideMenu.classList.remove('mobile-visible');
                menuOverlay.classList.remove('active');
                document.body.style.overflow = '';
                if (window.DuckShell && window.DuckShell.forceUnlock) window.DuckShell.forceUnlock();
            }
        });
        // pointerdown 更跟手，避免 touch 上 click 延迟
        menuOverlay.addEventListener('pointerdown', (e) => {
            if (e.target !== menuOverlay) return;
            e.preventDefault();
            if (window.DuckShell) window.DuckShell.closeDrawer();
        });
    }

    // 移动端点菜单链接后立刻关抽屉（避免遮罩残留）
    sideMenu.querySelectorAll('a.menu-item').forEach((link) => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768 && window.DuckShell) {
                window.DuckShell.closeDrawer();
            }
        });
    });

    // 上传按钮点击事件：有上传区则滚动，否则跳首页上传
    if (uploadMenuBtn) {
        uploadMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (document.querySelector('.upload-container')) {
                scrollToUploadArea();
            } else {
                window.location.href = '/';
            }
        });
    }

    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            // 本页有上传区则滚动；管理/设置等页没有上传区 → 回首页上传
            if (document.querySelector('.upload-container')) {
                scrollToUploadArea();
            } else {
                window.location.href = '/';
            }
        });
    }

    // 统计信息：本页有图表面板则打开；否则跳 dashboard 并自动打开
    if (statsMenuItem) {
        statsMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.openChartsPanel === 'function') {
                window.openChartsPanel();
            } else {
                const chartsPanel = document.getElementById('chartsPanel');
                if (chartsPanel) {
                    chartsPanel.classList.add('active');
                    const scrim = document.getElementById('chartsPanelScrim');
                    if (scrim) scrim.classList.add('active');
                    if (window.DuckShell) window.DuckShell.lockScroll();
                    else document.body.style.overflow = 'hidden';
                } else {
                    window.location.href = '/dashboard.html?stats=1';
                }
            }
        });
    }

    // 最近上传：跳转到「我的图片」并按最新排序
    if (recentMenuItem) {
        recentMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/dashboard.html?sort=newest';
        });
    }

    // 主题切换由 theme-manager.js 统一绑定 #themeMenuItem，这里不再重复绑定
    // （重复绑定会导致一次点击触发两次切换、相互抵消）

    // 退出登录菜单项点击事件
    if (logoutMenuItem) {
        logoutMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    // 监听窗口大小变化
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) {
            if (!sideMenu.classList.contains('mobile-visible')) {
                sideMenu.classList.remove('collapsed');
            }
        }
    });

    // 初始检查窗口大小
    if (window.innerWidth <= 768) {
        sideMenu.classList.remove('collapsed');
    }
}

/**
 * 顶栏用户下拉：
 * - 桌面：悬停整块（含菜单）保持打开；离开后短延迟关闭，方便斜向移入菜单
 * - 触控/点击：点按钮钉住 .active，点外部关闭
 */
function initUserDropdownToggle() {
    const dropdown = document.getElementById('userDropdown');
    if (!dropdown) return;
    const btn = document.getElementById('userDropdownBtn');
    let leaveTimer = null;

    const open = () => {
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
        dropdown.classList.add('active');
    };
    const scheduleClose = () => {
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => {
            dropdown.classList.remove('active');
            leaveTimer = null;
        }, 220); // delay so diagonal move into menu still works
    };

    dropdown.addEventListener('mouseenter', open);
    dropdown.addEventListener('mouseleave', scheduleClose);

    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // touch / click pin: toggle
            if (dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            } else {
                open();
            }
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
}

/**
 * 切换菜单展开/折叠状态
 */
function toggleMenu() {
    const sideMenu = document.getElementById('sideMenu');
    const appContainer = document.querySelector('.app-container');
    if (!sideMenu || !appContainer) return;

    const willCollapse = !sideMenu.classList.contains('collapsed');
    sideMenu.classList.toggle('collapsed', willCollapse);
    appContainer.classList.toggle('menu-collapsed', willCollapse);
    appContainer.classList.toggle('menu-expanded', !willCollapse);
    localStorage.setItem('menuState', willCollapse ? 'collapsed' : 'expanded');

    const toggle = document.getElementById('menuToggle');
    if (toggle) toggle.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
}

/**
 * 滚动到上传区域
 */
function scrollToUploadArea() {
    const uploadContainer = document.querySelector('.upload-container');
    if (uploadContainer) {
        uploadContainer.scrollIntoView({ behavior: 'smooth' });
        if (window.innerWidth <= 768) {
            if (window.DuckShell) window.DuckShell.closeDrawer();
            else {
                const sideMenu = document.getElementById('sideMenu');
                const menuOverlay = document.getElementById('menuOverlay');
                if (sideMenu) sideMenu.classList.remove('mobile-visible');
                if (menuOverlay) menuOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        }
        return;
    }
    // 非首页（无上传区）统一回首页
    window.location.href = '/';
}

/**
 * 切换主题
 */
function toggleTheme() {
    if (window.themeManager) {
        window.themeManager.toggleTheme();
    }
}

/**
 * 退出登录
 */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
}

/**
 * 更新菜单项状态
 */
function updateMenuItemsState() {
    const isLoggedIn = checkUserLoggedIn();

    const loginMenuItem = document.getElementById('loginMenuItem');
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    const loginBtn = document.getElementById('loginBtn');
    const userDropdown = document.getElementById('userDropdown');
    const adminMenuItem = document.getElementById('adminMenuItem');

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdminUser = isLoggedIn && user && user.role === 'admin';

    if (isLoggedIn) {
        if (loginMenuItem) loginMenuItem.style.display = 'none';
        if (logoutMenuItem) logoutMenuItem.style.display = 'flex';
        if (loginBtn) loginBtn.style.display = 'none';
        if (userDropdown) userDropdown.style.display = 'block';
        updateUserDisplayName();
        // 不依赖 auth.js：各页都刷新顶栏头像
        if (typeof updateUserAvatar === 'function') updateUserAvatar();
        else applyHeaderAvatar(user);
    } else {
        if (loginMenuItem) loginMenuItem.style.display = 'flex';
        if (logoutMenuItem) logoutMenuItem.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'flex';
        if (userDropdown) userDropdown.style.display = 'none';
        applyHeaderAvatar(null);
    }

    // 管理后台入口仅管理员可见
    if (adminMenuItem) {
        adminMenuItem.style.display = isAdminUser ? 'flex' : 'none';
    }

    setActiveMenuItem();
}

/**
 * 检查用户是否已登录
 */
function checkUserLoggedIn() {
    const token = localStorage.getItem('token');
    return !!token;
}

/**
 * 更新用户显示名称
 */
function updateUserDisplayName() {
    const userDisplayName = document.getElementById('userDisplayName');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (userDisplayName && user.username) {
        userDisplayName.textContent = user.username;
    }
}

/**
 * 顶栏头像（menu-system 自带，避免页面未加载 auth.js 时只有默认图标）
 */
function applyHeaderAvatar(user) {
    const userAvatars = document.querySelectorAll('.user-avatar');
    if (!userAvatars.length) return;

    if (user && user.avatarUrl) {
        userAvatars.forEach((avatar) => {
            avatar.innerHTML = '';
            const img = document.createElement('img');
            img.src = user.avatarUrl;
            img.alt = '用户头像';
            img.className = 'user-avatar-img';
            img.onerror = function () {
                this.remove();
                avatar.innerHTML = '<i class="ri-user-3-line"></i>';
            };
            avatar.appendChild(img);
        });
    } else {
        userAvatars.forEach((avatar) => {
            avatar.innerHTML = '<i class="ri-user-3-line"></i>';
        });
    }
}

/**
 * 设置当前页面对应的菜单项为活动状态
 */
function setActiveMenuItem() {
    const currentPath = window.location.pathname;
    const menuItems = document.querySelectorAll('.menu-item');

    menuItems.forEach(item => {
        const itemPath = item.getAttribute('href');
        item.classList.remove('active');
        if (itemPath && currentPath === itemPath) {
            item.classList.add('active');
        }
        if (currentPath === '/' && itemPath === '/') {
            item.classList.add('active');
        }
    });
}
