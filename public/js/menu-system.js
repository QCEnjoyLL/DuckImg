/**
 * 菜单管理系统 - 鸭鸭图床
 * 统一渲染侧边菜单与顶栏用户下拉，处理导航/可见性/激活态。
 * 渲染在脚本执行时同步进行（脚本位于 body 末尾，#sideMenu 已存在），
 * 早于各页 DOMContentLoaded 处理器，故页面脚本仍能正确绑定到统一后的菜单元素。
 */

// ===== 规范侧边菜单（所有页面统一） =====
const CANONICAL_MENU_HTML = `
    <div class="menu-category">主要功能</div>
    <a href="/" class="menu-item">
        <div class="menu-item-icon"><i class="ri-home-5-line"></i></div>
        <div class="menu-item-text">首页</div>
        <div class="menu-tooltip">首页</div>
    </a>
    <a href="/dashboard.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-image-2-line"></i></div>
        <div class="menu-item-text">我的图片</div>
        <div class="menu-tooltip">我的图片</div>
    </a>
    <a href="#" class="menu-item" id="uploadMenuBtn">
        <div class="menu-item-icon"><i class="ri-upload-cloud-2-line"></i></div>
        <div class="menu-item-text">上传图片</div>
        <div class="menu-tooltip">上传图片</div>
    </a>
    <a href="#" class="menu-item" id="statsMenuItem">
        <div class="menu-item-icon"><i class="ri-bar-chart-2-line"></i></div>
        <div class="menu-item-text">统计信息</div>
        <div class="menu-tooltip">统计信息</div>
    </a>

    <div class="menu-category">图片管理</div>
    <a href="/favorites.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-star-line"></i></div>
        <div class="menu-item-text">收藏图片</div>
        <div class="menu-tooltip">收藏图片</div>
    </a>
    <a href="#" class="menu-item" id="recentMenuItem">
        <div class="menu-item-icon"><i class="ri-time-line"></i></div>
        <div class="menu-item-text">最近上传</div>
        <div class="menu-tooltip">最近上传</div>
    </a>
    <a href="/tags.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-price-tag-3-line"></i></div>
        <div class="menu-item-text">标签管理</div>
        <div class="menu-tooltip">标签管理</div>
    </a>

    <div class="menu-category">账户</div>
    <a href="/login.html" class="menu-item" id="loginMenuItem" style="display: none;">
        <div class="menu-item-icon"><i class="ri-login-box-line"></i></div>
        <div class="menu-item-text">登录</div>
        <div class="menu-tooltip">登录</div>
    </a>
    <a href="/profile.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-user-settings-line"></i></div>
        <div class="menu-item-text">用户资料</div>
        <div class="menu-tooltip">用户资料</div>
    </a>
    <a href="/settings.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-settings-3-line"></i></div>
        <div class="menu-item-text">系统设置</div>
        <div class="menu-tooltip">系统设置</div>
    </a>
    <a href="/admin.html" class="menu-item" id="adminMenuItem" style="display: none;">
        <div class="menu-item-icon"><i class="ri-shield-star-line"></i></div>
        <div class="menu-item-text">管理后台</div>
        <div class="menu-tooltip">管理后台</div>
    </a>
    <a href="#" class="menu-item" id="logoutMenuItem">
        <div class="menu-item-icon"><i class="ri-logout-box-line"></i></div>
        <div class="menu-item-text">退出登录</div>
        <div class="menu-tooltip">退出登录</div>
    </a>

    <div class="menu-category">更多</div>
    <a href="https://github.com/QCEnjoyLL/DuckImg" target="_blank" class="menu-item">
        <div class="menu-item-icon"><i class="ri-github-line"></i></div>
        <div class="menu-item-text">GitHub</div>
        <div class="menu-tooltip">GitHub</div>
    </a>
    <a href="/help.html" class="menu-item">
        <div class="menu-item-icon"><i class="ri-question-line"></i></div>
        <div class="menu-item-text">帮助文档</div>
        <div class="menu-tooltip">帮助文档</div>
    </a>
    <a href="#" class="menu-item" id="themeMenuItem">
        <div class="menu-item-icon"><i class="ri-moon-line"></i></div>
        <div class="menu-item-text">切换主题</div>
        <div class="menu-tooltip">切换主题</div>
    </a>
`;

