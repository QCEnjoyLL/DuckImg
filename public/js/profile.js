/**
 * 用户资料页面相关功能
 */

// 初始化用户资料页面
function initProfile() {
    // 立即显示淡入内容（本页未加载 app.js，否则 .fade-in-element 会一直 opacity:0 导致空白）
    document.querySelectorAll('.fade-in-element').forEach(el => el.classList.add('visible'));

    // 检查用户登录状态
    if (!checkAuth()) {
        window.location.href = '/login.html';
        return;
    }

    // 加载用户资料信息
    loadUserProfile();

    // 初始化头像上传功能
    initAvatarUpload();

    // 初始化页面按钮事件
    initProfileButtons();

    // 初始化账户安全（改密码/换邮箱）
    initSecurityForms();

    // 更新页面头像显示
    updateUserAvatar();
}

// 账户安全：修改密码 / 修改邮箱
function initSecurityForms() {
    const authHeader = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    });

    // 修改密码
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', async () => {
            const currentPassword = document.getElementById('curPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const newPassword2 = document.getElementById('newPassword2').value;
            if (!currentPassword || !newPassword) { showNotification('请填写当前密码和新密码', 'error'); return; }
            if (newPassword.length < 6) { showNotification('新密码至少 6 位', 'error'); return; }
            if (newPassword !== newPassword2) { showNotification('两次输入的新密码不一致', 'error'); return; }

            try {
                const res = await fetch('/api/auth/password', {
                    method: 'PUT', headers: authHeader(),
                    body: JSON.stringify({ currentPassword, newPassword })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '修改失败');
                showNotification('密码修改成功，请重新登录', 'success');
                setTimeout(() => { logout(); }, 1500);
            } catch (e) {
                showNotification(e.message, 'error');
            }
        });
    }

    // 修改邮箱：发送验证码
    const sendEmailCodeBtn = document.getElementById('sendEmailCodeBtn');
    if (sendEmailCodeBtn) {
        sendEmailCodeBtn.addEventListener('click', async () => {
            const password = document.getElementById('emailPassword').value;
            const newEmail = document.getElementById('newEmailInput').value.trim();
            if (!password || !newEmail) { showNotification('请填写当前密码和新邮箱', 'error'); return; }

            sendEmailCodeBtn.disabled = true;
            try {
                const res = await fetch('/api/auth/change-email', {
                    method: 'POST', headers: authHeader(),
                    body: JSON.stringify({ password, newEmail })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '发送失败');
                document.getElementById('emailCodeRow').style.display = 'flex';
                if (data.devCode) {
                    document.getElementById('emailCode').value = data.devCode;
                    showNotification(`邮件服务未配置，验证码为：${data.devCode}`, 'warning');
                } else {
                    showNotification('验证码已发送至新邮箱', 'success');
                }
            } catch (e) {
                showNotification(e.message, 'error');
            } finally {
                // 60s 冷却，避免狂点重发刷邮件
                setTimeout(() => { sendEmailCodeBtn.disabled = false; }, 60000);
            }
        });
    }

    // 修改邮箱：确认验证码
    const confirmEmailBtn = document.getElementById('confirmEmailBtn');
    if (confirmEmailBtn) {
        confirmEmailBtn.addEventListener('click', async () => {
            const code = document.getElementById('emailCode').value.trim();
            if (!code) { showNotification('请输入验证码', 'error'); return; }
            try {
                const res = await fetch('/api/auth/confirm-email', {
                    method: 'POST', headers: authHeader(),
                    body: JSON.stringify({ code })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || '确认失败');
                // 更新本地用户信息
                if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
                showNotification('邮箱修改成功', 'success');
                document.getElementById('emailCodeRow').style.display = 'none';
                document.getElementById('emailPassword').value = '';
                document.getElementById('newEmailInput').value = '';
                document.getElementById('emailCode').value = '';
                loadUserProfile();
            } catch (e) {
                showNotification(e.message, 'error');
            }
        });
    }
}

// 加载用户资料信息
async function loadUserProfile() {
    try {
        const response = await fetch('/api/auth/profile', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('获取用户资料失败');
        }

        const data = await response.json();
        const user = data.user;

        // 更新用户信息显示
        updateUserProfileDisplay(user);

    } catch (error) {
        console.error('加载用户资料错误:', error);
        showNotification('加载用户资料失败: ' + error.message, 'error');
        // 顶部显示可见错误条，避免页面看起来“空白”
        const container = document.querySelector('.profile-container') || document.body;
        if (container && !document.getElementById('profileLoadError')) {
            const bar = document.createElement('div');
            bar.id = 'profileLoadError';
            bar.style.cssText = 'margin:1rem 0;padding:0.8rem 1rem;border-radius:8px;background:#fee2e2;color:#991b1b;font-size:0.9rem;';
            bar.textContent = '加载用户资料失败：' + error.message + '（请确认已登录；若刚更新过站点，请强制刷新 Ctrl+Shift+R）';
            container.prepend(bar);
        }
    }
}

// 更新用户资料显示
function updateUserProfileDisplay(user) {
    // 更新用户名
    const usernameElement = document.getElementById('profileUsername');
    if (usernameElement) {
        usernameElement.textContent = user.username || '-';
    }

    // 更新邮箱
    const emailElement = document.getElementById('profileEmail');
    if (emailElement) {
        emailElement.textContent = user.email || '-';
    }

    // 更新注册时间
    const regTimeElement = document.getElementById('profileRegTime');
    if (regTimeElement) {
        if (user.createdAt) {
            const regDate = new Date(user.createdAt);
            regTimeElement.textContent = regDate.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } else {
            regTimeElement.textContent = '-';
        }
    }

    // 更新最后登录时间
    const lastLoginElement = document.getElementById('profileLastLogin');
    if (lastLoginElement) {
        if (user.lastLoginAt) {
            const d = new Date(user.lastLoginAt);
            lastLoginElement.textContent = d.toLocaleString('zh-CN');
        } else {
            lastLoginElement.textContent = '刚刚';
        }
    }

    // 更新统计信息
    if (user.stats) {
        const imageCountElement = document.getElementById('profileImageCount');
        if (imageCountElement) {
            imageCountElement.textContent = user.stats.totalImages || '0';
        }

        const storageUsedElement = document.getElementById('profileStorageUsed');
        if (storageUsedElement) {
            const sizeInMB = ((user.stats.totalSize || 0) / (1024 * 1024)).toFixed(2);
            storageUsedElement.textContent = `${sizeInMB} MB`;
        }
    }

    // 更新头像显示
    const avatarPreview = document.getElementById('avatarPreview');
    if (avatarPreview && user.avatarUrl) {
        avatarPreview.innerHTML = '';
        const img = document.createElement('img');
        img.src = user.avatarUrl;
        img.alt = '用户头像';
        img.onerror = function() {
            this.style.display = 'none';
            avatarPreview.innerHTML = '<i class="ri-user-3-line"></i><div class="avatar-overlay">更换头像</div>';
        };
        avatarPreview.appendChild(img);
        
        // 重新添加overlay
        const overlay = document.createElement('div');
        overlay.className = 'avatar-overlay';
        overlay.textContent = '更换头像';
        avatarPreview.appendChild(overlay);
    }

    // 更新所有页面的用户名显示
    const userDisplayName = document.getElementById('userDisplayName');
    if (userDisplayName) {
        userDisplayName.textContent = user.username || '用户';
    }
}

// 初始化头像上传功能
function initAvatarUpload() {
    const avatarPreview = document.getElementById('avatarPreview');
    
    if (!avatarPreview) return;

    // 创建隐藏的文件输入元素
    const avatarInput = document.createElement('input');
    avatarInput.type = 'file';
    avatarInput.accept = 'image/*';
    avatarInput.style.display = 'none';
    avatarInput.id = 'avatarFileInput';
    document.body.appendChild(avatarInput);
    
    // 头像点击事件
    avatarPreview.addEventListener('click', () => {
        avatarInput.click();
    });
    
    // 文件选择事件
    avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // 验证文件类型
        if (!file.type.startsWith('image/')) {
            showNotification('请选择图片文件', 'error');
            return;
        }
        
        // 验证文件大小（限制为5MB）
        if (file.size > 5 * 1024 * 1024) {
            showNotification('图片文件大小不能超过5MB', 'error');
            return;
        }
        
        try {
            // 显示加载状态
            avatarPreview.innerHTML = '<i class="ri-loader-4-line rotating"></i>';
            
            await uploadAvatar(file);
            
            // 显示成功消息
            showNotification('头像更新成功', 'success');
            
            // 重新加载用户资料
            loadUserProfile();
            
        } catch (error) {
            console.error('头像上传错误:', error);
            showNotification('头像更新失败: ' + error.message, 'error');
            
            // 恢复头像显示
            loadUserProfile();
        }
        
        // 清空文件输入
        avatarInput.value = '';
    });
}

