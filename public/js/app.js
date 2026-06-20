// 页面加载动画 - 增强版
window.addEventListener('load', () => {
    const pageLoader = document.getElementById('pageLoader');

    // 完成加载后延迟一小段时间再隐藏加载器
    setTimeout(() => {
        pageLoader.classList.add('loaded');

        // 页面内容淡入动画
        document.querySelectorAll('.fade-in-element').forEach((el, index) => {
            setTimeout(() => {
                el.classList.add('visible');
            }, 120 * index);
        });

        // 交错动画元素
        document.querySelectorAll('.stagger-animation').forEach(container => {
            setTimeout(() => {
                container.classList.add('visible');
            }, 300);
        });

        // 滚动动画初始化
        initScrollAnimations();
    }, 1200);
});

// 滚动动画初始化
function initScrollAnimations() {
    const scrollAnimations = document.querySelectorAll('.scroll-animation');

    // 如果没有滚动动画元素，直接返回
    if (scrollAnimations.length === 0) return;

    // 创建Intersection Observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // 元素显示后，不再观察它
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null, // 相对于视口
        rootMargin: '0px',
        threshold: 0.1 // 当元素10%可见时触发
    });

    // 观察所有滚动动画元素
    scrollAnimations.forEach(animation => {
        observer.observe(animation);
    });
}

// 获取认证头
function getAuthHeader() {
    const token = localStorage.getItem('token');
    const isLoggedIn = !!token;
    console.log('认证状态:', isLoggedIn ? '已登录' : '未登录');
    if (isLoggedIn) {
        console.log('添加认证头');
        return { 'Authorization': `Bearer ${token}` };
    } else {
        console.log('无认证头');
        return {};
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 检查是否有保存的滚动位置
    const savedScrollPosition = sessionStorage.getItem('scrollPosition');
    if (savedScrollPosition) {
        // 清除保存的滚动位置
        sessionStorage.removeItem('scrollPosition');

        // 延迟一下再滚动，确保页面已完全加载
        setTimeout(() => {
            window.scrollTo({
                top: parseInt(savedScrollPosition),
                behavior: 'auto'
            });
        }, 100);
    }

    // 初始化页面加载动画
    initPageLoader();

    // 初始化主题
    // initTheme();

    // 初始化剪贴板功能
    initClipboard();

    // 初始化上传功能
    initUpload();

    // 初始化图片预览
    initImagePreview();

    // 初始化滚动动画
    initScrollAnimations();

    // 初始化平滑滚动
    initSmoothScroll();

    // 初始化3D卡片效果
    init3DCards();

    // 初始化滚动进度条
    initScrollProgress();

    // 初始化返回顶部按钮
    initBackToTop();

    // 初始化移动端菜单
    initMobileMenu();

    // 初始化粘贴上传功能
    initPasteUpload();

    // 移除页面退出动画类
    document.body.classList.remove('page-exit');
});

// 粘贴上传功能
function initPasteUpload() {
    // 添加全局粘贴事件监听
    document.addEventListener('paste', (e) => {
        // 检查是否处于上传区域的激活状态
        const dropArea = document.getElementById('dropArea');
        const resultContainer = document.getElementById('resultContainer');

        // 焦点在输入框/文本域/可编辑元素时不劫持粘贴（让正常文本粘贴生效）
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
            return;
        }

        // 获取剪贴板数据
        if (!e.clipboardData) return;
        const items = e.clipboardData.items || [];
        const files = [];

        // 遍历剪贴板项
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                // 获取剪贴板中的图片文件
                const file = items[i].getAsFile();
                if (file) {
                    // 生成一个合理的文件名，因为粘贴的图片可能没有名称
                    const timestamp = new Date().getTime();
                    const newFile = new File([file], `pasted-image-${timestamp}.${file.type.split('/')[1] || 'png'}`, {
                        type: file.type
                    });
                    files.push(newFile);
                }
            }
        }

        // 如果有图片文件，处理上传
        if (files.length > 0) {
            // 若结果卡片正显示，先复位回上传区，便于直接开始新上传
            if (resultContainer && resultContainer.style.display !== 'none') {
                resultContainer.style.display = 'none';
            }
            if (dropArea) dropArea.style.display = '';

            // 显示上传动画效果
            if (dropArea) {
                dropArea.classList.add('paste-effect');
                setTimeout(() => {
                    dropArea.classList.remove('paste-effect');
                }, 500);
            }

            // 处理图片上传
            if (window.uploadHandlers && window.uploadHandlers.handleFiles) {
                window.uploadHandlers.handleFiles(files);
            } else {
                console.error('上传处理函数未初始化');
                const uploadStatus = document.getElementById('uploadStatus');
                if (uploadStatus) {
                    uploadStatus.textContent = '上传初始化失败，请刷新页面重试';
                    uploadStatus.className = 'upload-status error';
                }
            }

            // 阻止默认粘贴行为
            e.preventDefault();
        }
    });
}

