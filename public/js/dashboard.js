/**
 * 用户图片管理相关功能
 * 升级版 - 增强用户体验和功能
 */

// 全局变量
let currentPage = 1;
let totalPages = 1;
let currentImages = [];
let currentTags = [];
let currentEditingImageId = null;
let allTags = new Set(); // 存储所有标签
let currentSortMethod = 'newest'; // 默认排序方式
let currentTagFilter = ''; // 当前标签过滤器
let selectedImages = new Set(); // 存储选中的图片ID
let isSelectionMode = false; // 是否处于选择模式
let currentViewMode = 'grid'; // 默认视图模式：grid, list, timeline
let favoriteImages = new Set(); // 存储收藏的图片ID
let showOnlyFavorites = false; // 是否只显示收藏的图片
let customOrder = []; // 存储用户自定义排序顺序
let isDraggable = false; // 是否启用拖拽排序

// ponytail: thin i18n helper for runtime strings
function tt(key, fallback) {
    if (window.UserPrefs && typeof window.UserPrefs.t === 'function') {
        const lang = (window.UserPrefs.read && window.UserPrefs.read().language) || 'zh-CN';
        const v = window.UserPrefs.t(key, lang);
        if (v && v !== key) return v;
    }
    return fallback != null ? fallback : key;
}
// 初始化仪表盘
function initDashboard() {
    // 从本地存储加载收藏的图片
    loadFavorites();

    // 从本地存储加载自定义排序
    loadCustomOrder();

    // 默认始终按「最新上传」；仅 URL ?sort= 可覆盖
    const params = new URLSearchParams(window.location.search);
    const urlSort = params.get('sort');
    const urlTag = params.get('tag');
    const allowedSorts = new Set(['newest', 'oldest', 'name', 'size', 'custom']);
    currentSortMethod = (urlSort && allowedSorts.has(urlSort)) ? urlSort : 'newest';
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = currentSortMethod;
        // 确保 option 选中态与变量一致
        Array.from(sortSelect.options).forEach((opt) => {
            opt.selected = opt.value === currentSortMethod;
        });
    }
    if (urlTag) {
        currentTagFilter = urlTag;
    }

    // 来自其他页面「统计信息」的跳转：自动打开统计面板
    if (params.get('stats') === '1') {
        setTimeout(() => {
            openChartsPanel();
        }, 300);
    }

    // 加载用户图片（带标签过滤）
    loadUserImages(1, '', urlTag || '');

    // 初始化搜索功能
    initSearch();

    // 初始化排序功能
    initSortFilter();

    // 初始化编辑模态框
    initEditModal();

    // 初始化图片查看器
    initImageViewer();

    // 初始化批量操作功能
    initBatchOperations();

    // 初始化数据可视化图表（Chart.js 改为打开统计面板时按需加载）

    // 初始化视图模式切换
    initViewModes();

    // 初始化收藏功能
    initFavorites();

    // 初始化拖拽排序功能
    initDragSort();

    // 初始化菜单徽章
    initMenuBadges();

    // 初始化复制链接功能
    new ClipboardJS('#copyEditLink').on('success', function(e) {
        const button = e.trigger;
        const originalHTML = button.innerHTML;

        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;

        setTimeout(() => {
            button.innerHTML = originalHTML;
        }, 2000);
    });
}

// 初始化菜单徽章
function initMenuBadges() {
    updateMenuBadges();
}

// 更新菜单徽章
function updateMenuBadges() {
    // 更新图片数量徽章
    const imageCountBadge = document.getElementById('imageCountBadge');
    if (imageCountBadge) {
        const totalImages = currentImages.length;
        imageCountBadge.textContent = totalImages;
        
        // 添加数字增长动画
        if (totalImages > 0) {
            imageCountBadge.style.transform = 'scale(1.2)';
            setTimeout(() => {
                imageCountBadge.style.transform = 'scale(1)';
            }, 200);
        }
    }

    // 更新收藏数量徽章
    const favoriteCountBadge = document.getElementById('favoriteCountBadge');
    if (favoriteCountBadge) {
        const favoriteCount = favoriteImages.size;
        favoriteCountBadge.textContent = favoriteCount;
        
        // 添加数字增长动画
        if (favoriteCount > 0) {
            favoriteCountBadge.style.transform = 'scale(1.2)';
            setTimeout(() => {
                favoriteCountBadge.style.transform = 'scale(1)';
            }, 200);
        }
    }
}

// 从本地存储加载自定义排序
function loadCustomOrder() {
    const savedOrder = localStorage.getItem('customImageOrder');
    if (savedOrder) {
        customOrder = JSON.parse(savedOrder);
    }
}

// 保存自定义排序到本地存储
function saveCustomOrder() {
    localStorage.setItem('customImageOrder', JSON.stringify(customOrder));
}

// 从本地存储加载收藏的图片
function loadFavorites() {
    const savedFavorites = localStorage.getItem('favoriteImages');
    if (savedFavorites) {
        const favoritesArray = JSON.parse(savedFavorites);
        favoriteImages = new Set(favoritesArray);
    }
}

// 保存收藏的图片到本地存储
function saveFavorites() {
    const favoritesArray = Array.from(favoriteImages);
    localStorage.setItem('favoriteImages', JSON.stringify(favoritesArray));
}

// 初始化收藏功能
function initFavorites() {
    // 收藏过滤器切换
    const favoriteToggle = document.getElementById('favoriteToggle');
    favoriteToggle.addEventListener('change', () => {
        showOnlyFavorites = favoriteToggle.checked;

        // 重新渲染图片
        if (currentViewMode === 'timeline') {
            renderTimelineView();
        } else {
            // 如果只显示收藏，过滤图片
            const imagesToRender = showOnlyFavorites
                ? currentImages.filter(img => favoriteImages.has(img.id))
                : currentImages;

            renderImages(imagesToRender);
        }
    });
}

// 初始化视图模式切换
function initViewModes() {
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    const timelineViewBtn = document.getElementById('timelineViewBtn');
    const imageGrid = document.getElementById('imageGrid');

    // 从本地存储中恢复上次的视图模式
    const savedViewMode = localStorage.getItem('viewMode');
    if (savedViewMode) {
        currentViewMode = savedViewMode;
        updateViewMode();
    }

    // 网格视图按钮点击事件
    gridViewBtn.addEventListener('click', () => {
        if (currentViewMode !== 'grid') {
            currentViewMode = 'grid';
            updateViewMode();
            localStorage.setItem('viewMode', 'grid');
        }
    });

    // 列表视图按钮点击事件
    listViewBtn.addEventListener('click', () => {
        if (currentViewMode !== 'list') {
            currentViewMode = 'list';
            updateViewMode();
            localStorage.setItem('viewMode', 'list');
        }
    });

    // 时间线视图按钮点击事件
    timelineViewBtn.addEventListener('click', () => {
        if (currentViewMode !== 'timeline') {
            currentViewMode = 'timeline';
            updateViewMode();
            localStorage.setItem('viewMode', 'timeline');
        }
    });
}

