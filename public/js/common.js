/**
 * 通用功能模块
 * 处理页面加载、滚动进度条、通用工具函数等
 */

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    initPageLoader();
    initScrollProgress();
    initNotifications();
});

/**
 * 初始化页面加载动画
 */
function initPageLoader() {
    const pageLoader = document.getElementById('pageLoader');
    
    if (pageLoader) {
        // 页面加载完成后隐藏加载动画
        window.addEventListener('load', () => {
            setTimeout(() => {
                pageLoader.style.opacity = '0';
                setTimeout(() => {
                    pageLoader.style.display = 'none';
                }, 300);
            }, 500); // 延迟500ms让用户看到加载动画
        });
        
        // 如果页面已经加载完成（防止事件错过）
        if (document.readyState === 'complete') {
            setTimeout(() => {
                pageLoader.style.opacity = '0';
                setTimeout(() => {
                    pageLoader.style.display = 'none';
                }, 300);
            }, 500);
        }
    }
}

/**
 * 初始化滚动进度条
 */
function initScrollProgress() {
    const progressBar = document.getElementById('scrollProgress');
    
    if (progressBar) {
        window.addEventListener('scroll', () => {
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            const progress = (scrollTop / (documentHeight - windowHeight)) * 100;
            progressBar.style.width = Math.min(progress, 100) + '%';
        });
    }
}

/**
 * 初始化通知系统
 */
function initNotifications() {
    // 如果通知样式还没有添加，添加它们
    if (!document.querySelector('#common-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'common-notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                background: var(--card-bg);
                border-radius: 8px;
                box-shadow: var(--shadow-lg);
                animation: slideInRight 0.3s ease;
                padding: 1rem;
                min-width: 300px;
                max-width: 400px;
            }
            
            body.dark-mode .notification {
                background: var(--dark-card-bg);
            }
            
            .notification-success {
                border-left: 4px solid #10b981;
            }
            
            .notification-error {
                border-left: 4px solid #ef4444;
            }
            
            .notification-warning {
                border-left: 4px solid #f59e0b;
            }
            
            .notification-info {
                border-left: 4px solid #3b82f6;
            }
            
            .notification-content {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                font-weight: 500;
                color: var(--text-color);
            }
            
            body.dark-mode .notification-content {
                color: var(--dark-text);
            }
            
            .notification-close {
                background: none;
                border: none;
                color: var(--text-light);
                cursor: pointer;
                margin-left: auto;
                padding: 0.25rem;
                border-radius: 4px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .notification-close:hover {
                background: rgba(0, 0, 0, 0.1);
                color: var(--text-color);
            }
            
            body.dark-mode .notification-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: var(--dark-text);
            }
            
            .loading-spinner {
                display: inline-block;
                width: 40px;
                height: 40px;
                border: 4px solid var(--border-color);
                border-radius: 50%;
                border-top-color: var(--primary-color);
                animation: spin 1s ease-in-out infinite;
            }
            
            body.dark-mode .loading-spinner {
                border-color: var(--dark-border);
                border-top-color: var(--primary-color);
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * 显示通知
 */
function showNotification(message, type = 'info', duration = 3000) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="ri-${getNotificationIcon(type)}-line"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="ri-close-line"></i>
            </button>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 自动删除
    if (duration > 0) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s ease forwards';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, duration);
    }
    
    return notification;
}

/**
 * 获取通知图标
 */
function getNotificationIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'error-warning',
        info: 'information',
        warning: 'alert-circle'
    };
    return icons[type] || 'information';
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 格式化日期
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return '昨天';
    } else if (diffDays < 7) {
        return `${diffDays}天前`;
    } else if (diffDays < 30) {
        return `${Math.floor(diffDays / 7)}周前`;
    } else {
        return date.toLocaleDateString('zh-CN');
    }
}

/**
 * 防抖函数
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数
 */
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 复制到剪贴板
 */
function copyToClipboard(text) {
    if (navigator.clipboard) {
        return navigator.clipboard.writeText(text).then(() => {
            showNotification('已复制到剪贴板', 'success');
            return true;
        }).catch(err => {
            console.error('复制失败:', err);
            return fallbackCopyToClipboard(text);
        });
    } else {
        return fallbackCopyToClipboard(text);
    }
}

/**
 * 降级复制方案
 */
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showNotification('已复制到剪贴板', 'success');
        } else {
            showNotification('复制失败，请手动复制', 'error');
        }
        return successful;
    } catch (err) {
        console.error('复制失败:', err);
        showNotification('复制失败，请手动复制', 'error');
        return false;
    } finally {
        document.body.removeChild(textArea);
    }
}

/**
 * 滚动到顶部
 */
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 检查元素是否在视口中
 */
function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

/**
 * 生成随机ID
 */
function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 深拷贝对象
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    
    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }
    
    if (typeof obj === 'object') {
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }
}

// 导出函数供其他模块使用
window.commonUtils = {
    showNotification,
    formatFileSize,
    formatDate,
    debounce,
    throttle,
    copyToClipboard,
    scrollToTop,
    isElementInViewport,
    generateId,
    deepClone
}; 