// 滚动动画初始化
function initScrollAnimations() {
    // 添加滚动动画类
    const animationElements = [
        { selector: '.feature-card:nth-child(1)', animation: 'from-left' },
        { selector: '.feature-card:nth-child(2)', animation: 'fade-in' },
        { selector: '.feature-card:nth-child(3)', animation: 'from-right' },
        { selector: '.upload-area', animation: 'from-bottom' }
    ];

    // 添加动画类
    animationElements.forEach(item => {
        document.querySelectorAll(item.selector).forEach(el => {
            el.classList.add('scroll-animation', item.animation);
        });
    });

    // 检查元素是否在视口中
    function checkInView() {
        const elements = document.querySelectorAll('.scroll-animation');
        const windowHeight = window.innerHeight;

        elements.forEach(element => {
            const elementPosition = element.getBoundingClientRect();
            // 当元素进入视口时添加可见类
            if (elementPosition.top < windowHeight * 0.9) {
                element.classList.add('visible');
            }
        });
    }

    // 初始检查
    setTimeout(checkInView, 100);

    // 滚动时检查
    window.addEventListener('scroll', checkInView);
}

// 平滑滚动初始化
function initSmoothScroll() {
    // 为所有内部锚点链接添加平滑滚动
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // 为所有内部页面链接添加平滑跳转
    document.querySelectorAll('a:not([href^="#"]):not([href^="http"])').forEach(link => {
        link.addEventListener('click', function(e) {
            // 排除外部链接和特殊链接
            const href = this.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                e.preventDefault();
                smoothPageTransition(href);
            }
        });
    });
}

// 页面加载初始化
function initPageLoader() {
    // 为主要元素添加淡入动画类
    const fadeElements = [
        '.upload-container',
        '.features',
        '.footer'
    ];

    fadeElements.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.classList.add('fade-in-element');
        });
    });
}

// 剪贴板功能
function initClipboard() {
    const clipboard = new ClipboardJS('.copy-btn');

    clipboard.on('success', (e) => {
        const originalText = e.trigger.textContent;
        e.trigger.textContent = '已复制！';
        e.trigger.classList.add('success');

        setTimeout(() => {
            e.trigger.textContent = originalText;
            e.trigger.classList.remove('success');
        }, 2000);

        e.clearSelection();
    });

    clipboard.on('error', (e) => {
        const originalText = e.trigger.textContent;
        e.trigger.textContent = '复制失败';
        e.trigger.classList.add('error');

        setTimeout(() => {
            e.trigger.textContent = originalText;
            e.trigger.classList.remove('error');
        }, 2000);
    });
}

// 刷新并显示每日上传配额
async function refreshQuota() {
    const el = document.getElementById('uploadQuota');
    if (!el) return;

    const token = localStorage.getItem('token');
    if (!token) {
        // 未登录：匿名上传已关闭，提示登录
        el.style.display = 'block';
        el.style.color = '#f59e0b';
        el.innerHTML = '<i class="ri-information-line"></i> 请先 <a href="/login.html" style="color:inherit;text-decoration:underline;">登录</a> 后上传';
        return;
    }

    try {
        const res = await fetch('/api/auth/quota', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) { el.style.display = 'none'; return; }
        const q = await res.json();

        el.style.display = 'block';
        if (q.unlimited) {
            el.style.color = '';
            el.innerHTML = q.isAdmin
                ? `<i class="ri-vip-crown-line"></i> 管理员：今日已上传 ${q.used} 张（不限量）`
                : `<i class="ri-image-line"></i> 今日已上传 ${q.used} 张（不限量）`;
        } else {
            const noneLeft = q.remaining <= 0;
            el.style.color = noneLeft ? '#ef4444' : '';
            el.innerHTML = `<i class="ri-image-line"></i> 今日已上传 ${q.used} / ${q.limit} 张，剩余 ${q.remaining}${noneLeft ? '（已达上限，请明天再试）' : ''}`;
        }
    } catch (e) {
        el.style.display = 'none';
    }
}