// 更新视图模式
function updateViewMode() {
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    const timelineViewBtn = document.getElementById('timelineViewBtn');
    const imageGrid = document.getElementById('imageGrid');

    // 更新按钮状态
    gridViewBtn.classList.toggle('active', currentViewMode === 'grid');
    listViewBtn.classList.toggle('active', currentViewMode === 'list');
    timelineViewBtn.classList.toggle('active', currentViewMode === 'timeline');

    // 更新图片网格类名
    imageGrid.className = 'image-grid';
    if (currentViewMode === 'list') {
        imageGrid.classList.add('list-view');
    } else if (currentViewMode === 'timeline') {
        imageGrid.classList.add('timeline-view');
        renderTimelineView();
    } else {
        // 默认网格视图，重新渲染图片
        renderImages(currentImages);
    }
}

// 渲染时间线视图
function renderTimelineView() {
    const imageGrid = document.getElementById('imageGrid');
    imageGrid.innerHTML = '';

    // 如果只显示收藏，过滤图片
    const imagesToRender = showOnlyFavorites
        ? currentImages.filter(img => favoriteImages.has(img.id))
        : currentImages;

    if (imagesToRender.length === 0) {
        // 显示空状态
        imageGrid.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <h3>${showOnlyFavorites ? tt('gallery.empty.fav','没有收藏的图片') : tt('gallery.empty.none','没有图片')}</h3>
                <p>${showOnlyFavorites ? tt('gallery.empty.favText','您还没有收藏任何图片，点击图片右上角的星标收藏。') : tt('gallery.empty.noneText','上传一些图片开始使用吧！')}</p>
            </div>
        `;
        return;
    }

    // 按日期分组图片
    const dateGroups = groupImagesByDate(imagesToRender);

    // 按日期降序排序
    const sortedDates = Object.keys(dateGroups).sort((a, b) => new Date(b) - new Date(a));

    // 渲染每个日期组
    sortedDates.forEach(date => {
        const images = dateGroups[date];
        const dateObj = new Date(date);

        // 格式化日期显示
        const formattedDate = dateObj.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });

        // 创建日期组容器
        const dateGroup = document.createElement('div');
        dateGroup.className = 'timeline-date-group';

        // 创建日期标题
        const dateTitle = document.createElement('h3');
        dateTitle.className = 'timeline-date';
        dateTitle.textContent = formattedDate;
        dateGroup.appendChild(dateTitle);

        // 创建图片网格
        const imagesGrid = document.createElement('div');
        imagesGrid.className = 'timeline-images';

        // 渲染该日期下的图片
        images.forEach(image => {
            const card = createImageCard(image);
            imagesGrid.appendChild(card);
        });

        dateGroup.appendChild(imagesGrid);
        imageGrid.appendChild(dateGroup);
    });

    // 初始化事件监听器
    initImageCardEvents();
}

// 按日期分组图片
function groupImagesByDate(images) {
    const groups = {};

    images.forEach(image => {
        const date = new Date(image.uploadTime);
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

        if (!groups[dateStr]) {
            groups[dateStr] = [];
        }

        groups[dateStr].push(image);
    });

    return groups;
}

// 创建图片卡片
function createImageCard(image) {
    const card = document.createElement('div');
    // 同时带 image-card 以兼容拖拽/选择器与样式
    card.className = 'image-card image-card-enhanced';
    card.dataset.id = image.id;

    // 如果图片被选中，添加选中样式
    if (selectedImages.has(image.id)) {
        card.classList.add('selected');
    }

    // 检查是否是收藏的图片
    const isFavorite = favoriteImages.has(image.id);
    if (isFavorite) {
        card.classList.add('favorite');
    }

    // 如果启用了拖拽排序，添加相关类和属性
    if (isDraggable) {
        card.classList.add('draggable');
    }

    // 格式化文件大小
    const fileSize = formatFileSize(image.fileSize);

    // 格式化上传时间
    const uploadDate = new Date(image.uploadTime).toLocaleDateString();
    const uploadTime = new Date(image.uploadTime).toLocaleTimeString();

    // 创建标签HTML
    const esc = (typeof escapeHtml === 'function')
        ? escapeHtml
        : (window.commonUtils && window.commonUtils.escapeHtml) || ((s) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    const safeName = esc(image.fileName);
    const safeUrl = esc(image.url);
    const safeId = esc(image.id);
    const tagsHtml = image.tags && image.tags.length > 0
        ? `<div class="image-tags">
            ${image.tags.map(tag => {
                const t = esc(tag);
                return `<span class="image-tag" data-tag="${t}">${t}</span>`;
            }).join('')}
           </div>`
        : '';

    card.innerHTML = `
        ${isSelectionMode ? `
        <div class="image-select">
            <input type="checkbox" class="image-checkbox" id="check-${safeId}" ${selectedImages.has(image.id) ? 'checked' : ''}>
            <label for="check-${safeId}" class="image-checkbox-label"></label>
        </div>
        ` : ''}
        <div class="image-preview-enhanced" data-id="${safeId}" data-url="${safeUrl}">
            <img src="${safeUrl}" alt="${safeName}" loading="lazy">
            <div class="image-overlay"></div>
            <div class="image-zoom-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
            </div>
            <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-id="${safeId}" title="${isFavorite ? tt('gallery.fav.remove','取消收藏') : tt('gallery.fav.add','收藏图片')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
            </button>
            <div class="drag-handle" title="拖拽排序">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="5" r="1"></circle>
                    <circle cx="9" cy="12" r="1"></circle>
                    <circle cx="9" cy="19" r="1"></circle>
                    <circle cx="15" cy="5" r="1"></circle>
                    <circle cx="15" cy="12" r="1"></circle>
                    <circle cx="15" cy="19" r="1"></circle>
                </svg>
            </div>
        </div>
        <div class="image-info">
            <div class="image-name" title="${safeName}">${safeName}</div>
            <div class="image-meta">
                <span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                        <line x1="6" y1="6" x2="6.01" y2="6"></line>
                        <line x1="6" y1="18" x2="6.01" y2="18"></line>
                    </svg>
                    ${fileSize}
                </span>
                <span title="${uploadDate} ${uploadTime}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    ${uploadTime}
                </span>
            </div>
            ${tagsHtml}
        </div>
        <div class="image-actions">
            <button class="image-btn copy-btn" data-clipboard-text="${esc(window.location.origin + image.url)}" title="${tt('gallery.copyTitle', '复制图片链接')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                ${tt('common.copy', '复制')}
            </button>
            <button class="image-btn edit-btn" data-id="${safeId}" title="${tt('gallery.editTitle', '编辑图片信息')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                ${tt('common.edit', '编辑')}
            </button>
            <button class="image-btn delete-btn" data-id="${safeId}" title="${tt('gallery.deleteTitle', '删除图片')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                ${tt('common.delete', '删除')}
            </button>
        </div>
    `;

    return card;
}

// 初始化图片卡片事件
let cardClipboard = null;

function initImageCardEvents() {
    // 复制按钮：ClipboardJS 用选择器时是事件委托，全局建一次即可覆盖后续新卡片。
    // 之前每次渲染都 new 一个，实例越堆越多，复制一次会触发 N 次回调。
    if (!cardClipboard) {
        cardClipboard = new ClipboardJS('.copy-btn');
        // 成功态只换图标/class，不改文案长度，避免卡片被顶高
        cardClipboard.on('success', function(e) {
            const btn = e.trigger;
            if (btn.dataset.copyBusy === '1') return;
            btn.dataset.copyBusy = '1';
            const originalHtml = btn.innerHTML;
            btn.classList.add('is-copied');
            // icon-only success — same footprint as “复制”, no reflow
            btn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
            btn.setAttribute('aria-label', tt('common.copied','已复制'));
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.classList.remove('is-copied');
                btn.dataset.copyBusy = '';
            }, 1600);
        });
    }

    // 添加编辑按钮事件
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发卡片选择
            const imageId = btn.dataset.id;
            openEditModal(imageId);
        });
    });

    // 添加删除按钮事件
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发卡片选择
            const imageId = btn.dataset.id;
            confirmDeleteImage(imageId);
        });
    });

    // 添加收藏按钮事件
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发卡片选择或预览
            const imageId = btn.dataset.id;
            toggleFavorite(imageId, btn);
        });
    });

    // 添加图片预览点击事件
    document.querySelectorAll('.image-preview-enhanced').forEach(preview => {
        preview.addEventListener('click', (e) => {
            // 如果点击的是收藏按钮，不打开查看器
            if (e.target.closest('.favorite-btn')) {
                return;
            }

            if (isSelectionMode) {
                e.stopPropagation(); // 在选择模式下，点击预览不打开查看器
                return;
            }
            const imageId = preview.dataset.id;
            const imageUrl = preview.dataset.url;
            openImageViewer(imageId, imageUrl);

            // 添加点击动画效果
            preview.classList.add('clicked');
            setTimeout(() => {
                preview.classList.remove('clicked');
            }, 300);
        });

        // 添加鼠标悬停效果
        preview.addEventListener('mouseenter', () => {
            preview.querySelector('.image-overlay').style.opacity = '1';
        });

        preview.addEventListener('mouseleave', () => {
            preview.querySelector('.image-overlay').style.opacity = '0';
        });
    });

    // 添加标签点击事件
    document.querySelectorAll('.image-tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发父元素的点击事件
            const tagName = tag.dataset.tag;
            filterByTag(tagName);
        });
    });

    // 添加图片卡片选择事件
    if (isSelectionMode) {
        document.querySelectorAll('.image-card-enhanced').forEach(card => {
            card.addEventListener('click', () => {
                const imageId = card.dataset.id;
                toggleImageSelection(imageId, card);
            });
        });

        document.querySelectorAll('.image-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation(); // 防止触发卡片点击事件
                const imageId = checkbox.id.replace('check-', '');
                const card = document.querySelector(`.image-card-enhanced[data-id="${imageId}"]`);
                toggleImageSelection(imageId, card, checkbox.checked);
            });
        });
    }
}

// 切换收藏状态
function toggleFavorite(imageId, button) {
    const isFavorite = favoriteImages.has(imageId);

    if (isFavorite) {
        // 取消收藏
        favoriteImages.delete(imageId);
        button.classList.remove('active');
        button.title = tt('gallery.fav.add','收藏图片');
        button.querySelector('svg').setAttribute('fill', 'none');

        // 触发美化通知
        if (window.beautyEffects) {
            window.beautyEffects.showNotification(tt('gallery.fav.removed','已取消收藏'), 'warning', 2000);
        }
    } else {
        // 添加收藏
        favoriteImages.add(imageId);
        button.classList.add('active');
        button.title = tt('gallery.fav.remove','取消收藏');
        button.querySelector('svg').setAttribute('fill', 'currentColor');

        // 触发美化通知
        if (window.beautyEffects) {
            window.beautyEffects.showNotification(tt('gallery.fav.added','已添加到收藏'), 'success', 2000);
        }
    }

    // 保存到本地存储
    saveFavorites();

    // 更新菜单徽章
    updateMenuBadges();

    // 如果当前在显示收藏模式且取消了收藏，重新渲染
    if (showOnlyFavorites && isFavorite) {
        if (currentViewMode === 'timeline') {
            renderTimelineView();
        } else {
            const imagesToRender = currentImages.filter(img => favoriteImages.has(img.id));
            renderImages(imagesToRender);
        }
    }
}

// 加载用户图片
async function loadUserImages(page = 1, query = '', tag = '') {
    try {
        const imageGrid = document.getElementById('imageGrid');
        const emptyState = document.getElementById('emptyState');
        const pagination = document.getElementById('pagination');

        // 显示加载状态
        imageGrid.innerHTML = '<div class="loading-text">' + tt('common.loading','加载中…') + '</div>';

        // 构建API URL
        let url = `/api/images?page=${page}`;
        if (query) {
            url += `&q=${encodeURIComponent(query)}`;
        }
        if (tag) {
            url += `&tag=${encodeURIComponent(tag)}`;
        }

        // 发送请求
        const response = await fetch(url, {
            headers: getAuthHeader()
        });

        if (!response.ok) {
            throw new Error('获取图片失败');
        }

        const data = await response.json();
        let images = data.files || [];

        // 更新分页信息
        if (data.pagination) {
            currentPage = data.pagination.page;
            totalPages = data.pagination.totalPages;
        }

        // 应用排序
        images = sortImages(images, currentSortMethod);

        // 应用标签过滤
        if (currentTagFilter && !tag) {
            images = images.filter(img =>
                img.tags && img.tags.includes(currentTagFilter)
            );
        }

        // 保存当前图片列表
        currentImages = images;

        // 收集所有标签
        collectAllTags(images);

        // 更新统计信息
        updateStatistics(data);

        // 检查是否有图片
        if (currentImages.length === 0) {
            imageGrid.innerHTML = '';
            emptyState.style.display = 'block';
            pagination.style.display = 'none';
            return;
        }

        // 隐藏空状态
        emptyState.style.display = 'none';

        // 根据当前视图模式渲染图片
        if (currentViewMode === 'timeline') {
            renderTimelineView();
        } else {
            renderImages(currentImages);
        }

        // 渲染分页
        renderPagination();

        // 渲染标签过滤器
        renderTagFilters();
    } catch (error) {
        console.error('加载图片错误:', error);
        document.getElementById('imageGrid').innerHTML = `
            <div class="error-message">
                加载图片失败: ${error.message}
                <button onclick="loadUserImages()" class="retry-btn">重试</button>
            </div>
        `;
    }
}

// 收集所有标签
function collectAllTags(images) {
    allTags.clear();
    images.forEach(image => {
        if (image.tags && Array.isArray(image.tags)) {
            image.tags.forEach(tag => allTags.add(tag));
        }
    });
}

// 更新统计信息
function updateStatistics(data) {
    // 更新状态卡片
    document.getElementById('totalImages').textContent = data.totalImages;
    document.getElementById('totalSize').textContent = formatFileSize(data.totalSize);
    document.getElementById('recentUploads').textContent = data.recentUploads;
    document.getElementById('avgFileSize').textContent = formatFileSize(data.averageFileSize);

    // 图表未创建时不做任何事（面板打开时才建图并灌数据）
    if (uploadTrendChart && storageUsageChart) {
        try {
            updateCharts();
        } catch (error) {
            console.warn('Charts not available:', error);
        }
    }

    // 更新菜单徽章
    updateMenuBadges();
}

// 初始化图表
let uploadTrendChart = null;
let storageUsageChart = null;
let chartLibPromise = null;

// Chart.js 约 200KB，只有打开统计面板时才加载
function loadChartLib() {
    if (window.Chart) return Promise.resolve(true);
    if (chartLibPromise) return chartLibPromise;
    chartLibPromise = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        s.onload = () => resolve(true);
        s.onerror = () => { chartLibPromise = null; resolve(false); };
        document.head.appendChild(s);
    });
    return chartLibPromise;
}

// 面板首次打开时建图 + 灌数据
async function ensureCharts() {
    if (uploadTrendChart && storageUsageChart) return true;
    const ok = await loadChartLib();
    if (!ok) return false;
    try {
        initCharts();
        updateCharts();
        return true;
    } catch (e) {
        console.warn('图表初始化失败:', e);
        return false;
    }
}

function initCharts() {
    // 设置Chart.js全局配置
    const isDarkMode = document.body.classList.contains('dark-mode');
    Chart.defaults.color = isDarkMode ? '#f3f4f6' : '#1f2937';
    Chart.defaults.borderColor = isDarkMode ? '#374151' : '#e5e7eb';

    // 渐变背景色
    const uploadTrendCtx = document.getElementById('uploadTrendChart').getContext('2d');
    const gradientFill = uploadTrendCtx.createLinearGradient(0, 0, 0, 350);
    gradientFill.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradientFill.addColorStop(1, 'rgba(59, 130, 246, 0.02)');

    // 初始化上传趋势图表
    uploadTrendChart = new Chart(uploadTrendCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '上传数量',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: gradientFill,
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: isDarkMode ? '#1f2937' : '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#3b82f6',
                pointHoverBorderColor: isDarkMode ? '#1f2937' : '#ffffff',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1500,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: isDarkMode ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    titleColor: isDarkMode ? '#f3f4f6' : '#1f2937',
                    bodyColor: isDarkMode ? '#f3f4f6' : '#1f2937',
                    borderColor: isDarkMode ? '#374151' : '#e5e7eb',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    cornerRadius: 8,
                    caretSize: 6
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: {
                            size: 11
                        },
                        padding: 6
                    },
                    grid: {
                        display: true,
                        drawBorder: false,
                        color: isDarkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.7)'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: 10
                        },
                        padding: 6,
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8, // avoid dense labels clipping at edges
                        callback: function (value, index, ticks) {
                            const label = this.getLabelForValue(value);
                            // "MM-DD" → show as is; skip via autoSkip
                            return label;
                        }
                    },
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                }
            },
            layout: {
                padding: {
                    top: 4,
                    right: 12,
                    bottom: 4,
                    left: 4
                }
            }
        }
    });

    // 初始化存储使用情况图表
    const storageUsageCtx = document.getElementById('storageUsageChart').getContext('2d');
    storageUsageChart = new Chart(storageUsageCtx, {
        type: 'doughnut',
        data: {
            labels: ['图片', '其他文件'],
            datasets: [{
                data: [0, 0],
                backgroundColor: [
                    '#3b82f6',
                    '#8b5cf6'
                ],
                borderColor: isDarkMode ? '#1f2937' : '#ffffff',
                borderWidth: 3,
                hoverOffset: 10,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1500,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: {
                            size: 13
                        }
                    }
                },
                tooltip: {
                    backgroundColor: isDarkMode ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    titleColor: isDarkMode ? '#f3f4f6' : '#1f2937',
                    bodyColor: isDarkMode ? '#f3f4f6' : '#1f2937',
                    borderColor: isDarkMode ? '#374151' : '#e5e7eb',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            return context.label + ': ' + formatFileSize(value);
                        }
                    }
                }
            },
            cutout: '75%'
        }
    });

    // 监听主题变化，更新图表样式
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            setTimeout(() => {
                updateChartsTheme();
            }, 100);
        });
    }
}

// 更新图表数据
function updateCharts() {
    if (!uploadTrendChart || !storageUsageChart || currentImages.length === 0) return;

    // 处理上传趋势数据
    const dateMap = new Map();
    const now = new Date();

    // 创建过去30天的日期标签
    const labels = [];
    const data = [];
    const dayKeys = []; // full YYYY-MM-DD for lookup

    for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        dayKeys.push(dateStr);
        // show M/D without leading zero clutter
        labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
        dateMap.set(dateStr, 0);
    }

    // 统计每天的上传数量
    currentImages.forEach(img => {
        const date = new Date(img.uploadTime);
        if (Number.isNaN(date.getTime())) return;
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        if (dateMap.has(dateStr)) {
            dateMap.set(dateStr, dateMap.get(dateStr) + 1);
        }
    });

    // 填充数据数组
    dayKeys.forEach((key) => {
        data.push(dateMap.get(key) || 0);
    });

    // 更新上传趋势图表
    uploadTrendChart.data.labels = labels;
    uploadTrendChart.data.datasets[0].data = data;
    // denser points when 30 days — keep small
    uploadTrendChart.data.datasets[0].pointRadius = 2;
    uploadTrendChart.data.datasets[0].pointHoverRadius = 5;
    uploadTrendChart.update();

    // 更新存储使用情况图表
    let imageSize = 0;
    currentImages.forEach(img => {
        imageSize += img.fileSize || 0;
    });

    // 假设总存储空间为1GB，或者从API获取
    const totalStorage = 1024 * 1024 * 1024; // 1GB
    const otherSize = Math.max(0, totalStorage - imageSize);

    storageUsageChart.data.datasets[0].data = [imageSize, otherSize];
    storageUsageChart.update();
}

// 更新图表主题
function updateChartsTheme() {
    const isDarkMode = document.body.classList.contains('dark-mode');

    // 更新Chart.js全局配置
    Chart.defaults.color = isDarkMode ? '#f3f4f6' : '#1f2937';
    Chart.defaults.borderColor = isDarkMode ? '#374151' : '#e5e7eb';

    // 更新上传趋势图表
    if (uploadTrendChart) {
        // 更新点样式
        uploadTrendChart.data.datasets[0].pointBorderColor = isDarkMode ? '#1f2937' : '#ffffff';
        uploadTrendChart.data.datasets[0].pointHoverBorderColor = isDarkMode ? '#1f2937' : '#ffffff';

        // 更新网格颜色
        uploadTrendChart.options.scales.y.grid.color = isDarkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(229, 231, 235, 0.7)';

        // 更新工具提示样式
        uploadTrendChart.options.plugins.tooltip.backgroundColor = isDarkMode ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)';
        uploadTrendChart.options.plugins.tooltip.titleColor = isDarkMode ? '#f3f4f6' : '#1f2937';
        uploadTrendChart.options.plugins.tooltip.bodyColor = isDarkMode ? '#f3f4f6' : '#1f2937';
        uploadTrendChart.options.plugins.tooltip.borderColor = isDarkMode ? '#374151' : '#e5e7eb';

        uploadTrendChart.update();
    }

    // 更新存储使用情况图表
    if (storageUsageChart) {
        // 更新边框颜色
        storageUsageChart.data.datasets[0].borderColor = isDarkMode ? '#1f2937' : '#ffffff';

        // 更新工具提示样式
        storageUsageChart.options.plugins.tooltip.backgroundColor = isDarkMode ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)';
        storageUsageChart.options.plugins.tooltip.titleColor = isDarkMode ? '#f3f4f6' : '#1f2937';
        storageUsageChart.options.plugins.tooltip.bodyColor = isDarkMode ? '#f3f4f6' : '#1f2937';
        storageUsageChart.options.plugins.tooltip.borderColor = isDarkMode ? '#374151' : '#e5e7eb';

        storageUsageChart.update();
    }
}

// 排序图片
function sortImages(images, method) {
    const sortedImages = [...images];

    switch (method) {
        case 'newest':
            sortedImages.sort((a, b) => b.uploadTime - a.uploadTime);
            break;
        case 'oldest':
            sortedImages.sort((a, b) => a.uploadTime - b.uploadTime);
            break;
        case 'name':
            sortedImages.sort((a, b) => a.fileName.localeCompare(b.fileName));
            break;
        case 'size':
            sortedImages.sort((a, b) => b.fileSize - a.fileSize);
            break;
        case 'custom':
            // 如果有自定义排序顺序，按照自定义顺序排序
            if (customOrder.length > 0) {
                sortedImages.sort((a, b) => {
                    const indexA = customOrder.indexOf(a.id);
                    const indexB = customOrder.indexOf(b.id);

                    // 如果某个ID不在自定义顺序中，将其放在末尾
                    if (indexA === -1) return 1;
                    if (indexB === -1) return -1;

                    return indexA - indexB;
                });
            } else {
                // 如果没有自定义顺序，使用当前顺序作为初始自定义顺序
                customOrder = sortedImages.map(img => img.id);
                saveCustomOrder();
            }
            break;
        default:
            // 默认按最新上传排序
            sortedImages.sort((a, b) => b.uploadTime - a.uploadTime);
    }

    return sortedImages;
}

// 渲染图片
function renderImages(images) {
    const imageGrid = document.getElementById('imageGrid');
    imageGrid.innerHTML = '';

    // 如果是时间线视图，使用专门的渲染函数
    if (currentViewMode === 'timeline') {
        renderTimelineView();
        return;
    }

    // 网格视图和列表视图使用相同的渲染逻辑，但CSS样式不同
    images.forEach(image => {
        const card = createImageCard(image);
        imageGrid.appendChild(card);
    });

    // 初始化事件监听器
    initImageCardEvents();
}

// 切换图片选择状态
function toggleImageSelection(imageId, card, forceState) {
    const isSelected = forceState !== undefined ? forceState : !selectedImages.has(imageId);

    if (isSelected) {
        selectedImages.add(imageId);
        card.classList.add('selected');
        const checkbox = document.getElementById(`check-${imageId}`);
        if (checkbox) checkbox.checked = true;

        // 添加选中动画效果
        card.style.animation = 'pulse 0.3s ease-in-out';
        setTimeout(() => {
            card.style.animation = '';
        }, 300);
    } else {
        selectedImages.delete(imageId);
        card.classList.remove('selected');
        const checkbox = document.getElementById(`check-${imageId}`);
        if (checkbox) checkbox.checked = false;
    }

    // 更新选中计数
    updateSelectedCount();

    // 如果没有选中的图片，退出选择模式
    if (selectedImages.size === 0 && isSelectionMode) {
        toggleSelectionMode();
    }
}

// 渲染分页：首尾页常驻 + 省略号 + 跳页输入框（1 … 100 101 102 103 104 … 108 [跳转]）
function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }

    pagination.style.display = 'flex';

    const goTo = (p) => { if (p >= 1 && p <= totalPages && p !== currentPage) loadUserImages(p); };

    const makeBtn = (label, { page, disabled, active } = {}) => {
        const btn = document.createElement('button');
        btn.className = `page-btn ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
        btn.textContent = label;
        btn.disabled = !!disabled;
        if (page && !disabled && !active) btn.addEventListener('click', () => goTo(page));
        return btn;
    };

    // 上一页
    pagination.appendChild(makeBtn(tt('common.prev', '上一页'), {
        page: currentPage - 1, disabled: currentPage === 1,
    }));

    // 页码：当前页 ±2 的窗口，首尾页常驻，缺口补省略号
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);

    const addEllipsis = () => {
        const span = document.createElement('span');
        span.className = 'page-ellipsis';
        span.textContent = '…';
        pagination.appendChild(span);
    };

    if (start > 1) {
        pagination.appendChild(makeBtn('1', { page: 1 }));
        if (start > 2) addEllipsis();
    }
    for (let i = start; i <= end; i++) {
        pagination.appendChild(makeBtn(String(i), { page: i, active: i === currentPage }));
    }
    if (end < totalPages) {
        if (end < totalPages - 1) addEllipsis();
        pagination.appendChild(makeBtn(String(totalPages), { page: totalPages }));
    }

    // 下一页
    pagination.appendChild(makeBtn(tt('common.next', '下一页'), {
        page: currentPage + 1, disabled: currentPage === totalPages,
    }));

    // 跳页输入框
    const jump = document.createElement('div');
    jump.className = 'page-jump';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = String(totalPages);
    input.placeholder = `1-${totalPages}`;
    input.setAttribute('aria-label', tt('common.jump', '跳转'));
    const doJump = () => {
        const p = parseInt(input.value, 10);
        if (!p || p < 1 || p > totalPages) { input.value = ''; return; }
        input.value = '';
        goTo(p);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJump(); });
    const goBtn = document.createElement('button');
    goBtn.className = 'page-btn';
    goBtn.textContent = tt('common.jump', '跳转');
    goBtn.addEventListener('click', doJump);
    jump.appendChild(input);
    jump.appendChild(goBtn);
    pagination.appendChild(jump);
}

