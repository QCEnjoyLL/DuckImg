/**
 * 系统设置页面功能
 * 处理各种设置项的交互和保存
 */

document.addEventListener('DOMContentLoaded', () => {
    initSettingsPage();
});

/**
 * 初始化设置页面
 */
function initSettingsPage() {
    // 加载当前设置
    loadCurrentSettings();
    
    // 初始化所有设置项的事件监听
    initSettingsEventListeners();
    
    // 检查存储使用情况
    updateStorageInfo();
    
    // 监听全局主题变化
    window.addEventListener('themeChanged', (e) => {
        updateDarkModeToggleState(e.detail.theme === 'dark');
    });
}

/**
 * 更新深色模式切换按钮状态
 */
function updateDarkModeToggleState(isDark) {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.classList.toggle('active', isDark);
    }
}

/**
 * 加载当前设置
 */
function loadCurrentSettings() {
    // 从本地存储加载设置
    const settings = getSettings();
    
    // 应用设置到界面
    applySettingsToUI(settings);
}

/**
 * 获取设置
 */
function getSettings() {
    const defaultSettings = {
        darkMode: false,
        language: 'zh-CN',
        animation: true,
        autoCompress: true,
        quality: 'medium',
        watermark: false,
        public: true,
        exif: false,
        loginNotify: true,
        autoClean: false
    };
    
    const savedSettings = localStorage.getItem('userSettings');
    return savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings;
}

/**
 * 保存设置
 */
function saveSettings(settings) {
    localStorage.setItem('userSettings', JSON.stringify(settings));
}

/**
 * 应用设置到UI
 */
function applySettingsToUI(settings) {
    // 深色模式 - 从全局主题管理器获取状态
    if (window.themeManager) {
        const isDark = window.themeManager.theme === 'dark';
        updateDarkModeToggleState(isDark);
        // 同步到本地设置
        settings.darkMode = isDark;
        saveSettings(settings);
    } else {
        // 如果主题管理器还未初始化，使用本地设置
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.classList.toggle('active', settings.darkMode);
        }
    }
    
    // 语言设置
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.value = settings.language;
    }
    
    // 动画效果
    const animationToggle = document.getElementById('animationToggle');
    if (animationToggle) {
        animationToggle.classList.toggle('active', settings.animation);
    }
    
    // 自动压缩
    const autoCompressToggle = document.getElementById('autoCompressToggle');
    if (autoCompressToggle) {
        autoCompressToggle.classList.toggle('active', settings.autoCompress);
    }
    
    // 图片质量
    const qualitySelect = document.getElementById('qualitySelect');
    if (qualitySelect) {
        qualitySelect.value = settings.quality;
    }
    
    // 水印设置
    const watermarkToggle = document.getElementById('watermarkToggle');
    if (watermarkToggle) {
        watermarkToggle.classList.toggle('active', settings.watermark);
    }
    
    // 公开可见
    const publicToggle = document.getElementById('publicToggle');
    if (publicToggle) {
        publicToggle.classList.toggle('active', settings.public);
    }
    
    // EXIF信息
    const exifToggle = document.getElementById('exifToggle');
    if (exifToggle) {
        exifToggle.classList.toggle('active', settings.exif);
    }
    
    // 登录提醒
    const loginNotifyToggle = document.getElementById('loginNotifyToggle');
    if (loginNotifyToggle) {
        loginNotifyToggle.classList.toggle('active', settings.loginNotify);
    }
    
    // 自动清理
    const autoCleanToggle = document.getElementById('autoCleanToggle');
    if (autoCleanToggle) {
        autoCleanToggle.classList.toggle('active', settings.autoClean);
    }
}

/**
 * 初始化事件监听器
 */