// 上传功能
function initUpload() {
    // 获取元素
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const resultContainer = document.getElementById('resultContainer');
    const previewImage = document.getElementById('previewImage');
    const directLink = document.getElementById('directLink');
    const previewLink = document.getElementById('previewLink');
    const htmlCode = document.getElementById('htmlCode');
    const mdCode = document.getElementById('mdCode');
    const uploadAgainBtn = document.getElementById('uploadAgainBtn');

    // 点击上传区域触发文件选择
    dropArea.addEventListener('click', (e) => {
        // 防止点击到上传状态区域时触发文件选择
        if (e.target !== uploadStatus && !uploadStatus.contains(e.target)) {
            fileInput.click();
        }
    });

    // 监听拖拽事件
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // 拖拽效果
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.remove('drag-over');
        }, false);
    });

    // 处理文件拖放
    dropArea.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length) {
            fileInput.files = files;
            handleFiles(files);
        }
    });

    // 监听文件选择
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleFiles(fileInput.files);
        }
    });

    // 处理多个文件上传
    function handleFiles(files) {
        // 检查所有文件是否都是图片
        for (let i = 0; i < files.length; i++) {
            if (!files[i].type.match('image.*')) {
                showError('请确保所有上传的文件都是图片！');
                return;
            }

            // 文件大小检查 (限制为10MB)
            if (files[i].size > 10 * 1024 * 1024) {
                showError('每个图片大小不能超过10MB！');
                return;
            }
        }

        // 计算总文件大小
        let totalSize = 0;
        for (let i = 0; i < files.length; i++) {
            totalSize += files[i].size;
        }

        // 创建进度条HTML
        uploadStatus.innerHTML = `
            <div class="upload-progress">
                <span class="loading-text">正在上传${files.length}张图片</span>
                <div class="progress-container">
                    <div class="progress-bar" id="uploadProgressBar" style="width: 0%"></div>
                </div>
                <span class="progress-text" id="uploadProgressText">0%</span>
            </div>
        `;
        uploadStatus.className = 'upload-status loading';

        // 获取进度条元素
        const progressBar = document.getElementById('uploadProgressBar');
        const progressText = document.getElementById('uploadProgressText');

        // 准备表单数据
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('file', files[i]);
        }

        // 获取认证头
        const headers = getAuthHeader();
        console.log('上传请求 - 认证头:', headers);

        // 创建 XMLHttpRequest 以便跟踪上传进度
        const xhr = new XMLHttpRequest();

        // 监听上传进度
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                progressBar.style.width = percentComplete + '%';
                progressText.textContent = percentComplete + '%';
            }
        });

        // 设置请求
        xhr.open('POST', '/upload', true);

        // 添加认证头
        if (headers.Authorization) {
            xhr.setRequestHeader('Authorization', headers.Authorization);
        }

        // 设置响应类型
        xhr.responseType = 'json';

        // 处理请求完成
        xhr.onload = function() {
            const data = xhr.response;
            if (xhr.status === 200) {
                if (data && data.error) {
                    showError(data.error);
                } else {
                    // 上传成功
                    uploadStatus.innerHTML = `
                        <div class="upload-success">
                            <span class="success-icon">✓</span>
                            <span class="success-text">上传成功！共${data.length}张图片</span>
                        </div>
                    `;
                    uploadStatus.className = 'upload-status success';

                    // 显示结果
                    showResults(data, files);
                }
            } else if (xhr.status === 401) {
                showError('请先登录后再上传');
            } else if (data && data.error) {
                // 配额超限(403)等：显示后端真实文案
                showError(data.error);
            } else {
                showError(`上传失败: 服务器返回 ${xhr.status}`);
            }

            // 无论成功失败都刷新配额（计数可能已变化）
            refreshQuota();
        };

        // 处理错误
        xhr.onerror = function() {
            showError('上传失败: 网络错误');
        };

        // 发送请求
        xhr.send(formData);
    }

    // 显示错误信息
    function showError(message) {
        uploadStatus.textContent = message;
        uploadStatus.className = 'upload-status error';

        // 震动效果
        dropArea.classList.add('shake');
        setTimeout(() => {
            dropArea.classList.remove('shake');
        }, 500);
    }

    // 显示多个上传结果
    function showResults(results, files) {
        // 获取或创建图片列表容器
        let imageListContainer = document.getElementById('imageListContainer');
        if (!imageListContainer) {
            // 创建图片列表容器
            imageListContainer = document.createElement('div');
            imageListContainer.id = 'imageListContainer';
            imageListContainer.className = 'image-list-container';
            resultContainer.insertBefore(imageListContainer, resultContainer.querySelector('.link-group'));
        } else {
            // 清空现有内容
            imageListContainer.innerHTML = '';
        }

        // 构建基本URL
        const baseUrl = window.location.origin;

        // 如果只有一个图片，仍然使用旧的预览方式
        if (results.length === 1) {
            const fileUrl = baseUrl + results[0].src;
            const previewUrl = fileUrl + '?preview=true';

            // 设置图片预览
            previewImage.src = fileUrl;
            previewImage.alt = files[0].name;

            // 设置各种代码
            directLink.value = fileUrl;
            previewLink.value = previewUrl;
            htmlCode.value = `<img src="${fileUrl}" alt="${files[0].name}" />`;
            mdCode.value = `![${files[0].name}](${fileUrl})`;
        } else {
            // 批量上传的情况，创建图片列表
            for (let i = 0; i < results.length; i++) {
                const fileUrl = baseUrl + results[i].src;
                const fileName = files[i] ? files[i].name : `图片${i+1}`;

                // 创建缩略图项
                const imageItem = document.createElement('div');
                imageItem.className = 'image-item';

                // 创建图片元素
                const img = document.createElement('img');
                img.src = fileUrl;
                img.alt = fileName;
                img.addEventListener('click', () => {
                    // 点击单张图片时更新主预览和链接
                    const previewUrl = fileUrl + '?preview=true';
                    previewImage.src = fileUrl;
                    previewImage.alt = fileName;
                    directLink.value = fileUrl;
                    previewLink.value = previewUrl;
                    htmlCode.value = `<img src="${fileUrl}" alt="${fileName}" />`;
                    mdCode.value = `![${fileName}](${fileUrl})`;
                });

                // 添加到容器
                imageItem.appendChild(img);
                imageListContainer.appendChild(imageItem);
            }

            // 默认选中第一张图片
            if (results.length > 0) {
                const firstFileUrl = baseUrl + results[0].src;
                const firstPreviewUrl = firstFileUrl + '?preview=true';
                const firstName = files[0] ? files[0].name : '图片1';

                // 设置默认预览
                previewImage.src = firstFileUrl;
                previewImage.alt = firstName;

                // 设置默认代码
                directLink.value = firstFileUrl;
                previewLink.value = firstPreviewUrl;
                htmlCode.value = `<img src="${firstFileUrl}" alt="${firstName}" />`;
                mdCode.value = `![${firstName}](${firstFileUrl})`;
            }
        }

        // 控制批量处理按钮的显示
        const batchProcessBtn = document.getElementById('batchProcessBtn');
        if (batchProcessBtn) {
            if (files.length > 1) {
                // 多张图片时显示批量处理按钮
                batchProcessBtn.style.display = 'flex';
                
                // 移除之前的事件监听器
                batchProcessBtn.removeEventListener('click', handleBatchProcess);
                
                // 添加新的事件监听器
                batchProcessBtn.addEventListener('click', handleBatchProcess);
                
                function handleBatchProcess() {
                    if (window.batchProcessor && files.length > 0) {
                        // 打开批量处理器
                        window.batchProcessor.open(files);
                    } else {
                        console.error('批量处理器未初始化或没有文件');
                        alert('批量处理器未准备就绪，请稍后再试');
                    }
                }
            } else {
                // 单张图片时隐藏批量处理按钮
                batchProcessBtn.style.display = 'none';
            }
        }

        // 隐藏上传区域，显示结果
        dropArea.style.display = 'none';
        resultContainer.style.display = 'block';

        // 添加编辑按钮的事件监听器
        const editImageBtn = document.getElementById('editImageBtn');
        if (editImageBtn) {
            // 移除之前的事件监听器
            editImageBtn.removeEventListener('click', handleEditImage);
            
            // 添加新的事件监听器
            editImageBtn.addEventListener('click', handleEditImage);
            
            function handleEditImage() {
                const currentImageSrc = previewImage.src;
                const currentImageName = previewImage.alt || 'edited-image.jpg';
                
                if (currentImageSrc && window.imageEditor) {
                    // 创建一个临时的Image对象来加载图片
                    const tempImg = new Image();
                    tempImg.crossOrigin = 'anonymous'; // 允许跨域
                    
                    tempImg.onload = function() {
                        // 图片加载完成后打开编辑器
                        window.imageEditor.open(tempImg, currentImageName);
                    };
                    
                    tempImg.onerror = function() {
                        console.error('图片加载失败:', currentImageSrc);
                        alert('图片加载失败，无法编辑');
                    };
                    
                    tempImg.src = currentImageSrc;
                } else {
                    console.error('图像编辑器未初始化或没有选中的图片');
                    alert('图像编辑器未准备就绪，请稍后再试');
                }
            }
        }

        // 存储当前文件列表，供批量处理使用
        window.currentUploadedFiles = files;
    }

    // 再次上传
    uploadAgainBtn.addEventListener('click', () => {
        // 清空文件输入
        fileInput.value = '';
        uploadStatus.textContent = '';
        uploadStatus.className = 'upload-status';

        // 隐藏结果，显示上传区域
        resultContainer.style.display = 'none';
        dropArea.style.display = 'block';
    });

    // 将handleFiles和showError导出到全局，供粘贴上传功能使用
    window.uploadHandlers = {
        handleFiles: handleFiles,
        showError: showError
    };

    // 初始化时显示当前上传配额
    refreshQuota();
}

