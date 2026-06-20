/**
 * 全局主题管理器
 * 负责管理所有页面的主题切换功能
 */

class ThemeManager {
    constructor() {
        this.theme = this.getStoredTheme() || 'light';
        this.initialized = false;
    }

    // 初始化主题管理器
    init() {
        if (this.initialized) return;
        
        // 应用初始主题
        this.applyTheme(this.theme);
        
        // 绑定所有主题切换元素
        this.bindThemeToggleElements();
        
        // 监听系统主题变化
        this.watchSystemTheme();
        
        // 监听存储变化（跨标签页同步）
        this.watchStorageChanges();
        
        this.initialized = true;
    }

    // 获取存储的主题
    getStoredTheme() {
        return localStorage.getItem('theme');
    }

    // 存储主题
    storeTheme(theme) {
        localStorage.setItem('theme', theme);
    }

    // 应用主题
    applyTheme(theme) {
        this.theme = theme;
        
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        
        // 更新所有主题切换开关的状态
        this.updateToggleSwitches(theme === 'dark');
        
        // 触发自定义事件
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
    }

    // 切换主题
    toggleTheme() {
        const newTheme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        this.storeTheme(newTheme);
    }

    // 设置主题
    setTheme(theme) {
        if (theme === 'dark' || theme === 'light') {
            this.applyTheme(theme);
            this.storeTheme(theme);
        }
    }

    // 更新所有主题切换开关的状态
    updateToggleSwitches(isDark) {
        // 更新所有 switch checkbox
        const switches = document.querySelectorAll('#switch');
        switches.forEach(switchEl => {
            switchEl.checked = isDark;
        });
        
        // 更新设置页面的 darkModeToggle
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.classList.toggle('active', isDark);
        }
    }

    // 绑定所有主题切换元素
    bindThemeToggleElements() {
        // 绑定所有 switch checkbox
        const switches = document.querySelectorAll('#switch');
        switches.forEach(switchEl => {
            switchEl.addEventListener('change', (e) => {
                const theme = e.target.checked ? 'dark' : 'light';
                this.setTheme(theme);
            });
        });
        
        // 绑定主题切换按钮
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleTheme();
            });
        }
        
        // 绑定设置页面的 darkModeToggle
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }
        
        // 绑定菜单项的主题切换
        const themeMenuItem = document.getElementById('themeMenuItem');
        if (themeMenuItem) {
            themeMenuItem.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleTheme();
            });
        }
    }

    // 监听系统主题变化
    watchSystemTheme() {
        const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
        
        // 如果没有存储的主题，使用系统主题
        if (!this.getStoredTheme()) {
            const systemTheme = prefersDarkScheme.matches ? 'dark' : 'light';
            this.applyTheme(systemTheme);
        }
        
        // 监听系统主题变化
        prefersDarkScheme.addEventListener('change', (e) => {
            // 只有在没有手动设置主题时才跟随系统
            if (!this.getStoredTheme()) {
                const systemTheme = e.matches ? 'dark' : 'light';
                this.applyTheme(systemTheme);
            }
        });
    }

    // 监听存储变化（跨标签页同步）
    watchStorageChanges() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'theme' && e.newValue) {
                this.applyTheme(e.newValue);
            }
        });
    }
}

// 创建全局主题管理器实例
const themeManager = new ThemeManager();

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        themeManager.init();
    });
} else {
    themeManager.init();
}

// 导出到全局
window.themeManager = themeManager; 