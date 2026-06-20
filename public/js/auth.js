/**
 * 用户认证相关功能
 */

// UTF-8 安全解析 JWT 载荷（兼容中文用户名 / 旧标准 base64 token）
function decodeJwtPayload(token) {
    let s = String(token.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
}

// 检查用户是否已登录
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    // 如果没有令牌或用户信息，则未登录
    if (!token || !user) {
        return false;
    }

    // 检查令牌是否过期
    try {
        const payload = decodeJwtPayload(token);
        const now = Math.floor(Date.now() / 1000);

        if (payload.exp && payload.exp < now) {
            // 令牌已过期，清除本地存储
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            return false;
        }

        return true;
    } catch (error) {
        console.error('令牌解析错误:', error);
        return false;
    }
}

// 获取认证头
function getAuthHeader() {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// 初始化认证状态
function initAuth() {
    // 获取当前页面路径
    const path = window.location.pathname;

    // 检查是否已登录
    const isAuthenticated = checkAuth();

    // 获取用户下拉菜单和登录/注册链接
    const userDropdown = document.getElementById('userDropdown');
    const userDisplayName = document.getElementById('userDisplayName');
    const navLinks = document.querySelectorAll('.nav-link');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    if (isAuthenticated) {
        // 用户已登录
        const user = JSON.parse(localStorage.getItem('user'));

        // 更新用户显示名称
        if (userDisplayName) {
            userDisplayName.textContent = user.username;
        }

        // 显示用户下拉菜单
        if (userDropdown) {
            userDropdown.style.display = 'block';
        }

        // 更新桌面端导航链接
        navLinks.forEach(link => {
            if (link.textContent === '登录') {
                link.textContent = '我的图片';
                link.href = '/dashboard.html';
            }
        });

        // 更新移动端导航链接
        mobileNavLinks.forEach(link => {
            if (link.textContent === '登录') {
                link.textContent = '我的图片';
                link.href = '/dashboard.html';
            }
        });

        // 添加移动端退出登录链接（如果不存在）
        const mobileNav = document.querySelector('.mobile-nav');
        if (mobileNav && !document.getElementById('mobileLogoutBtn')) {
            const logoutLink = document.createElement('a');
            logoutLink.href = '/';
            logoutLink.id = 'mobileLogoutBtn';
            logoutLink.className = 'mobile-nav-link';
            logoutLink.textContent = '退出登录';
            mobileNav.appendChild(logoutLink);
        }

        // 如果当前页面是登录或注册页面，重定向到首页
        if (path === '/login.html' || path === '/register.html') {
            smoothPageTransition('/');
        }

        // 如果当前页面是仪表盘，但令牌无效，重定向到登录页面
        if (path === '/dashboard.html') {
            validateToken().catch(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                smoothPageTransition('/login.html');
            });
        }

        // 如果用户已登录，更新头像显示
        updateUserAvatar();
    } else {
        // 用户未登录

        // 隐藏用户下拉菜单
        if (userDropdown) {
            userDropdown.style.display = 'none';
        }

        // 更新桌面端导航链接
        navLinks.forEach(link => {
            if (link.textContent === '我的图片') {
                link.textContent = '登录';
                link.href = '/login.html';
            }
        });

        // 更新移动端导航链接
        mobileNavLinks.forEach(link => {
            if (link.textContent === '我的图片') {
                link.textContent = '登录';
                link.href = '/login.html';
            }
        });

        // 移除移动端退出登录链接（如果存在）
        const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
        if (mobileLogoutBtn) {
            mobileLogoutBtn.parentNode.removeChild(mobileLogoutBtn);
        }

        // 如果当前页面是仪表盘，重定向到登录页面
        if (path === '/dashboard.html') {
            smoothPageTransition('/login.html');
        }
    }
}

// 验证令牌
async function validateToken() {
    const token = localStorage.getItem('token');

    if (!token) {
        throw new Error('未找到令牌');
    }

    const response = await fetch('/api/auth/user', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error('令牌无效');
    }

    const data = await response.json();
    return data.user;
}