// 图片预览功能
function initImagePreview() {
    const previewImage = document.getElementById('previewImage');
    // 绑定到容器（而非仅图片），避免“点击查看大图”遮罩拦截点击
    const previewContainer = previewImage ? previewImage.closest('.image-preview') : null;
    const clickTarget = previewContainer || previewImage;

    if (clickTarget && previewImage) {
        clickTarget.style.cursor = 'zoom-in';
        clickTarget.addEventListener('click', () => {
            if (!previewImage.src) return;
            // 创建全屏预览
            const fullscreenPreview = document.createElement('div');
            fullscreenPreview.className = 'fullscreen-preview';
            fullscreenPreview.innerHTML = `
                <div class="fullscreen-preview-content">
                    <img src="${previewImage.src}" alt="${previewImage.alt}">
                    <button class="close-preview">×</button>
                </div>
            `;

            document.body.appendChild(fullscreenPreview);
            document.body.style.overflow = 'hidden';

            // 获取预览图片元素
            const previewFullImg = fullscreenPreview.querySelector('img');

            // 添加双指缩放功能（移动端）
            let initialPinchDistance = 0;
            let currentScale = 1;

            // 处理双指触摸开始
            previewFullImg.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    initialPinchDistance = getPinchDistance(e);
                }
            }, { passive: false });

            // 处理双指触摸移动
            previewFullImg.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const currentPinchDistance = getPinchDistance(e);

                    if (initialPinchDistance > 0) {
                        const newScale = currentScale * (currentPinchDistance / initialPinchDistance);
                        // 限制缩放范围
                        if (newScale >= 0.5 && newScale <= 3) {
                            currentScale = newScale;
                            previewFullImg.style.transform = `scale(${currentScale})`;
                        }
                    }

                    initialPinchDistance = currentPinchDistance;
                }
            }, { passive: false });

            // 计算双指之间的距离
            function getPinchDistance(e) {
                return Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
            }

            // 双击缩放功能
            let lastTapTime = 0;
            previewFullImg.addEventListener('click', (e) => {
                e.stopPropagation();

                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTapTime;

                if (tapLength < 300 && tapLength > 0) {
                    // 双击切换缩放
                    if (currentScale === 1) {
                        currentScale = 2;
                    } else {
                        currentScale = 1;
                    }
                    previewFullImg.style.transform = `scale(${currentScale})`;
                    e.preventDefault();
                }

                lastTapTime = currentTime;
            });

            // 添加关闭功能
            fullscreenPreview.addEventListener('click', (e) => {
                if (e.target === fullscreenPreview || e.target.classList.contains('close-preview')) {
                    document.body.removeChild(fullscreenPreview);
                    document.body.style.overflow = '';
                }
            });

            // ESC键关闭
            document.addEventListener('keydown', function escClose(e) {
                if (e.key === 'Escape') {
                    document.body.removeChild(fullscreenPreview);
                    document.body.style.overflow = '';
                    document.removeEventListener('keydown', escClose);
                }
            });
        });
    }
}