// 上传头像
async function uploadAvatar(file) {
    try {
        // 首先上传文件到图床
        const formData = new FormData();
        formData.append('file', file);
        
        const uploadResponse = await fetch('/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        if (!uploadResponse.ok) {
            throw new Error('图片上传失败');
        }
        
        const uploadResult = await uploadResponse.json();
        
        if (!uploadResult || uploadResult.length === 0 || !uploadResult[0].src) {
            throw new Error('上传结果无效');
        }
        
        // 获取上传后的图片链接
        const avatarUrl = window.location.origin + uploadResult[0].src;
        
        // 更新用户头像
        const updateResponse = await fetch('/api/auth/avatar', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ avatarUrl })
        });
        
        if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            throw new Error(errorData.error || '头像更新失败');
        }
        
        const result = await updateResponse.json();
        
        // 更新本地存储的用户信息
        localStorage.setItem('user', JSON.stringify(result.user));
        
        // 更新全局头像显示
        updateUserAvatar();
        
        return result;
    } catch (error) {
        console.error('上传头像错误:', error);
        throw error;
    }
}

// 初始化页面按钮事件
function initProfileButtons() {
    // 主题切换按钮
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleTheme();
        });
    }

    // 退出登录按钮
    const logoutProfileBtn = document.getElementById('logoutProfileBtn');
    if (logoutProfileBtn) {
        logoutProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('确定要退出登录吗？')) {
                logout();
            }
        });
    }

    // 上传按钮
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }

    // 上传菜单按钮
    const uploadMenuBtn = document.getElementById('uploadMenuBtn');
    if (uploadMenuBtn) {
        uploadMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/';
        });
    }

    // 退出登录菜单项
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    if (logoutMenuItem) {
        logoutMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('确定要退出登录吗？')) {
                logout();
            }
        });
    }

    // 主题切换菜单项
    const themeMenuItem = document.getElementById('themeMenuItem');
    if (themeMenuItem) {
        themeMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            toggleTheme();
        });
    }

    // 退出登录按钮（下拉菜单）
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('确定要退出登录吗？')) {
                logout();
            }
        });
    }
}

// 切换主题
function toggleTheme() {
    // 使用全局主题管理器
    if (window.themeManager) {
        window.themeManager.toggleTheme();
    }
}

// 退出登录
function logout() {
    // 清除本地存储
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // 重定向到首页
    window.location.href = '/';
}

// 显示通知消息
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 样式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    // 根据类型设置背景色
    switch (type) {
        case 'success':
            notification.style.background = '#10b981';
            break;
        case 'error':
            notification.style.background = '#ef4444';
            break;
        case 'warning':
            notification.style.background = '#f59e0b';
            break;
        default:
            notification.style.background = '#3b82f6';
    }
    
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // 3秒后自动隐藏
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否在用户资料页面（放宽匹配：/profile.html 或带尾斜杠等）
    const p = window.location.pathname;
    if (p.endsWith('/profile.html') || p === '/profile' || p.endsWith('/profile')) {
        initProfile();
    }
});

// 添加旋转动画CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    .rotating {
        animation: rotate 1s linear infinite;
    }
`;
document.head.appendChild(style); 