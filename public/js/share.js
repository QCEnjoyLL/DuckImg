/**
 * 分享功能 - 鸭鸭图床
 * 处理图片分享功能
 */

document.addEventListener('DOMContentLoaded', () => {
    // 初始化分享功能
    initShareFeature();
});

/**
 * 初始化分享功能
 */
function initShareFeature() {
    const shareBtn = document.getElementById('shareBtn');
    
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            // 获取当前图片链接
            const imageUrl = document.getElementById('directLink').value;
            
            // 如果浏览器支持网页分享API
            if (navigator.share) {
                navigator.share({
                    title: '鸭鸭图床 分享图片',
                    text: '我通过鸭鸭图床分享了一张图片',
                    url: imageUrl
                })
                .then(() => console.log('分享成功'))
                .catch((error) => console.log('分享失败:', error));
            } else {
                // 如果不支持，创建自定义分享菜单
                showShareMenu(imageUrl);
            }
        });
    }
}

/**
 * 显示自定义分享菜单
 * @param {string} imageUrl - 图片URL
 */
function showShareMenu(imageUrl) {
    // 检查是否已存在分享菜单
    let shareMenu = document.getElementById('shareMenu');
    
    if (shareMenu) {
        // 如果已存在，则移除
        shareMenu.remove();
    }
    
    // 创建分享菜单
    shareMenu = document.createElement('div');
    shareMenu.id = 'shareMenu';
    shareMenu.className = 'share-menu';
    
    // 分享菜单内容
    shareMenu.innerHTML = `
        <div class="share-menu-header">
            <h4>分享图片</h4>
            <button class="share-menu-close" id="shareMenuClose">
                <i class="ri-close-line"></i>
            </button>
        </div>
        <div class="share-menu-content">
            <div class="share-menu-item" data-platform="weibo">
                <i class="ri-weibo-line"></i>
                <span>微博</span>
            </div>
            <div class="share-menu-item" data-platform="wechat">
                <i class="ri-wechat-line"></i>
                <span>微信</span>
            </div>
            <div class="share-menu-item" data-platform="qq">
                <i class="ri-qq-line"></i>
                <span>QQ</span>
            </div>
            <div class="share-menu-item" data-platform="twitter">
                <i class="ri-twitter-x-line"></i>
                <span>Twitter</span>
            </div>
            <div class="share-menu-item" data-platform="facebook">
                <i class="ri-facebook-line"></i>
                <span>Facebook</span>
            </div>
            <div class="share-menu-item" data-platform="copy">
                <i class="ri-file-copy-line"></i>
                <span>复制链接</span>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(shareMenu);
    
    // 显示分享菜单
    setTimeout(() => {
        shareMenu.classList.add('active');
    }, 10);
    
    // 关闭按钮点击事件
    const closeBtn = document.getElementById('shareMenuClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeShareMenu(shareMenu);
        });
    }
    
    // 点击外部区域关闭
    document.addEventListener('click', function closeOnClickOutside(e) {
        if (!shareMenu.contains(e.target) && e.target.id !== 'shareBtn') {
            closeShareMenu(shareMenu);
            document.removeEventListener('click', closeOnClickOutside);
        }
    });
    
    // 分享菜单项点击事件
    const shareMenuItems = shareMenu.querySelectorAll('.share-menu-item');
    shareMenuItems.forEach(item => {
        item.addEventListener('click', () => {
            const platform = item.getAttribute('data-platform');
            shareToSocialMedia(platform, imageUrl);
            closeShareMenu(shareMenu);
        });
    });
}

/**
 * 关闭分享菜单
 * @param {HTMLElement} shareMenu - 分享菜单元素
 */
function closeShareMenu(shareMenu) {
    shareMenu.classList.remove('active');
    setTimeout(() => {
        shareMenu.remove();
    }, 300);
}

/**
 * 分享到社交媒体
 * @param {string} platform - 平台名称
 * @param {string} url - 分享的URL
 */
function shareToSocialMedia(platform, url) {
    const encodedUrl = encodeURIComponent(url);
    const title = encodeURIComponent('鸭鸭图床 分享图片');
    
    let shareUrl = '';
    
    switch (platform) {
        case 'weibo':
            shareUrl = `https://service.weibo.com/share/share.php?url=${encodedUrl}&title=${title}`;
            break;
        case 'wechat':
            // 微信需要生成二维码，这里简化处理
            alert('请使用微信扫一扫功能扫描图片链接');
            return;
        case 'qq':
            shareUrl = `https://connect.qq.com/widget/shareqq/index.html?url=${encodedUrl}&title=${title}`;
            break;
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${title}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
            break;
        case 'copy':
            // 复制链接到剪贴板
            navigator.clipboard.writeText(url)
                .then(() => {
                    showToast('链接已复制到剪贴板');
                })
                .catch(err => {
                    console.error('复制失败:', err);
                    showToast('复制失败，请手动复制');
                });
            return;
    }
    
    // 打开分享窗口
    if (shareUrl) {
        window.open(shareUrl, '_blank', 'width=600,height=500');
    }
}

/**
 * 显示提示消息
 * @param {string} message - 提示消息
 */
function showToast(message) {
    // 检查是否已存在Toast
    let toast = document.getElementById('shareToast');
    
    if (toast) {
        // 如果已存在，则移除
        toast.remove();
    }
    
    // 创建Toast
    toast = document.createElement('div');
    toast.id = 'shareToast';
    toast.className = 'share-toast';
    toast.textContent = message;
    
    // 添加到页面
    document.body.appendChild(toast);
    
    // 显示Toast
    setTimeout(() => {
        toast.classList.add('active');
    }, 10);
    
    // 自动关闭
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}