// 初始化搜索功能
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    searchBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        loadUserImages(1, query);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            loadUserImages(1, query);
        }
    });

    // 添加输入实时搜索（延迟执行）
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const query = searchInput.value.trim();
            if (query.length >= 2 || query.length === 0) {
                loadUserImages(1, query);
            }
        }, 500);
    });
}

// 初始化排序功能
function initSortFilter() {
    const sortSelect = document.getElementById('sortSelect');

    sortSelect.addEventListener('change', () => {
        currentSortMethod = sortSelect.value;

        // 如果选择了自定义排序，启用拖拽功能
        if (currentSortMethod === 'custom') {
            if (!isDraggable) {
                const dragToggle = document.getElementById('dragToggle');
                dragToggle.checked = true;
                toggleDragMode(true);
            }
        }

        // 重新排序当前图片并渲染
        const sortedImages = sortImages(currentImages, currentSortMethod);
        currentImages = sortedImages;
        renderImages(currentImages);
    });
}

// 初始化拖拽排序功能
function initDragSort() {
    const dragToggle = document.getElementById('dragToggle');
    if (!dragToggle) return;

    // 从本地存储恢复拖拽状态
    const savedDragMode = localStorage.getItem('dragMode');
    if (savedDragMode === 'true' || savedDragMode === '1') {
        isDraggable = true;
        dragToggle.checked = true;

        // 如果启用了拖拽，自动切换到自定义排序
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.value = 'custom';
            currentSortMethod = 'custom';
        }
    }

    // 添加拖拽模式切换事件
    dragToggle.addEventListener('change', () => {
        toggleDragMode(dragToggle.checked);
    });

    // 初始化Sortable
    initSortable();
}