// 顶栏用户下拉的规范内容（各页统一）
const CANONICAL_DROPDOWN_HTML = `
    <a href="/dashboard.html" class="dropdown-item">
        <i class="ri-image-2-line"></i>
        <span>我的图片</span>
    </a>
    <a href="/profile.html" class="dropdown-item">
        <i class="ri-user-settings-line"></i>
        <span>用户资料</span>
    </a>
    <a href="#" class="dropdown-item" id="logoutBtn">
        <i class="ri-logout-box-line"></i>
        <span>退出登录</span>
    </a>
`;

// 同步渲染统一菜单与下拉（脚本执行即生效）
function renderSideMenu() {
    const menuContent = document.querySelector('#sideMenu .menu-content');
    if (menuContent) menuContent.innerHTML = CANONICAL_MENU_HTML;

    const dropdownContent = document.querySelector('#userDropdown .user-dropdown-content');
    if (dropdownContent) dropdownContent.innerHTML = CANONICAL_DROPDOWN_HTML;
}
renderSideMenu();

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

    // 菜单切换按钮点击事件
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            toggleMenu();
        });
    }

    // 移动端菜单按钮点击事件
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            sideMenu.classList.add('mobile-visible');
            if (menuOverlay) menuOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }

    // 菜单遮罩点击事件
    if (menuOverlay) {
        menuOverlay.addEventListener('click', () => {
            sideMenu.classList.remove('mobile-visible');
            menuOverlay.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

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
            scrollToUploadArea();
        });
    }

    // 统计信息：本页有图表面板则打开；否则跳 dashboard 并自动打开
    if (statsMenuItem) {
        statsMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            const chartsPanel = document.getElementById('chartsPanel');
            if (chartsPanel) {
                chartsPanel.classList.add('active');
                document.body.style.overflow = 'hidden';
            } else {
                window.location.href = '/dashboard.html?stats=1';
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
 * 顶栏用户下拉：点击展开/收起，点外部或点条目关闭。
 * 解决原来纯 :hover + 间隙导致鼠标移过去就消失、点不到的问题。
 */
function initUserDropdownToggle() {
    const dropdown = document.getElementById('userDropdown');
    if (!dropdown) return;
    const btn = document.getElementById('userDropdownBtn');

    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });
    }

    // 点击下拉内的退出登录
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    // 点击外部关闭
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

    if (sideMenu.classList.contains('collapsed')) {
        sideMenu.classList.remove('collapsed');
        appContainer.classList.remove('menu-collapsed');
        appContainer.classList.add('menu-expanded');
        localStorage.setItem('menuState', 'expanded');
    } else {
        sideMenu.classList.add('collapsed');
        appContainer.classList.remove('menu-expanded');
        appContainer.classList.add('menu-collapsed');
        localStorage.setItem('menuState', 'collapsed');
    }
}

/**
 * 滚动到上传区域
 */
function scrollToUploadArea() {
    const uploadContainer = document.querySelector('.upload-container');
    if (uploadContainer) {
        uploadContainer.scrollIntoView({ behavior: 'smooth' });
        if (window.innerWidth <= 768) {
            const sideMenu = document.getElementById('sideMenu');
            const menuOverlay = document.getElementById('menuOverlay');
            sideMenu.classList.remove('mobile-visible');
            if (menuOverlay) menuOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
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
    } else {
        if (loginMenuItem) loginMenuItem.style.display = 'flex';
        if (logoutMenuItem) logoutMenuItem.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'flex';
        if (userDropdown) userDropdown.style.display = 'none';
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
