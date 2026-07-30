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
    const hint = document.getElementById('themeModeHint');
    if (hint) {
        if (window.UserPrefs && typeof window.UserPrefs.t === 'function') {
            const lang = (getSettings().language) || 'zh-CN';
            hint.textContent = window.UserPrefs.t(isDark ? 'theme.dark' : 'theme.light', lang);
        } else {
            hint.textContent = isDark ? '当前：深色' : '当前：浅色';
        }
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
    if (window.UserPrefs && typeof window.UserPrefs.read === 'function') {
        return window.UserPrefs.read();
    }
    const defaultSettings = {
        darkMode: false,
        language: 'zh-CN',
        animation: true,
        autoCompress: true,
        quality: 'medium',
        watermark: false,
        public: true,
        exif: false,
        loginNotify: false,
        autoClean: false
    };
    const savedSettings = localStorage.getItem('userSettings');
    return savedSettings ? { ...defaultSettings, ...JSON.parse(savedSettings) } : defaultSettings;
}

/**
 * 保存设置
 */
function saveSettings(settings) {
    if (window.UserPrefs && typeof window.UserPrefs.set === 'function') {
        window.UserPrefs.set(settings);
    } else {
        localStorage.setItem('userSettings', JSON.stringify(settings));
    }
    // 云端同步（登录提醒等）
    if (window.UserPrefs && typeof window.UserPrefs.syncToServer === 'function') {
        window.UserPrefs.syncToServer(settings);
    }
    if (window.UserPrefs && typeof window.UserPrefs.applyLanguage === 'function') {
        window.UserPrefs.applyLanguage(settings.language || 'zh-CN');
    }
    if (settings.autoClean && window.UserPrefs && window.UserPrefs.runAutoClean) {
        window.UserPrefs.runAutoClean();
    }
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

    // 水印文字
    const watermarkTextInput = document.getElementById('watermarkTextInput');
    if (watermarkTextInput) {
        watermarkTextInput.value = settings.watermarkText || '鸭鸭图床';
        watermarkTextInput.disabled = !settings.watermark;
        watermarkTextInput.style.opacity = settings.watermark ? '1' : '0.55';
    }

    if (window.UserPrefs && typeof window.UserPrefs.applyLanguage === 'function') {
        window.UserPrefs.applyLanguage(settings.language || 'zh-CN');
    }
}

/**
 * 初始化事件监听器
 */
function initSettingsEventListeners() {
    // 明暗仅由顶栏开关控制

    // 打开配色面板（侧栏「切换配色」同款）
    const openPaletteBtn = document.getElementById('openPaletteBtn');
    if (openPaletteBtn) {
        openPaletteBtn.addEventListener('click', () => {
            if (window.DuckPalette && typeof window.DuckPalette.open === 'function') {
                window.DuckPalette.open();
            } else if (window.DuckPalette && typeof window.DuckPalette.toggle === 'function') {
                window.DuckPalette.toggle();
            } else {
                showNotification('请打开侧栏使用「切换配色」', 'info');
            }
        });
    }

    // 快捷清空缓存
    const clearCacheQuickBtn = document.getElementById('clearCacheQuickBtn');
    if (clearCacheQuickBtn) {
        clearCacheQuickBtn.addEventListener('click', () => {
            showConfirmModal(
                '清空本地缓存',
                '将清除本机保存的主题、排序等偏好，不会删除云端图片。',
                () => clearCache()
            );
        });
    }

    // 绑定实际上传/隐私偏好
    bindPrefToggle('autoCompressToggle', 'autoCompress', '自动压缩');
    bindPrefToggle('watermarkToggle', 'watermark', '水印');
    bindPrefToggle('exifToggle', 'exif', '保留 EXIF');
    bindPrefToggle('publicToggle', 'public', '图片公开可见');
    bindPrefToggle('loginNotifyToggle', 'loginNotify', '登录提醒');
    bindPrefToggle('autoCleanToggle', 'autoClean', '自动清理');

    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            const settings = getSettings();
            settings.language = languageSelect.value;
            saveSettings(settings);
            showNotification(languageSelect.value === 'en-US' ? 'Language updated' : '语言已更新', 'success');
        });
    }

    const qualitySelect = document.getElementById('qualitySelect');
    if (qualitySelect) {
        qualitySelect.addEventListener('change', () => {
            const settings = getSettings();
            settings.quality = qualitySelect.value;
            saveSettings(settings);
            showNotification('默认图片质量已更新', 'success');
        });
    }

    const watermarkTextInput = document.getElementById('watermarkTextInput');
    if (watermarkTextInput) {
        let timer = null;
        const commit = () => {
            const settings = getSettings();
            settings.watermarkText = (watermarkTextInput.value || '').trim() || '鸭鸭图床';
            watermarkTextInput.value = settings.watermarkText;
            saveSettings(settings);
            showNotification('水印文字已保存', 'success');
        };
        watermarkTextInput.addEventListener('change', commit);
        watermarkTextInput.addEventListener('blur', commit);
        watermarkTextInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const settings = getSettings();
                settings.watermarkText = (watermarkTextInput.value || '').trim() || '鸭鸭图床';
                saveSettings(settings);
            }, 500);
        });
    }

    // 保存设置按钮
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const settings = getSettings();
            if (window.themeManager) {
                settings.darkMode = window.themeManager.theme === 'dark';
            }
            // 从 UI 再收集一遍
            collectFromUI(settings);
            saveSettings(settings);
            showNotification('设置已保存并生效', 'success');
        });
    }

    // 重置设置按钮
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('确定要重置所有本机设置为默认值吗？')) {
                localStorage.removeItem('userSettings');
                localStorage.removeItem('themePalette');
                const defaults = window.UserPrefs ? { ...window.UserPrefs.DEFAULTS } : getSettings();
                saveSettings(defaults);
                applySettingsToUI(getSettings());
                showNotification('本机设置已重置', 'success');
            }
        });
    }

    // 危险操作：清空缓存
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', () => {
            showConfirmModal(
                '清空缓存',
                '确定要清空本地缓存吗？不会删除云端图片。',
                () => clearCache()
            );
        });
    }

    // 危险操作：删除所有图片
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

    // 危险操作：删除账户
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            showConfirmModal(
                '删除账户',
                '⚠️ 警告：此操作将永久删除您的账户与相关数据，且无法恢复！',
                () => deleteAccount()
            );
        });
    }
}