// 切换拖拽模式
function toggleDragMode(enable) {
    isDraggable = !!enable;
    localStorage.setItem('dragMode', isDraggable ? 'true' : 'false');

    // 如果启用拖拽，切换到自定义排序
    if (isDraggable) {
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.value = 'custom';
            currentSortMethod = 'custom';
        }
        if (typeof showNotification === 'function') {
            const touch = window.matchMedia('(pointer: coarse)').matches;
            showNotification(
                touch ? tt('gallery.drag.on.touch','拖拽已开启：长按图片卡片即可排序') : tt('gallery.drag.on','拖拽已开启：按住卡片左上角六点拖动'),
                'success'
            );
        }
    }

    // 重新渲染图片以应用拖拽样式
    if (currentViewMode === 'timeline') {
        renderTimelineView();
    } else {
        renderImages(currentImages);
    }

    // 重新初始化Sortable
    initSortable();
}

// 初始化Sortable拖拽库
function initSortable() {
    const imageGrid = document.getElementById('imageGrid');
    if (!imageGrid) return;

    // 销毁现有的Sortable实例
    if (imageGrid.sortableInstance) {
        imageGrid.sortableInstance.destroy();
        imageGrid.sortableInstance = null;
    }

    // 时间线视图或未开启拖拽时不初始化
    if (currentViewMode === 'timeline' || !isDraggable) {
        return;
    }

    const touch = window.matchMedia('(pointer: coarse)').matches;

    // 创建新的Sortable实例：触控/桌面都可拖整卡；手柄仅作提示
    imageGrid.sortableInstance = new Sortable(imageGrid, {
        animation: 150,
        // 不限制 handle，整卡可拖（含手机长按）
        draggable: '.image-card',
        filter: 'button, a, input, .favorite-btn, .image-btn, .image-actions',
        preventOnFilter: false,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        forceFallback: true,
        fallbackTolerance: 3,
        delay: touch ? 180 : 0,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        onEnd: function () {
            updateCustomOrder();
        }
    });
}