function initSettingsEventListeners() {
    // 深色模式切换 - 使用全局主题管理器
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            if (window.themeManager) {
                window.themeManager.toggleTheme();
                showNotification('主题已切换', 'success');
            } else {
                // 降级处理：如果主题管理器未加载
                toggleSetting('darkMode', darkModeToggle);
                const switchCheckbox = document.getElementById('switch');
                if (switchCheckbox) {
                    switchCheckbox.checked = darkModeToggle.classList.contains('active');
                    const event = new Event('change');
                    switchCheckbox.dispatchEvent(event);
                }
            }
        });
    }
    
    // 语言设置
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            updateSelectSetting('language', languageSelect.value);
            showNotification('语言设置已更新', 'success');
        });
    }
    
    // 动画效果
    const animationToggle = document.getElementById('animationToggle');
    if (animationToggle) {
        animationToggle.addEventListener('click', () => {
            toggleSetting('animation', animationToggle);
        });
    }
    
    // 自动压缩
    const autoCompressToggle = document.getElementById('autoCompressToggle');
    if (autoCompressToggle) {
        autoCompressToggle.addEventListener('click', () => {
            toggleSetting('autoCompress', autoCompressToggle);
        });
    }
    
    // 图片质量
    const qualitySelect = document.getElementById('qualitySelect');
    if (qualitySelect) {
        qualitySelect.addEventListener('change', () => {
            updateSelectSetting('quality', qualitySelect.value);
        });
    }
    
    // 水印设置
    const watermarkToggle = document.getElementById('watermarkToggle');
    if (watermarkToggle) {
        watermarkToggle.addEventListener('click', () => {
            toggleSetting('watermark', watermarkToggle);
        });
    }
    
    // 公开可见
    const publicToggle = document.getElementById('publicToggle');
    if (publicToggle) {
        publicToggle.addEventListener('click', () => {
            toggleSetting('public', publicToggle);
        });
    }
    
    // EXIF信息
    const exifToggle = document.getElementById('exifToggle');
    if (exifToggle) {
        exifToggle.addEventListener('click', () => {
            toggleSetting('exif', exifToggle);
        });
    }
    
    // 登录提醒
    const loginNotifyToggle = document.getElementById('loginNotifyToggle');
    if (loginNotifyToggle) {
        loginNotifyToggle.addEventListener('click', () => {
            toggleSetting('loginNotify', loginNotifyToggle);
        });
    }
    
    // 自动清理
    const autoCleanToggle = document.getElementById('autoCleanToggle');
    if (autoCleanToggle) {
        autoCleanToggle.addEventListener('click', () => {
            toggleSetting('autoClean', autoCleanToggle);
        });
    }
    
    // 保存按钮
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveAllSettings();
        });
    }
    
    // 重置按钮
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetAllSettings();
        });
    }
    
    // 危险操作按钮
    initDangerButtons();
}

/**
 * 切换开关设置
 */
function toggleSetting(settingName, toggleElement) {
    toggleElement.classList.toggle('active');
    const isActive = toggleElement.classList.contains('active');
    
    const settings = getSettings();
    settings[settingName] = isActive;
    saveSettings(settings);
    
    showNotification(`${getSettingDisplayName(settingName)} 已${isActive ? '启用' : '禁用'}`, 'success');
}

/**
 * 更新选择器设置
 */
function updateSelectSetting(settingName, value) {
    const settings = getSettings();
    settings[settingName] = value;
    saveSettings(settings);
}

/**
 * 获取设置显示名称
 */
function getSettingDisplayName(settingName) {
    const names = {
        darkMode: '深色模式',
        animation: '动画效果',
        autoCompress: '自动压缩',
        watermark: '水印设置',
        public: '图片公开可见',
        exif: 'EXIF信息保留',
        loginNotify: '登录提醒',
        autoClean: '自动清理'
    };
    return names[settingName] || settingName;
}

/**
 * 保存所有设置
 */
function saveAllSettings() {
    const settings = getSettings();
    
    // 这里可以将设置发送到服务器
    // await fetch('/api/settings', { method: 'POST', body: JSON.stringify(settings) });
    
    showNotification('设置已保存', 'success');
    
    // 添加按钮动画
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            saveBtn.style.transform = 'scale(1)';
        }, 150);
    }
}

/**
 * 重置所有设置
 */
function resetAllSettings() {
    if (confirm('确定要重置所有设置到默认值吗？')) {
        localStorage.removeItem('userSettings');
        location.reload();
    }
}

/**
 * 初始化危险操作按钮
 */
function initDangerButtons() {
    // 清空缓存
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            showConfirmModal(
                '清空缓存',
                '确定要清空所有缓存数据吗？这将清除临时文件和浏览器缓存。',
                () => clearCache()
            );
        });
    }
    
    // 删除所有图片
    const deleteAllBtn = document.getElementById('deleteAllBtn');
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', () => {
            showConfirmModal(
                '删除所有图片',
                '⚠️ 警告：此操作将永久删除您的所有图片，且无法恢复！请确认您要执行此操作。',
                () => deleteAllImages()
            );
        });
    }
    
    // 删除账户
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            showConfirmModal(
                '删除账户',
                '⚠️ 严重警告：此操作将永久删除您的账户和所有数据，且无法恢复！请三思而后行。',
                () => deleteAccount()
            );
        });
    }
}