function bindPrefToggle(id, key, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
        if (el.closest && el.closest('.is-disabled')) return;
        el.classList.toggle('active');
        const on = el.classList.contains('active');
        const settings = getSettings();
        settings[key] = on;
        saveSettings(settings);
        if (key === 'watermark') {
            const input = document.getElementById('watermarkTextInput');
            if (input) {
                input.disabled = !on;
                input.style.opacity = on ? '1' : '0.55';
            }
        }
        showNotification(`${label}已${on ? '开启' : '关闭'}`, 'success');
    });
}

function collectFromUI(settings) {
    const map = [
        ['autoCompressToggle', 'autoCompress'],
        ['watermarkToggle', 'watermark'],
        ['exifToggle', 'exif'],
        ['publicToggle', 'public'],
        ['loginNotifyToggle', 'loginNotify'],
        ['autoCleanToggle', 'autoClean'],
    ];
    map.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) settings[key] = el.classList.contains('active');
    });
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) settings.language = languageSelect.value;
    const qualitySelect = document.getElementById('qualitySelect');
    if (qualitySelect) settings.quality = qualitySelect.value;
    const watermarkTextInput = document.getElementById('watermarkTextInput');
    if (watermarkTextInput) {
        settings.watermarkText = (watermarkTextInput.value || '').trim() || '鸭鸭图床';
    }
}

/**
 * 切换开关设置
 */
function toggleSetting(settingName, toggleElement) {
    // 禁用的「即将支持」项不响应
    if (toggleElement.closest && toggleElement.closest('.is-disabled')) return;
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

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', () => {
            confirmCallback();
            hideConfirmModal();
        });

        modal.style.display = 'flex';
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');

        const closeBtn = document.getElementById('closeConfirmModal');
        const cancelBtn = document.getElementById('cancelConfirm');
        if (closeBtn) closeBtn.onclick = hideConfirmModal;
        if (cancelBtn) cancelBtn.onclick = hideConfirmModal;

        modal.onclick = (e) => {
            if (e.target === modal) hideConfirmModal();
        };
    } else if (window.confirm(`${title}\n\n${message}`)) {
        confirmCallback();
    }
}

/**
 * 隐藏确认模态框
 */
function hideConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }
}

/**
 * 清空缓存
 */
function clearCache() {
    try {
        // 保留登录态与菜单状态，清其它本机偏好
        const keep = new Set(['token', 'user', 'menuState']);
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !keep.has(key)) keysToRemove.push(key);
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        sessionStorage.clear();
        showNotification('本地缓存已清空（登录状态保留）', 'success');
        // 刷新主题提示
        if (window.themeManager) {
            updateDarkModeToggleState(window.themeManager.theme === 'dark');
        }
        updateStorageInfo();
    } catch (error) {
        showNotification('清空缓存失败', 'error');
    }
}