// 更新自定义排序顺序
function updateCustomOrder() {
    const imageCards = document.querySelectorAll('.image-card, .image-card-enhanced');
    customOrder = Array.from(imageCards).map(card => card.dataset.id).filter(Boolean);
    saveCustomOrder();
}

// 渲染标签过滤器
function renderTagFilters() {
    const tagFilters = document.getElementById('tagFilters');

    // 如果没有标签，隐藏过滤器
    if (allTags.size === 0) {
        tagFilters.style.display = 'none';
        return;
    }

    tagFilters.style.display = 'flex';

    // 只显示前5个最常用的标签
    const tagArray = Array.from(allTags);
    const topTags = tagArray.slice(0, 5);

    // 创建标签过滤器HTML
    let filtersHtml = '<span class="filter-label">' + tt('gallery.tags.label','标签:') + '</span>';

    // 添加"全部"选项
    filtersHtml += `<span class="image-tag ${currentTagFilter === '' ? 'active' : ''}" data-tag=""></span>`;

    // 添加标签选项
    topTags.forEach(tag => {
        filtersHtml += `<span class="image-tag ${currentTagFilter === tag ? 'active' : ''}" data-tag="${tag}">${tag}</span>`;
    });

    tagFilters.innerHTML = filtersHtml;

    // 添加标签点击事件
    tagFilters.querySelectorAll('.image-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            const tagName = tag.dataset.tag;
            filterByTag(tagName);
        });
    });
}