/**
 * 显示确认模态框
 */
function showConfirmModal(title, message, confirmCallback) {
    const modal = document.getElementById('confirmModal');
    const titleElement = document.getElementById('confirmTitle');
    const messageElement = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmAction');
    
    if (modal && titleElement && messageElement && confirmBtn) {
        titleElement.textContent = title;
        messageElement.textContent = message;
        
        // 移除之前的事件监听器
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        // 添加新的事件监听器
        newConfirmBtn.addEventListener('click', () => {
            confirmCallback();
            hideConfirmModal();
        });
        
        modal.style.display = 'flex';
        
        // 关闭模态框事件
        const closeBtn = document.getElementById('closeConfirmModal');
        const cancelBtn = document.getElementById('cancelConfirm');
        
        if (closeBtn) {
            closeBtn.onclick = hideConfirmModal;
        }
        if (cancelBtn) {
            cancelBtn.onclick = hideConfirmModal;
        }
        
        // 点击背景关闭
        modal.onclick = (e) => {
            if (e.target === modal) {
                hideConfirmModal();
            }
        };
    }
}

/**
 * 隐藏确认模态框
 */
function hideConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 清空缓存
 */
function clearCache() {
    try {
        // 清除本地存储（除了重要设置）
        const importantKeys = ['userSettings', 'token', 'user', 'menuState'];
        const keysToRemove = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !importantKeys.includes(key)) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        // 清除会话存储
        sessionStorage.clear();
        
        showNotification('缓存已清空', 'success');
    } catch (error) {
        showNotification('清空缓存失败', 'error');
    }
}

/**
 * 删除所有图片
 */
async function deleteAllImages() {
    try {
        showNotification('正在删除所有图片...', 'info');
        
        // 这里应该调用API删除所有图片
        // const response = await fetch('/api/images/delete-all', { method: 'DELETE' });
        
        // 模拟删除过程
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        showNotification('所有图片已删除', 'success');
        
        // 可以重定向到首页或刷新页面
        setTimeout(() => {
            window.location.href = '/';
        }, 1500);
    } catch (error) {
        showNotification('删除图片失败', 'error');
    }
}

/**
 * 删除账户
 */
async function deleteAccount() {
    try {
        showNotification('正在删除账户...', 'info');
        
        // 这里应该调用API删除账户
        // const response = await fetch('/api/auth/delete-account', { method: 'DELETE' });
        
        // 模拟删除过程
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 清除所有本地数据
        localStorage.clear();
        sessionStorage.clear();
        
        showNotification('账户已删除', 'success');
        
        // 重定向到首页
        setTimeout(() => {
            window.location.href = '/';
        }, 1500);
    } catch (error) {
        showNotification('删除账户失败', 'error');
    }
}

/**
 * 更新存储信息
 */
function updateStorageInfo() {
    // 这里应该从API获取真实的存储信息
    // 现在使用模拟数据
    
    const storageData = {
        used: 134.5, // MB
        total: 2048, // MB (2GB)
        percentage: 6.6
    };
    
    // 更新进度条
    const progressBar = document.querySelector('.storage-progress');
    if (progressBar) {
        progressBar.style.width = `${storageData.percentage}%`;
    }
    
    // 更新文本信息
    const storageTexts = document.querySelectorAll('.storage-text span');
    if (storageTexts.length >= 2) {
        storageTexts[0].textContent = `已使用 ${storageData.percentage.toFixed(1)}%`;
        storageTexts[1].textContent = `剩余 ${((storageData.total - storageData.used) / 1024).toFixed(2)} GB`;
    }
    
    // 更新使用量显示
    const usageDisplay = document.querySelector('.storage-info span[style*="color: var(--primary-color)"]');
    if (usageDisplay) {
        usageDisplay.textContent = `${storageData.used} MB / ${(storageData.total / 1024).toFixed(0)} GB`;
    }
}

/**
 * 显示通知
 */
function showNotification(message, type = 'info') {
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
    
    // 添加样式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: var(--card-bg);
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        border-left: 4px solid var(--${type === 'error' ? 'error' : type === 'success' ? 'success' : 'primary'}-color);
        animation: slideInRight 0.3s ease;
    `;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 自动删除
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 3000);
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

// 添加通知动画样式
if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        .notification-content {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 1.25rem;
            font-weight: 500;
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
        }
        
        .notification-close:hover {
            background: rgba(0, 0, 0, 0.1);
            color: var(--text-color);
        }
    `;
    document.head.appendChild(style);
} 