// 登录表单处理
function initLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const authToggle = document.getElementById('authToggle');

    // 幂等：避免被多处重复初始化导致重复绑定、重复提交
    if (loginForm && !loginForm.dataset.bound) {
        loginForm.dataset.bound = '1';
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 获取表单数据
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            // 验证输入
            if (!username || !password) {
                showError(loginError, '用户名和密码都是必填项');
                return;
            }

            try {
                // 发送登录请求
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                // 需要邮箱验证：弹出验证码界面
                if (response.status === 403 && data.needVerify) {
                    if (data.devCode) {
                        showError(loginError, `邮件服务未配置，验证码为：${data.devCode}`);
                    }
                    showVerifyModal(data.email, data.username || username, data.devCode);
                    return;
                }

                if (!response.ok) {
                    throw new Error(data.error || '登录失败');
                }

                // 保存令牌和用户信息
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));

                // 重定向到首页
                smoothPageTransition('/');
            } catch (error) {
                showError(loginError, error.message);
            }
        });
    }

    // 忘记密码链接（幂等绑定）
    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink && !forgotLink.dataset.bound) {
        forgotLink.dataset.bound = '1';
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            showForgotPasswordModal();
        });
    }
}

// 忘记密码：两步弹窗（发送重置码 → 输入验证码 + 新密码）
function showForgotPasswordModal() {
    if (document.getElementById('forgotOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'forgotOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;';
    overlay.innerHTML = `
        <div style="position:relative;background:#fff;color:#1f2937;border-radius:14px;max-width:400px;width:100%;padding:26px;box-shadow:0 20px 50px rgba(0,0,0,0.3);font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
            <button id="fpClose" title="关闭" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:1.5rem;line-height:1;color:#9ca3af;cursor:pointer;">&times;</button>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-right:24px;">
                <i class="ri-lock-unlock-line" style="color:#4361ee;font-size:1.3rem;"></i>
                <h3 style="margin:0;font-size:1.15rem;color:#4361ee;">找回密码</h3>
            </div>
            <div id="fpMsg" style="font-size:0.85rem;margin-bottom:10px;min-height:18px;"></div>
            <input id="fpAccount" type="text" placeholder="注册邮箱或用户名" style="width:100%;box-sizing:border-box;padding:0.6rem 0.8rem;margin-bottom:10px;border:1px solid #d1d5db;border-radius:8px;font-size:0.95rem;">
            <button id="fpSend" style="width:100%;padding:0.7rem;background:linear-gradient(135deg,#4361ee,#3730a3);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:500;cursor:pointer;">发送重置验证码</button>
            <div id="fpStep2" style="display:none;margin-top:12px;">
                <input id="fpCode" type="text" inputmode="numeric" maxlength="6" placeholder="6 位验证码" style="width:100%;box-sizing:border-box;padding:0.6rem 0.8rem;margin-bottom:10px;border:1px solid #d1d5db;border-radius:8px;font-size:0.95rem;">
                <input id="fpPwd" type="password" placeholder="新密码（至少 6 位）" style="width:100%;box-sizing:border-box;padding:0.6rem 0.8rem;margin-bottom:10px;border:1px solid #d1d5db;border-radius:8px;font-size:0.95rem;">
                <input id="fpPwd2" type="password" placeholder="确认新密码" style="width:100%;box-sizing:border-box;padding:0.6rem 0.8rem;margin-bottom:10px;border:1px solid #d1d5db;border-radius:8px;font-size:0.95rem;">
                <button id="fpReset" style="width:100%;padding:0.7rem;background:#10b981;color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:500;cursor:pointer;">重置密码</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const $ = (id) => document.getElementById(id);
    const msg = (t, ok) => { const m = $('fpMsg'); m.textContent = t || ''; m.style.color = ok ? '#059669' : '#ef4444'; };
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    $('fpClose').addEventListener('click', close);

    const sendBtn = $('fpSend');
    let cd = null;
    const startCooldown = () => {
        let left = 60; sendBtn.disabled = true;
        const tick = () => {
            sendBtn.textContent = `重新发送(${left}s)`;
            if (left <= 0) { clearInterval(cd); sendBtn.disabled = false; sendBtn.textContent = '重新发送验证码'; return; }
            left--;
        };
        tick(); cd = setInterval(tick, 1000);
    };

    sendBtn.addEventListener('click', async () => {
        const account = $('fpAccount').value.trim();
        if (!account) { msg('请输入邮箱或用户名'); return; }
        sendBtn.disabled = true;
        try {
            const body = account.includes('@') ? { email: account } : { username: account };
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '发送失败');
            $('fpStep2').style.display = 'block';
            if (data.devCode) { $('fpCode').value = data.devCode; msg(`邮件服务未配置，验证码为：${data.devCode}`, true); }
            else { msg('若该账户存在，验证码已发送至其邮箱', true); }
            startCooldown();
        } catch (e) {
            msg(e.message); sendBtn.disabled = false;
        }
    });

    $('fpReset').addEventListener('click', async () => {
        const account = $('fpAccount').value.trim();
        const code = $('fpCode').value.trim();
        const newPassword = $('fpPwd').value;
        const newPassword2 = $('fpPwd2').value;
        if (!code || !newPassword) { msg('请填写验证码和新密码'); return; }
        if (newPassword.length < 6) { msg('新密码至少 6 位'); return; }
        if (newPassword !== newPassword2) { msg('两次输入的新密码不一致'); return; }
        try {
            const body = account.includes('@') ? { email: account, code, newPassword } : { username: account, code, newPassword };
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '重置失败');
            if (cd) clearInterval(cd);
            msg('密码重置成功，请用新密码登录', true);
            setTimeout(() => {
                close();
                const u = document.getElementById('username'); if (u) u.focus();
            }, 1500);
        } catch (e) {
            msg(e.message);
        }
    });
}

// 注册表单处理
function initRegisterForm() {
    const registerForm = document.getElementById('registerForm');
    const loginError = document.getElementById('loginError');
    const authToggle = document.getElementById('authToggle');

    // 幂等：避免被多处重复初始化导致一次提交发两次验证码
    if (registerForm && !registerForm.dataset.bound) {
        registerForm.dataset.bound = '1';
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 获取表单数据 - 适应新的注册表单字段ID
            const username = document.getElementById('regUsername') ?
                document.getElementById('regUsername').value :
                document.getElementById('username').value;
            
            const email = document.getElementById('regEmail') ? 
                document.getElementById('regEmail').value : 
                document.getElementById('email').value;
            
            const password = document.getElementById('regPassword') ? 
                document.getElementById('regPassword').value : 
                document.getElementById('password').value;
            
            // 确认密码可能不存在于新表单中
            const confirmPassword = document.getElementById('confirmPassword') ? 
                document.getElementById('confirmPassword').value : 
                password; // 如果没有确认密码字段，使用密码值

            // 验证输入
            if (!username || !email || !password) {
                showError(loginError, '所有字段都是必填项');
                return;
            }

            if (confirmPassword && password !== confirmPassword) {
                showError(loginError, '两次输入的密码不一致');
                return;
            }

            // 防止并发/连点重复提交（一次注册只发一次验证码）
            if (registerForm.dataset.submitting === '1') return;
            registerForm.dataset.submitting = '1';

            try {
                // 发送注册请求
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || '注册失败');
                }

                // 注册需要邮箱验证：弹出验证码界面
                if (data.needVerify) {
                    if (data.devCode) {
                        showError(loginError, `邮件服务未配置，验证码为：${data.devCode}`);
                    } else {
                        showSuccessMessage('注册成功，请查收邮箱验证码');
                    }
                    showVerifyModal(data.email, data.username || username, data.devCode);
                    return;
                }

                // 管理员或无需验证：直接登录
                if (data.token) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    smoothPageTransition('/');
                }
            } catch (error) {
                showError(loginError, error.message);
            } finally {
                // 释放提交锁（needVerify 已 return，不会到这；此处覆盖其余路径）
                registerForm.dataset.submitting = '';
            }
        });
    }
}

// 退出登录
function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');

    // 退出登录函数
    const logout = (e) => {
        e.preventDefault();

        // 清除本地存储
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        // 重定向到首页
        smoothPageTransition('/');
    };

    // 桌面端退出按钮
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // 移动端退出按钮
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', logout);
    }
}

// 显示错误信息
function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
        element.classList.add('show');

        // 添加震动效果
        element.classList.add('shake');
        setTimeout(() => {
            element.classList.remove('shake');
        }, 500);

        // 5秒后自动隐藏错误
        setTimeout(() => {
            element.classList.remove('show');
            setTimeout(() => {
                element.style.display = 'none';
            }, 300);
        }, 5000);
    } else {
        // 如果没有找到错误元素，回退到alert
        alert(message);
    }
}

// 更新用户头像显示
function updateUserAvatar() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const userAvatars = document.querySelectorAll('.user-avatar');
    
    if (user && user.avatarUrl) {
        userAvatars.forEach(avatar => {
            // 清空现有内容
            avatar.innerHTML = '';
            
            // 创建头像图片元素
            const img = document.createElement('img');
            img.src = user.avatarUrl;
            img.alt = '用户头像';
            img.className = 'user-avatar-img';
            img.onerror = function() {
                // 如果头像加载失败，显示默认图标
                this.style.display = 'none';
                avatar.innerHTML = '<i class="ri-user-3-line"></i>';
            };
            
            avatar.appendChild(img);
        });
    } else {
        // 显示默认头像图标
        userAvatars.forEach(avatar => {
            avatar.innerHTML = '<i class="ri-user-3-line"></i>';
        });
    }
}

// 上传头像
async function uploadAvatar(file) {
    try {
        // 首先上传文件到图床
        const formData = new FormData();
        formData.append('file', file);
        
        const uploadResponse = await fetch('/upload', {
            method: 'POST',
            headers: getAuthHeader(),
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
                ...getAuthHeader()
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
        
        // 更新页面上的头像显示
        updateUserAvatar();
        
        return result;
    } catch (error) {
        console.error('上传头像错误:', error);
        throw error;
    }
}

// 初始化头像上传功能
function initAvatarUpload() {
    // 检查是否已经初始化过，避免重复初始化
    if (document.getElementById('avatarInput')) {
        return;
    }

    // 创建隐藏的文件输入元素
    const avatarInput = document.createElement('input');
    avatarInput.type = 'file';
    avatarInput.accept = 'image/*';
    avatarInput.style.display = 'none';
    avatarInput.id = 'avatarInput';
    document.body.appendChild(avatarInput);
    
    // 为所有用户头像添加点击事件
    function handleAvatarClick(e) {
        // 检查用户是否已登录
        if (!checkAuth()) {
            return;
        }

        // 检查点击的元素是否是头像
        const avatarElement = e.target.closest('.user-avatar');
        if (avatarElement) {
            e.preventDefault();
            e.stopPropagation();
            console.log('头像被点击，打开文件选择器');
            avatarInput.click();
        }
    }

    // 使用事件委托绑定点击事件
    document.addEventListener('click', handleAvatarClick);
    
    // 处理文件选择
    avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        console.log('文件被选择:', file.name);
        
        // 验证文件类型
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件');
            return;
        }
        
        // 验证文件大小（限制为5MB）
        if (file.size > 5 * 1024 * 1024) {
            alert('图片文件大小不能超过5MB');
            return;
        }
        
        try {
            // 显示加载状态
            console.log('开始上传头像...');
            const userAvatars = document.querySelectorAll('.user-avatar');
            userAvatars.forEach(avatar => {
                avatar.innerHTML = '<i class="ri-loader-4-line rotating"></i>';
            });
            
            await uploadAvatar(file);
            
            // 显示成功消息
            console.log('头像上传成功');
            showSuccessMessage('头像更新成功');
            
        } catch (error) {
            console.error('头像上传失败:', error);
            // 恢复头像显示
            updateUserAvatar();
            alert('头像更新失败: ' + error.message);
        }
        
        // 清空文件输入
        avatarInput.value = '';
    });
}

// 显示成功消息
function showSuccessMessage(message) {
    // 创建成功消息元素
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(successDiv);
    
    // 显示动画
    setTimeout(() => {
        successDiv.style.opacity = '1';
        successDiv.style.transform = 'translateX(0)';
    }, 100);
    
    // 3秒后自动隐藏
    setTimeout(() => {
        successDiv.style.opacity = '0';
        successDiv.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(successDiv);
        }, 300);
    }, 3000);
}

// 显示邮箱验证码弹窗（自包含，不依赖页面已有HTML）
function showVerifyModal(email, username, devCode) {
    // 移除已存在的弹窗
    const existing = document.getElementById('verifyModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'verifyModalOverlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center;
        z-index: 100000; padding: 20px;
    `;

    overlay.innerHTML = `
        <div style="background:#fff;color:#1f2937;border-radius:14px;max-width:380px;width:100%;padding:28px;box-shadow:0 20px 50px rgba(0,0,0,0.3);font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
            <h3 style="margin:0 0 8px;font-size:1.25rem;color:#4361ee;">邮箱验证</h3>
            <p style="margin:0 0 16px;font-size:0.9rem;color:#666;">验证码已发送至 <b>${email || '您的邮箱'}</b>，请输入 6 位验证码完成验证。</p>
            <input id="verifyCodeInput" type="text" inputmode="numeric" maxlength="6" placeholder="6 位验证码"
                style="width:100%;padding:0.75rem 1rem;border:1px solid #d1d5db;border-radius:8px;font-size:1.1rem;letter-spacing:4px;text-align:center;box-sizing:border-box;">
            <div id="verifyModalError" style="color:#ef4444;font-size:0.85rem;margin-top:8px;min-height:18px;"></div>
            <button id="verifyConfirmBtn" style="width:100%;margin-top:8px;padding:0.75rem;background:linear-gradient(135deg,#4361ee,#3730a3);color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:500;cursor:pointer;">验证并登录</button>
            <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:0.85rem;">
                <button id="verifyResendBtn" style="background:none;border:none;color:#4361ee;cursor:pointer;">重新发送</button>
                <button id="verifyCancelBtn" style="background:none;border:none;color:#888;cursor:pointer;">取消</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const codeInput = document.getElementById('verifyCodeInput');
    const errorEl = document.getElementById('verifyModalError');
    const confirmBtn = document.getElementById('verifyConfirmBtn');
    const resendBtn = document.getElementById('verifyResendBtn');
    const cancelBtn = document.getElementById('verifyCancelBtn');

    if (devCode) codeInput.value = devCode;
    codeInput.focus();

    const showErr = (msg) => { errorEl.textContent = msg || ''; };

    // 确认验证
    confirmBtn.addEventListener('click', async () => {
        const code = codeInput.value.trim();
        if (!code) { showErr('请输入验证码'); return; }

        confirmBtn.disabled = true;
        confirmBtn.textContent = '验证中...';
        try {
            const res = await fetch('/api/auth/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, code })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '验证失败');

            // 验证成功，自动登录
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            overlay.remove();
            smoothPageTransition('/');
        } catch (err) {
            showErr(err.message);
            confirmBtn.disabled = false;
            confirmBtn.textContent = '验证并登录';
        }
    });

    codeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') confirmBtn.click();
    });

    // 重新发送（60s 冷却，带倒计时；服务端不再节流，靠前端防刷）
    let resendTimer = null;
    const startResendCooldown = () => {
        let left = 60;
        resendBtn.disabled = true;
        const tick = () => {
            resendBtn.textContent = `重新发送(${left}s)`;
            if (left <= 0) {
                clearInterval(resendTimer);
                resendBtn.disabled = false;
                resendBtn.textContent = '重新发送';
                return;
            }
            left--;
        };
        tick();
        resendTimer = setInterval(tick, 1000);
    };

    resendBtn.addEventListener('click', async () => {
        resendBtn.disabled = true;
        showErr('');
        try {
            const res = await fetch('/api/auth/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username })
            });
            const data = await res.json();
            if (!res.ok && !data.devCode) throw new Error(data.error || '发送失败');
            if (data.devCode) {
                codeInput.value = data.devCode;
                showErr(`邮件服务未配置，验证码为：${data.devCode}`);
            } else {
                showErr('验证码已重新发送');
            }
            startResendCooldown();
        } catch (err) {
            showErr(err.message);
            resendBtn.disabled = false;
        }
    });

    cancelBtn.addEventListener('click', () => { if (resendTimer) clearInterval(resendTimer); overlay.remove(); });
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化认证状态
    initAuth();

    // 初始化登录表单
    initLoginForm();

    // 初始化注册表单
    initRegisterForm();

    // 初始化退出登录
    initLogout();

    // 初始化头像上传功能
    initAvatarUpload();
});