// 按标签过滤
function filterByTag(tag) {
    currentTagFilter = tag;
    loadUserImages(1, '', tag);

    // 更新标签过滤器UI
    document.querySelectorAll('#tagFilters .image-tag').forEach(el => {
        if (el.dataset.tag === tag) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

// 初始化图片查看器
function initImageViewer() {
    const imageViewer = document.getElementById('imageViewer');
    const closeViewer = document.getElementById('closeViewer');
    const viewerImage = document.getElementById('viewerImage');

    // 关闭查看器
    closeViewer.addEventListener('click', () => {
        imageViewer.classList.remove('active');
        setTimeout(() => {
            imageViewer.style.display = 'none';
        }, 300);
    });

    // 点击背景关闭查看器
    imageViewer.addEventListener('click', (e) => {
        if (e.target === imageViewer) {
            closeViewer.click();
        }
    });

    // 键盘事件
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && imageViewer.classList.contains('active')) {
            closeViewer.click();
        }
    });
}

// 打开图片查看器
function openImageViewer(imageId, imageUrl) {
    const imageViewer = document.getElementById('imageViewer');
    const viewerImage = document.getElementById('viewerImage');
    const viewerInfo = document.getElementById('viewerInfo');

    // 查找图片信息
    const image = currentImages.find(img => img.id === imageId);
    if (!image) return;

    // 设置图片
    viewerImage.src = imageUrl;
    viewerImage.alt = image.fileName;

    // 设置信息
    viewerInfo.textContent = `${image.fileName} (${formatFileSize(image.fileSize)})`;

    // 显示查看器
    imageViewer.style.display = 'flex';
    setTimeout(() => {
        imageViewer.classList.add('active');
    }, 10);
}

// 初始化编辑模态框
function initEditModal() {
    const editModal = document.getElementById('editModal');
    const closeModal = document.getElementById('closeModal');
    const cancelEdit = document.getElementById('cancelEdit');
    const saveEdit = document.getElementById('saveEdit');
    const tagInput = document.getElementById('tagInput');
    const tagsInput = document.getElementById('tagsInput');
    const tagsSuggestions = document.getElementById('tagsSuggestions');

    // 关闭模态框
    function closeEditModal() {
        editModal.classList.remove('active');
        setTimeout(() => {
            editModal.style.display = 'none';
            currentEditingImageId = null;
            currentTags = [];

            // 清空标签输入
            const tagElements = tagsInput.querySelectorAll('.tag');
            tagElements.forEach(tag => tag.remove());

            // 清空其他字段
            document.getElementById('editFileName').value = '';
            document.getElementById('editImagePreview').src = '';
            document.getElementById('editUploadTime').textContent = '-';
            document.getElementById('editFileSize').textContent = '-';
            document.getElementById('editImageLink').value = '';

            // 隐藏标签建议
            tagsSuggestions.style.display = 'none';
        }, 300);
    }

    // 关闭按钮
    closeModal.addEventListener('click', closeEditModal);
    cancelEdit.addEventListener('click', closeEditModal);

    // 点击模态框外部关闭
    window.addEventListener('click', (e) => {
        if (e.target === editModal) {
            closeEditModal();
        }
    });

    // 标签输入处理
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();

            const tag = tagInput.value.trim();
            if (tag && !currentTags.includes(tag)) {
                addTag(tag);
                tagInput.value = '';
                tagsSuggestions.style.display = 'none';
            }
        }
    });

    // 标签输入时显示建议
    tagInput.addEventListener('input', () => {
        const inputValue = tagInput.value.trim().toLowerCase();

        if (inputValue.length < 1) {
            tagsSuggestions.style.display = 'none';
            return;
        }

        // 过滤标签建议
        const filteredTags = Array.from(allTags)
            .filter(tag => tag.toLowerCase().includes(inputValue) && !currentTags.includes(tag))
            .slice(0, 5); // 最多显示5个建议

        if (filteredTags.length > 0) {
            tagsSuggestions.innerHTML = '';
            filteredTags.forEach(tag => {
                const suggestion = document.createElement('div');
                suggestion.className = 'tag-suggestion';
                suggestion.textContent = tag;
                suggestion.addEventListener('click', () => {
                    addTag(tag);
                    tagInput.value = '';
                    tagsSuggestions.style.display = 'none';
                });
                tagsSuggestions.appendChild(suggestion);
            });
            tagsSuggestions.style.display = 'block';
        } else {
            tagsSuggestions.style.display = 'none';
        }
    });

    // 点击其他地方时隐藏标签建议
    document.addEventListener('click', (e) => {
        if (!tagsSuggestions.contains(e.target) && e.target !== tagInput) {
            tagsSuggestions.style.display = 'none';
        }
    });

    // 保存编辑
    saveEdit.addEventListener('click', async () => {
        if (!currentEditingImageId) return;

        const fileName = document.getElementById('editFileName').value.trim();

        if (!fileName) {
            alert(tt('gallery.name.required','文件名不能为空'));
            return;
        }

        try {
            const response = await fetch(`/api/images/${currentEditingImageId}`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeader(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileName,
                    tags: currentTags
                })
            });

            if (!response.ok) {
                throw new Error('更新图片信息失败');
            }

            // 关闭模态框
            closeEditModal();

            // 重新加载图片
            loadUserImages(currentPage);
        } catch (error) {
            console.error('更新图片信息错误:', error);
            alert(`${tt('gallery.update.fail','更新失败')}: ${error.message}`);
        }
    });

    // 初始化复制链接功能
    new ClipboardJS('#copyEditLink').on('success', function(e) {
        const button = e.trigger;
        const originalHTML = button.innerHTML;

        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;

        setTimeout(() => {
            button.innerHTML = originalHTML;
        }, 2000);
    });
}