// 3D卡片效果初始化
function init3DCards() {
    const cards = document.querySelectorAll('.card');

    cards.forEach(card => {
        // 鼠标移动效果
        card.addEventListener('mousemove', handleCardMove);
        // 鼠标离开效果
        card.addEventListener('mouseleave', handleCardLeave);
    });

    // 处理卡片移动
    function handleCardMove(e) {
        const card = this;
        const cardRect = card.getBoundingClientRect();
        const cardContent = card.querySelector('.card-content');
        const icon = card.querySelector('.feature-icon');
        const title = card.querySelector('h3');
        const description = card.querySelector('p');

        // 计算鼠标在卡片上的相对位置 (从-1到1)
        const x = ((e.clientX - cardRect.left) / cardRect.width) * 2 - 1;
        const y = ((e.clientY - cardRect.top) / cardRect.height) * 2 - 1;

        // 根据鼠标位置计算旋转角度
        const rotateY = x * 10;
        const rotateX = -y * 10;

        // 普通卡片效果
        if (cardContent) {
            cardContent.style.transform = `perspective(1000px) rotateX(${rotateX * 0.5}deg) rotateY(${rotateY * 0.5}deg)`;
        } else {
            card.style.transform = `perspective(1000px) rotateX(${rotateX * 0.5}deg) rotateY(${rotateY * 0.5}deg)`;
        }

        // 内部元素的3D效果
        if (icon) icon.style.transform = `translateZ(40px) translateX(${rotateY * 0.3}px) translateY(${-rotateX * 0.3}px)`;
        if (title) title.style.transform = `translateZ(30px) translateX(${rotateY * 0.2}px) translateY(${-rotateX * 0.2}px)`;
        if (description) description.style.transform = `translateZ(20px) translateX(${rotateY * 0.1}px) translateY(${-rotateX * 0.1}px)`;

        // 动态光影效果
        const glare = card.querySelector('.card-glare') || createGlare(card);
        const glareOpacity = Math.sqrt(x*x + y*y) * 0.1 + 0.05;
        const glarePosition = {
            x: (x + 1) / 2 * 100,
            y: (y + 1) / 2 * 100
        };

        glare.style.background = `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(255,255,255,${glareOpacity}), transparent 50%)`;
    }

    // 处理卡片离开
    function handleCardLeave() {
        const card = this;
        const cardContent = card.querySelector('.card-content');
        const icon = card.querySelector('.feature-icon');
        const title = card.querySelector('h3');
        const description = card.querySelector('p');

        // 重置所有变换
        card.style.transform = '';

        if (cardContent) cardContent.style.transform = '';
        if (icon) icon.style.transform = '';
        if (title) title.style.transform = '';
        if (description) description.style.transform = '';

        // 重置光影效果
        const glare = card.querySelector('.card-glare');
        if (glare) {
            glare.style.background = 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03), transparent 50%)';
        }
    }

    // 创建光影效果元素
    function createGlare(card) {
        const glare = document.createElement('div');
        glare.className = 'card-glare';
        glare.style.position = 'absolute';
        glare.style.top = '0';
        glare.style.left = '0';
        glare.style.width = '100%';
        glare.style.height = '100%';
        glare.style.borderRadius = 'inherit';
        glare.style.pointerEvents = 'none';
        glare.style.zIndex = '1';

        card.appendChild(glare);
        return glare;
    }
}