/**
 * 删除所有图片（真实调用删除 API）
 */
async function deleteAllImages() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('请先登录', 'error');
            return;
        }

        showNotification('正在获取图片列表…', 'info');
        let ok = 0;
        let fail = 0;
        let announced = false;
        // 批量端点每次 40 张；>5000 张时外层再拉一轮
        for (let round = 0; round < 10 && fail === 0; round++) {
            const listRes = await fetch('/api/images?page=1&limit=5000', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!listRes.ok) throw new Error('获取图片列表失败');
            const data = await listRes.json();
            const files = data.files || [];
            if (!files.length) break;
            if (!announced) {
                showNotification(`正在删除 ${data.totalImages || files.length} 张图片…`, 'info');
                announced = true;
            }

            for (let i = 0; i < files.length; i += 40) {
                const ids = files.slice(i, i + 40).map((f) => f.id).filter(Boolean);
                if (!ids.length) continue;
                try {
                    const delRes = await fetch('/api/images/batch', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ action: 'delete', ids })
                    });
                    if (delRes.ok) {
                        const d = await delRes.json();
                        ok += d.deleted || 0;
                    } else {
                        fail += ids.length;
                    }
                } catch (_) {
                    fail += ids.length;
                }
            }
        }

        if (ok === 0 && fail === 0) {
            showNotification('没有可删除的图片', 'info');
            return;
        }

        if (fail === 0) {
            showNotification(`已删除全部 ${ok} 张图片`, 'success');
        } else {
            showNotification(`删除完成：成功 ${ok}，失败 ${fail}`, fail ? 'error' : 'success');
        }
        updateStorageInfo();
    } catch (error) {
        console.error(error);
        showNotification(error.message || '删除图片失败', 'error');
    }
}

/**
 * 删除账户：后端暂无自助删除接口
 */
async function deleteAccount() {
    showNotification('暂不支持自助删除账户，请联系管理员处理', 'error');
}

function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * 从 API 刷新真实占用与配额
 */
async function updateStorageInfo() {
    const usedText = document.getElementById('settingsStorageUsedText');
    const bar = document.getElementById('settingsStorageBar');
    const countText = document.getElementById('settingsImageCountText');
    const quotaText = document.getElementById('settingsQuotaText');
    if (!usedText && !bar) return;

    const token = localStorage.getItem('token');
    if (!token) {
        if (usedText) usedText.textContent = '未登录';
        if (countText) countText.textContent = '图片数 —';
        if (quotaText) quotaText.textContent = '今日配额 —';
        if (bar) bar.style.width = '0%';
        return;
    }

    try {
        const headers = { Authorization: `Bearer ${token}` };
        const [profileRes, quotaRes] = await Promise.all([
            fetch('/api/auth/profile', { headers }),
            fetch('/api/auth/quota', { headers })
        ]);

        let totalImages = 0;
        let totalSize = 0;
        if (profileRes.ok) {
            const p = await profileRes.json();
            const stats = (p.user && p.user.stats) || p.stats || {};
            totalImages = stats.totalImages || 0;
            totalSize = stats.totalSize || 0;
        }

        let quotaLine = '今日配额 —';
        let pct = 0;
        if (quotaRes.ok) {
            const q = await quotaRes.json();
            if (q.unlimited || q.limit === 0) {
                quotaLine = `今日已传 ${q.used || 0} 张 · 不限量`;
                pct = Math.min(100, totalImages ? 8 : 0); // 不限量时仅作弱进度示意
            } else {
                const used = q.used || 0;
                const limit = q.limit || 0;
                const rem = q.remaining != null ? q.remaining : Math.max(0, limit - used);
                quotaLine = `今日 ${used}/${limit}（剩余 ${rem}）`;
                pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
            }
        }

        if (usedText) usedText.textContent = formatBytes(totalSize);
        if (countText) countText.textContent = `图片数 ${totalImages}`;
        if (quotaText) quotaText.textContent = quotaLine;
        // 占用条：无总容量上限时用「相对视觉」——按图片数映射，避免假 2GB
        if (bar) {
            // 若有今日配额百分比更有意义，优先显示配额进度
            if (quotaRes.ok) {
                bar.style.width = `${pct}%`;
            } else {
                bar.style.width = totalImages ? `${Math.min(100, totalImages)}%` : '0%';
            }
        }
    } catch (e) {
        console.error(e);
        if (usedText) usedText.textContent = '加载失败';
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