// 打开编辑模态框
function openEditModal(imageId) {
    const editModal = document.getElementById('editModal');
    const editFileName = document.getElementById('editFileName');
    const editImagePreview = document.getElementById('editImagePreview');
    const editUploadTime = document.getElementById('editUploadTime');
    const editFileSize = document.getElementById('editFileSize');
    const editImageLink = document.getElementById('editImageLink');
    const tagsInput = document.getElementById('tagsInput');
    const tagInput = document.getElementById('tagInput');

    // 查找图片
    const image = currentImages.find(img => img.id === imageId);
    if (!image) return;

    // 设置当前编辑的图片ID
    currentEditingImageId = imageId;

    // 设置图片预览
    editImagePreview.src = image.url;
    editImagePreview.alt = image.fileName;

    // 设置文件名
    editFileName.value = image.fileName;

    // 设置上传时间
    const uploadDate = new Date(image.uploadTime).toLocaleDateString();
    const uploadTime = new Date(image.uploadTime).toLocaleTimeString();
    editUploadTime.textContent = `${uploadDate} ${uploadTime}`;

    // 设置文件大小
    editFileSize.textContent = formatFileSize(image.fileSize);

    // 设置图片链接
    editImageLink.value = `${window.location.origin}${image.url}`;

    // 清空标签
    const tagElements = tagsInput.querySelectorAll('.tag');
    tagElements.forEach(tag => tag.remove());

    // 设置标签
    currentTags = image.tags || [];
    currentTags.forEach(tag => {
        addTagElement(tag);
    });

    // 显示模态框
    editModal.style.display = 'flex';
    setTimeout(() => {
        editModal.classList.add('active');
    }, 10);
}

// 添加标签
function addTag(tag) {
    if (!tag || currentTags.includes(tag)) return;

    currentTags.push(tag);
    addTagElement(tag);
}

// 添加标签元素
function addTagElement(tag) {
    const tagsInput = document.getElementById('tagsInput');
    const tagInput = document.getElementById('tagInput');

    const tagElement = document.createElement('div');
    tagElement.className = 'tag';
    tagElement.appendChild(document.createTextNode(String(tag)));
    const removeButton = document.createElement('span');
    removeButton.className = 'tag-remove';
    removeButton.dataset.tag = String(tag);
    removeButton.textContent = '×';
    tagElement.appendChild(removeButton);

    // 添加删除标签事件
    removeButton.addEventListener('click', () => {
        removeTag(tag);
        tagElement.remove();
    });

    tagsInput.insertBefore(tagElement, tagInput);
}

// 删除标签
function removeTag(tag) {
    const index = currentTags.indexOf(tag);
    if (index !== -1) {
        currentTags.splice(index, 1);
    }
}

// 确认删除图片
function confirmDeleteImage(imageId) {
    if (confirm(tt('gallery.delete.confirm','确定要删除这张图片吗？此操作不可撤销。'))) {
        deleteImage(imageId);
    }
}

// 删除图片
async function deleteImage(imageId) {
    try {
        const response = await fetch(`/api/images/${imageId}`, {
            method: 'DELETE',
            headers: getAuthHeader()
        });

        if (!response.ok) {
            throw new Error('删除图片失败');
        }

        // 重新加载图片
        loadUserImages(currentPage);
    } catch (error) {
        console.error('删除图片错误:', error);
        alert(`${tt('gallery.delete.fail','删除失败')}: ${error.message}`);
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 初始化批量操作功能
function initBatchOperations() {
    const batchToolbar = document.getElementById('batchToolbar');
    const batchCopy = document.getElementById('batchCopy');
    const batchAddTag = document.getElementById('batchAddTag');
    const batchDelete = document.getElementById('batchDelete');
    const batchCancel = document.getElementById('batchCancel');

    // 添加长按事件以进入选择模式
    let longPressTimer;
    document.querySelectorAll('.image-card').forEach(card => {
        card.addEventListener('mousedown', () => {
            if (isSelectionMode) return; // 已经在选择模式中

            longPressTimer = setTimeout(() => {
                toggleSelectionMode();
                const imageId = card.dataset.id;
                toggleImageSelection(imageId, card, true);
            }, 500); // 500ms长按
        });

        card.addEventListener('mouseup', () => {
            clearTimeout(longPressTimer);
        });

        card.addEventListener('mouseleave', () => {
            clearTimeout(longPressTimer);
        });
    });

    // 添加批量操作按钮事件
    batchCancel.addEventListener('click', () => {
        toggleSelectionMode(false);
    });

    // 批量复制链接
    batchCopy.addEventListener('click', () => {
        if (selectedImages.size === 0) return;

        const links = [];
        selectedImages.forEach(id => {
            const image = currentImages.find(img => img.id === id);
            if (image) {
                links.push(`${window.location.origin}${image.url}`);
            }
        });

        if (links.length > 0) {
            const textarea = document.createElement('textarea');
            textarea.value = links.join('\n');
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);

            alert(`${tt('gallery.copied.n','已复制链接到剪贴板')} (${links.length})`);
        }
    });

    // 批量添加标签
    batchAddTag.addEventListener('click', () => {
        if (selectedImages.size === 0) return;

        // 创建一个简单的输入对话框
        const tag = prompt(tt('gallery.tag.prompt','请输入要添加的标签:'));
        if (!tag || tag.trim() === '') return;

        batchAddTagToImages(tag.trim());
    });

    // 批量删除
    batchDelete.addEventListener('click', () => {
        if (selectedImages.size === 0) return;

        if (confirm(tt('gallery.delete.batch','确定要删除选中的图片吗？此操作不可撤销。') + ` (${selectedImages.size})`)) {
            batchDeleteImages();
        }
    });
}

// 切换选择模式
function toggleSelectionMode(forceState) {
    isSelectionMode = forceState !== undefined ? forceState : !isSelectionMode;
    const batchToolbar = document.getElementById('batchToolbar');

    if (isSelectionMode) {
        // 进入选择模式
        batchToolbar.classList.add('active');
        document.body.classList.add('selection-mode');

        // 清空已选择的图片
        selectedImages.clear();
        updateSelectedCount();

        // 重新渲染图片以显示复选框
        renderImages(currentImages);
    } else {
        // 退出选择模式
        batchToolbar.classList.remove('active');
        document.body.classList.remove('selection-mode');

        // 清空已选择的图片
        selectedImages.clear();

        // 重新渲染图片以隐藏复选框
        renderImages(currentImages);
    }
}

// 更新选中计数
function updateSelectedCount() {
    const selectedCount = document.getElementById('selectedCount');
    selectedCount.textContent = selectedImages.size;
}

// 批量添加标签到图片
async function batchAddTagToImages(tag) {
    if (selectedImages.size === 0 || !tag) return;
    const notify = window.showNotification || alert;
    const ids = [...selectedImages];
    notify(`正在为 ${ids.length} 张图片添加标签…`, 'info');

    let updated = 0;
    let failed = 0;
    // 批量端点每次最多 40 张，分块提交
    for (let i = 0; i < ids.length; i += 40) {
        const chunk = ids.slice(i, i + 40);
        try {
            const response = await fetch('/api/images/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader()
                },
                body: JSON.stringify({ action: 'tag', ids: chunk, tags: [tag] })
            });
            if (response.ok) {
                const data = await response.json();
                updated += data.updated || 0;
            } else {
                failed += chunk.length;
            }
        } catch (error) {
            console.error('批量添加标签失败:', error);
            failed += chunk.length;
        }
    }

    notify(
        failed === 0 ? `成功为 ${updated} 张图片添加标签` : `成功: ${updated} 张, 失败: ${failed} 张`,
        failed ? 'error' : 'success'
    );

    // 重新加载图片列表
    loadUserImages(currentPage);

    // 退出选择模式
    toggleSelectionMode(false);
}