// 滚动进度条初始化
function initScrollProgress() {
    const progressBar = document.getElementById('scrollProgress');
    if (!progressBar) return;

    // 更新进度条
    function updateProgress() {
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrollPercentage = (scrollTop / scrollHeight) * 100;

        progressBar.style.width = `${scrollPercentage}%`;

        // 根据滚动位置调整进度条颜色
        const hue = 220 + (scrollPercentage * 0.4); // 从蓝色到紫色的渐变
        progressBar.style.background = `linear-gradient(to right, hsl(${hue}, 80%, 60%), hsl(${hue + 20}, 80%, 50%))`;
    }

    // 初始更新
    updateProgress();

    // 滚动时更新
    window.addEventListener('scroll', updateProgress);

    // 窗口大小改变时更新
    window.addEventListener('resize', updateProgress);
}

// 返回顶部按钮初始化
function initBackToTop() {
    const backToTopBtn = document.getElementById('backToTop');
    if (!backToTopBtn) return;

    // 显示/隐藏按钮
    function toggleBackToTopButton() {
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;

        // 当滚动超过300px时显示按钮
        if (scrollTop > 300) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    }

    // 点击返回顶部
    backToTopBtn.addEventListener('click', () => {
        // 平滑滚动到顶部
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // 初始检查
    toggleBackToTopButton();

    // 滚动时检查
    window.addEventListener('scroll', toggleBackToTopButton);
}

// 平滑页面跳转函数 - 增强版
function smoothPageTransition(url) {
    // 获取页面加载动画元素
    const pageLoader = document.getElementById('pageLoader');
    const pageTransition = document.getElementById('pageTransition');

    // 保存当前滚动位置
    const scrollPosition = window.scrollY || document.documentElement.scrollTop;
    sessionStorage.setItem('scrollPosition', scrollPosition);

    // 保存当前页面URL，用于返回按钮
    const currentUrl = window.location.href;
    sessionStorage.setItem('previousPage', currentUrl);

    if (pageLoader && pageTransition) {
        // 先显示页面过渡动画
        pageTransition.classList.add('active');

        // 添加页面退出动画类
        document.body.classList.add('page-exit');

        // 延迟一小段时间再跳转，让动画显示一段时间
        setTimeout(() => {
            window.location.href = url;
        }, 500);
    } else {
        // 如果找不到动画元素，直接跳转
        window.location.href = url;
    }
}

// 移动端菜单初始化
function initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenuCloseBtn = document.getElementById('mobileMenuCloseBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');

    if (!mobileMenuBtn || !mobileMenu) {
        console.error('移动端菜单元素未找到');
        return;
    }

    console.log('初始化移动端菜单');

    // 确保移动菜单按钮可见（在移动设备上）
    if (window.innerWidth <= 768) {
        mobileMenuBtn.style.display = 'flex';
    }

    // 打开菜单
    mobileMenuBtn.addEventListener('click', (e) => {
        console.log('点击菜单按钮');
        e.preventDefault();
        e.stopPropagation();

        // 确保菜单按钮在最上层
        mobileMenuBtn.style.zIndex = '1002';

        // 显示菜单
        mobileMenu.classList.add('active');
        mobileMenuOverlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    });

    // 关闭菜单的函数
    const closeMenu = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        mobileMenu.classList.remove('active');
        mobileMenuOverlay.classList.remove('active');
        document.body.style.overflow = ''; // 恢复滚动

        // 延迟一下再重置z-index，避免闪烁
        setTimeout(() => {
            mobileMenuBtn.style.zIndex = '1002';
        }, 300);
    };

    // 关闭按钮点击事件
    if (mobileMenuCloseBtn) {
        mobileMenuCloseBtn.addEventListener('click', (e) => {
            console.log('点击关闭按钮');
            closeMenu(e);
        });
    }

    // 遮罩点击关闭
    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', (e) => {
            console.log('点击遮罩层');
            closeMenu(e);
        });
    }

    // 移动端菜单链接点击后关闭菜单
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            console.log('点击菜单链接:', link.textContent);

            // 如果是内部链接，关闭菜单
            if (!link.getAttribute('href').startsWith('http')) {
                // 延迟一下再跳转，确保菜单关闭动画完成
                e.preventDefault();
                closeMenu();

                setTimeout(() => {
                    window.location.href = link.getAttribute('href');
                }, 300);
            }
        });
    });

    // 监听窗口大小变化，在大屏幕上自动关闭移动菜单，在小屏幕上显示菜单按钮
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            if (mobileMenu.classList.contains('active')) {
                closeMenu();
            }
            mobileMenuBtn.style.display = 'none';
        } else {
            mobileMenuBtn.style.display = 'flex';
        }
    });

    // 添加触摸滑动关闭菜单功能
    let touchStartX = 0;

    mobileMenu.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    mobileMenu.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchDiff = touchEndX - touchStartX;

        // 向右滑动超过50px时关闭菜单
        if (touchDiff > 50) {
            closeMenu();
        }
    }, { passive: true });

    // 初始检查
    if (window.innerWidth <= 768) {
        console.log('移动设备检测到，显示菜单按钮');
        mobileMenuBtn.style.display = 'flex';
    }
}