// 批量删除图片
async function batchDeleteImages() {
    if (selectedImages.size === 0) return;
    const notify = window.showNotification || alert;
    const ids = [...selectedImages];
    notify(`正在删除 ${ids.length} 张图片…`, 'info');

    let deleted = 0;
    let failed = 0;
    // 批量端点每次最多 40 张，分块提交
    for (let i = 0; i < ids.length; i += 40) {
        const chunk = ids.slice(i, i + 40);
        try {
            const response = await fetch('/api/images/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader()
                },
                body: JSON.stringify({ action: 'delete', ids: chunk })
            });
            if (response.ok) {
                const data = await response.json();
                deleted += data.deleted || 0;
            } else {
                failed += chunk.length;
            }
        } catch (error) {
            console.error('批量删除失败:', error);
            failed += chunk.length;
        }
    }

    notify(
        failed === 0 ? `成功删除 ${deleted} 张图片` : `成功: ${deleted} 张, 失败: ${failed} 张`,
        failed ? 'error' : 'success'
    );

    // 重新加载图片列表
    loadUserImages(currentPage);

    // 退出选择模式
    toggleSelectionMode(false);
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否在仪表盘页面
    if (window.location.pathname === '/dashboard.html') {
        // 初始化仪表盘
        initDashboard();

        // 与菜单系统集成
        initMenuIntegration();
    }

    // 监听主题变化事件
    window.addEventListener('themeChanged', (e) => {
        // 更新图表颜色
        updateChartsTheme();
    });
});

// 初始化与菜单系统的集成
function initMenuIntegration() {
    // 上传按钮点击事件
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadMenuBtn = document.getElementById('uploadMenuBtn');

    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }

    if (uploadMenuBtn) {
        uploadMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/';
        });
    }

    // 退出登录菜单项点击事件
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    if (logoutMenuItem) {
        logoutMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }

    // 侧栏「切换配色」由 palettes.js 负责，不再绑定 light/dark

    // 移动端抽屉由 menu-system + DuckShell 统一处理

    // 初始化图表面板控制
    initChartsPanelControl();

    // 更新菜单中的统计数据
    updateMenuStats();
}

/**
 * 切换主题
 */
function toggleTheme() {
    // 使用全局主题管理器
    if (window.themeManager) {
        window.themeManager.toggleTheme();
    }
}

/**
 * 数据统计面板开合（相对主内容区居中 + scrim）
 */
function openChartsPanel() {
    const chartsPanel = document.getElementById('chartsPanel');
    const scrim = document.getElementById('chartsPanelScrim');
    if (!chartsPanel) return;
    chartsPanel.classList.add('active');
    if (scrim) scrim.classList.add('active');
    if (window.DuckShell) window.DuckShell.lockScroll();
    else document.body.style.overflow = 'hidden';
    // 首次打开才加载 Chart.js 并建图
    ensureCharts();
}
window.openChartsPanel = openChartsPanel;

function closeChartsPanel() {
    const chartsPanel = document.getElementById('chartsPanel');
    const scrim = document.getElementById('chartsPanelScrim');
    if (chartsPanel) chartsPanel.classList.remove('active');
    if (scrim) scrim.classList.remove('active');
    if (window.DuckShell) window.DuckShell.unlockScroll();
    else document.body.style.overflow = '';
}
window.closeChartsPanel = closeChartsPanel;

/**
 * 初始化图表面板控制
 */
function initChartsPanelControl() {
    const statsMenuItem = document.getElementById('statsMenuItem');
    const statsToggleBtn = document.getElementById('statsToggleBtn');
    const chartsPanel = document.getElementById('chartsPanel');
    const closeChartsBtn = document.getElementById('closeChartsBtn');
    const scrim = document.getElementById('chartsPanelScrim');

    if (statsMenuItem && chartsPanel) {
        statsMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            openChartsPanel();
        });
    }

    if (statsToggleBtn && chartsPanel) {
        statsToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openChartsPanel();
        });
    }

    if (closeChartsBtn) {
        closeChartsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeChartsPanel();
        });
    }

    if (scrim) {
        scrim.addEventListener('click', () => closeChartsPanel());
    }

    // 点面板外关闭（保留按钮点击）
    document.addEventListener('click', (e) => {
        if (!chartsPanel || !chartsPanel.classList.contains('active')) return;
        if (chartsPanel.contains(e.target)) return;
        if (statsMenuItem && (e.target === statsMenuItem || statsMenuItem.contains(e.target))) return;
        if (statsToggleBtn && (e.target === statsToggleBtn || statsToggleBtn.contains(e.target))) return;
        closeChartsPanel();
    });
}

/**
 * 更新菜单中的统计数据
 * 注：真实统计数据由 loadUserImages() -> updateStatistics(data) 从 API 写入，
 * 此处不再使用模拟数据覆盖，也不重复初始化图表（图表由 initCharts() L723 创建）。
 */
function updateMenuStats() {
    // 真实统计已在 loadUserImages 中处理，无需额外操作
}

