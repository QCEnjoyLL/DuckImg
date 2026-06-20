/**
 * 收藏图片页面功能
 * 处理收藏图片的显示、搜索、排序和管理
 */

document.addEventListener('DOMContentLoaded', () => {
    initFavoritesPage();
});

// 全局变量
let favoriteImages = [];
let filteredImages = [];
let currentPage = 1;
let itemsPerPage = 12;
let currentSort = 'favorite-date';
let currentView = 'grid';
let searchQuery = '';
let selectedImages = new Set();

/**
 * 初始化收藏图片页面
 */
function initFavoritesPage() {
    // 加载收藏图片数据
    loadFavoriteImages();
    
    // 初始化事件监听器
    initEventListeners();
    
    // 初始化视图状态
    initViewState();
}

/**
 * 加载收藏图片数据（真实数据：localStorage 收藏ID + /api/images 用户图片）
 */
async function loadFavoriteImages() {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        if (!token) {
            // 未登录：收藏依赖账户图片，跳登录
            window.location.href = '/login.html';
            return;
        }

        // 收藏的图片 ID（由 dashboard.js 写入 localStorage 'favoriteImages'）
        let favIds = [];
        try {
            favIds = JSON.parse(localStorage.getItem('favoriteImages') || '[]');
        } catch { favIds = []; }
        const favSet = new Set(favIds);

        if (favSet.size === 0) {
            favoriteImages = [];
            filteredImages = [];
            updateStats();
            renderImages();
            hideLoading();
            return;
        }

        // 拉取用户全部图片并过滤出已收藏的
        const response = await fetch('/api/images?page=1&limit=1000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('获取图片失败');
        const data = await response.json();
        const files = data.files || [];

        favoriteImages = files
            .filter(f => favSet.has(f.id))
            .map(f => ({
                id: f.id,
                name: f.fileName || f.id,
                url: f.url,
                thumbnailUrl: f.url,
                size: Math.round((f.fileSize || 0) / 1024), // 卡片按 KB*1024 还原
                uploadDate: new Date(f.uploadTime || Date.now()).toISOString(),
                favoriteDate: new Date(f.uploadTime || Date.now()).toISOString(),
                tags: f.tags || [],
                views: 0
            }));

        filteredImages = [...favoriteImages];

        updateStats();
        applySorting();
        renderImages();
        hideLoading();
    } catch (error) {
        console.error('加载收藏图片失败:', error);
        showError('加载收藏图片失败，请刷新页面重试');
        hideLoading();
    }
}

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 搜索功能
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }
    
    // 排序下拉菜单
    const sortDropdown = document.getElementById('sortDropdown');
    const sortBtn = document.getElementById('sortBtn');
    if (sortDropdown && sortBtn) {
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sortDropdown.classList.toggle('active');
        });
        
        // 排序选项
        const sortOptions = sortDropdown.querySelectorAll('.filter-option');
        sortOptions.forEach(option => {
            option.addEventListener('click', () => {
                handleSortChange(option.dataset.sort, option.textContent.trim());
                sortDropdown.classList.remove('active');
            });
        });
    }
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', () => {
        if (sortDropdown) {
            sortDropdown.classList.remove('active');
        }
    });
    
    // 视图切换
    const gridViewBtn = document.getElementById('gridViewBtn');
    const listViewBtn = document.getElementById('listViewBtn');
    
    if (gridViewBtn) {
        gridViewBtn.addEventListener('click', () => switchView('grid'));
    }
    if (listViewBtn) {
        listViewBtn.addEventListener('click', () => switchView('list'));
    }
    
    // 批量操作
    const batchCopy = document.getElementById('batchCopy');
    const batchUnfavorite = document.getElementById('batchUnfavorite');
    const batchCancel = document.getElementById('batchCancel');
    
    if (batchCopy) {
        batchCopy.addEventListener('click', handleBatchCopy);
    }
    if (batchUnfavorite) {
        batchUnfavorite.addEventListener('click', handleBatchUnfavorite);
    }
    if (batchCancel) {
        batchCancel.addEventListener('click', clearSelection);
    }
}

/**
 * 初始化视图状态
 */
function initViewState() {
    // 从本地存储加载视图偏好
    const savedView = localStorage.getItem('favoritesView') || 'grid';
    switchView(savedView);
}

/**
 * 处理搜索
 */
function handleSearch(e) {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilters();
}

/**
 * 处理排序改变
 */
function handleSortChange(sortType, sortLabel) {
    currentSort = sortType;
    
    // 更新按钮文本
    const sortBtn = document.getElementById('sortBtn');
    if (sortBtn) {
        const textSpan = sortBtn.querySelector('span');
        if (textSpan) {
            textSpan.textContent = sortLabel;
        }
    }
    
    // 更新活动状态
    const sortOptions = document.querySelectorAll('.filter-option');
    sortOptions.forEach(option => {
        option.classList.toggle('active', option.dataset.sort === sortType);
    });
    
    applySorting();
    renderImages();
}

/**
 * 应用过滤器
 */
function applyFilters() {
    filteredImages = favoriteImages.filter(image => {
        // 搜索过滤
        if (searchQuery) {
            const searchInName = image.name.toLowerCase().includes(searchQuery);
            const searchInTags = image.tags.some(tag => tag.toLowerCase().includes(searchQuery));
            if (!searchInName && !searchInTags) {
                return false;
            }
        }
        
        return true;
    });
    
    applySorting();
    renderImages();
    updateStats();
}

/**
 * 应用排序
 */
function applySorting() {
    filteredImages.sort((a, b) => {
        switch (currentSort) {
            case 'favorite-date':
                return new Date(b.favoriteDate) - new Date(a.favoriteDate);
            case 'upload-date':
                return new Date(b.uploadDate) - new Date(a.uploadDate);
            case 'name':
                return a.name.localeCompare(b.name);
            case 'size':
                return b.size - a.size;
            default:
                return new Date(b.favoriteDate) - new Date(a.favoriteDate);
        }
    });
}

/**
 * 渲染图片
 */
function renderImages() {
    const grid = document.getElementById('favoritesGrid');
    const emptyState = document.getElementById('emptyState');
    
    if (!grid || !emptyState) return;
    
    // 计算分页
    const totalItems = filteredImages.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const pageItems = filteredImages.slice(startIndex, endIndex);
    
    if (totalItems === 0) {
        // 显示空状态
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        hidePagination();
        return;
    }
    
    // 隐藏空状态
    grid.style.display = 'grid';
    emptyState.style.display = 'none';
    
    // 渲染图片卡片
    grid.innerHTML = pageItems.map(image => createImageCard(image)).join('');
    
    // 绑定卡片事件
    bindCardEvents();
    
    // 渲染分页
    renderPagination(totalPages);
}

/**
 * 创建图片卡片
 */
function createImageCard(image) {
    const favoriteDate = formatDate(image.favoriteDate);
    const uploadDate = formatDate(image.uploadDate);
    const fileSize = formatFileSize(image.size * 1024); // 转换为字节
    const isSelected = selectedImages.has(image.id);
    
    return `
        <div class="favorite-card ${isSelected ? 'selected' : ''}" data-id="${image.id}">
            <div class="image-checkbox">
                <input type="checkbox" class="checkbox-input" ${isSelected ? 'checked' : ''}>
                <label class="checkbox-label"></label>
            </div>
            <div class="favorite-badge">
                <i class="ri-star-fill"></i>
                <span>收藏</span>
            </div>
            <div class="favorite-image">
                <img src="${image.thumbnailUrl}" alt="${image.name}" loading="lazy">
            </div>
            <div class="favorite-info">
                <div class="favorite-name" title="${image.name}">${image.name}</div>
                <div class="favorite-meta">
                    <div class="favorite-date">
                        <i class="ri-star-line"></i>
                        <span>${favoriteDate}</span>
                    </div>
                    <div class="favorite-size">
                        <i class="ri-file-size-line"></i>
                        <span>${fileSize}</span>
                    </div>
                </div>
                ${image.tags.length > 0 ? `
                <div class="favorite-tags">
                    ${image.tags.map(tag => `<span class="favorite-tag">${tag}</span>`).join('')}
                </div>
                ` : ''}
                <div class="favorite-actions">
                    <button class="favorite-btn btn-copy" data-url="${image.url}" title="复制链接">
                        <i class="ri-file-copy-line"></i>
                        <span>复制</span>
                    </button>
                    <button class="favorite-btn btn-view" data-url="${image.url}" title="查看大图">
                        <i class="ri-eye-line"></i>
                        <span>查看</span>
                    </button>
                    <button class="favorite-btn btn-unfavorite" data-id="${image.id}" title="取消收藏">
                        <i class="ri-star-line"></i>
                        <span>取消</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * 绑定卡片事件
 */
function bindCardEvents() {
    // 选择框事件
    const checkboxes = document.querySelectorAll('.favorite-card .checkbox-input');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleImageSelection);
    });
    
    // 复制链接按钮
    const copyBtns = document.querySelectorAll('.btn-copy');
    copyBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(btn.dataset.url);
        });
    });
    
    // 查看大图按钮
    const viewBtns = document.querySelectorAll('.btn-view');
    viewBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            viewImage(btn.dataset.url);
        });
    });
    
    // 取消收藏按钮
    const unfavoriteBtns = document.querySelectorAll('.btn-unfavorite');
    unfavoriteBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            unfavoriteImage(btn.dataset.id);
        });
    });
    
    // 标签点击事件
    const tags = document.querySelectorAll('.favorite-tag');
    tags.forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.stopPropagation();
            searchByTag(tag.textContent);
        });
    });
}

/**
 * 处理图片选择
 */
function handleImageSelection(e) {
    const card = e.target.closest('.favorite-card');
    const imageId = card.dataset.id;
    
    if (e.target.checked) {
        selectedImages.add(imageId);
        card.classList.add('selected');
    } else {
        selectedImages.delete(imageId);
        card.classList.remove('selected');
    }
    
    updateBatchToolbar();
}

/**
 * 更新批量操作工具栏
 */
function updateBatchToolbar() {
    const toolbar = document.getElementById('batchToolbar');
    const selectedCount = document.getElementById('selectedCount');
    
    if (!toolbar || !selectedCount) return;
    
    selectedCount.textContent = selectedImages.size;
    
    if (selectedImages.size > 0) {
        toolbar.classList.add('active');
    } else {
        toolbar.classList.remove('active');
    }
}

/**
 * 清除选择
 */
function clearSelection() {
    selectedImages.clear();
    
    // 更新UI
    const checkboxes = document.querySelectorAll('.favorite-card .checkbox-input');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    const cards = document.querySelectorAll('.favorite-card');
    cards.forEach(card => {
        card.classList.remove('selected');
    });
    
    updateBatchToolbar();
}

/**
 * 批量复制链接
 */
function handleBatchCopy() {
    const selectedImageData = favoriteImages.filter(img => selectedImages.has(img.id));
    const links = selectedImageData.map(img => img.url).join('\n');
    
    copyToClipboard(links);
    showNotification(`已复制 ${selectedImages.size} 个图片链接`, 'success');
}

/**
 * 批量取消收藏
 */
function handleBatchUnfavorite() {
    if (confirm(`确定要取消收藏 ${selectedImages.size} 张图片吗？`)) {
        // 模拟API调用
        selectedImages.forEach(imageId => {
            unfavoriteImageById(imageId);
        });
        
        showNotification(`已取消收藏 ${selectedImages.size} 张图片`, 'success');
        clearSelection();
    }
}

/**
 * 取消收藏图片
 */
function unfavoriteImage(imageId) {
    if (confirm('确定要取消收藏这张图片吗？')) {
        unfavoriteImageById(imageId);
        showNotification('已取消收藏', 'success');
    }
}

/**
 * 根据ID取消收藏图片（同步更新 localStorage，与 dashboard 一致）
 */
function unfavoriteImageById(imageId) {
    // 从内存数组移除
    favoriteImages = favoriteImages.filter(img => img.id !== imageId);

    // 同步更新 localStorage 'favoriteImages'
    try {
        const favIds = JSON.parse(localStorage.getItem('favoriteImages') || '[]');
        const next = favIds.filter(id => id !== imageId);
        localStorage.setItem('favoriteImages', JSON.stringify(next));
    } catch (e) { /* ignore */ }

    // 重新应用过滤器
    applyFilters();

    // 从选择中移除
    selectedImages.delete(imageId);
    updateBatchToolbar();

    // 更新统计
    updateStats();
}

/**
 * 按标签搜索
 */
function searchByTag(tagName) {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = tagName;
        searchQuery = tagName.toLowerCase();
        applyFilters();
    }
}

/**
 * 切换视图模式
 */
function switchView(viewType) {
    currentView = viewType;
    
    const grid = document.getElementById('favoritesGrid');
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    
    if (!grid || !gridBtn || !listBtn) return;
    
    // 更新按钮状态
    gridBtn.classList.toggle('active', viewType === 'grid');
    listBtn.classList.toggle('active', viewType === 'list');
    
    // 更新网格样式
    grid.classList.toggle('list-view', viewType === 'list');
    
    // 保存偏好设置
    localStorage.setItem('favoritesView', viewType);
}

/**
 * 更新统计信息
 */
function updateStats() {
    const totalFavorites = document.getElementById('totalFavorites');
    const totalSize = document.getElementById('totalSize');
    
    if (totalFavorites) {
        totalFavorites.textContent = favoriteImages.length;
    }
    
    if (totalSize) {
        const totalSizeBytes = favoriteImages.reduce((sum, img) => sum + img.size * 1024, 0);
        totalSize.textContent = formatFileSize(totalSizeBytes);
    }
}

/**
 * 渲染分页
 */
function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    if (!pagination || totalPages <= 1) {
        hidePagination();
        return;
    }
    
    pagination.style.display = 'flex';
    
    let paginationHTML = '';
    
    // 上一页按钮
    paginationHTML += `
        <button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" data-page="${currentPage - 1}">
            <i class="ri-arrow-left-s-line"></i>
        </button>
    `;
    
    // 页码按钮
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        paginationHTML += `<button class="page-btn" data-page="1">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span class="page-ellipsis">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">
                ${i}
            </button>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span class="page-ellipsis">...</span>`;
        }
        paginationHTML += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    // 下一页按钮
    paginationHTML += `
        <button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" data-page="${currentPage + 1}">
            <i class="ri-arrow-right-s-line"></i>
        </button>
    `;
    
    pagination.innerHTML = paginationHTML;
    
    // 绑定分页事件
    const pageButtons = pagination.querySelectorAll('.page-btn:not(.disabled)');
    pageButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (page && page !== currentPage) {
                currentPage = page;
                renderImages();
                scrollToTop();
            }
        });
    });
}

/**
 * 隐藏分页
 */
function hidePagination() {
    const pagination = document.getElementById('pagination');
    if (pagination) {
        pagination.style.display = 'none';
    }
}

/**
 * 复制到剪贴板
 */
function copyToClipboard(text) {
    // 使用common.js中的函数
    if (window.commonUtils && window.commonUtils.copyToClipboard) {
        window.commonUtils.copyToClipboard(text);
    } else {
        // 降级方案
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                showNotification('已复制到剪贴板', 'success');
            }).catch(err => {
                console.error('复制失败:', err);
                fallbackCopyToClipboard(text);
            });
        } else {
            fallbackCopyToClipboard(text);
        }
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
        document.execCommand('copy');
        showNotification('已复制到剪贴板', 'success');
    } catch (err) {
        console.error('复制失败:', err);
        showNotification('复制失败，请手动复制', 'error');
    }
    
    document.body.removeChild(textArea);
}

/**
 * 查看图片
 */
function viewImage(imageUrl) {
    // 可以实现图片预览模态框
    window.open(imageUrl, '_blank');
}

/**
 * 显示通知
 */
function showNotification(message, type = 'info') {
    // 使用common.js中的函数
    if (window.showNotification) {
        window.showNotification(message, type);
    } else {
        // 降级方案
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

/**
 * 显示加载状态
 */
function showLoading() {
    const grid = document.getElementById('favoritesGrid');
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                <div class="loading-spinner"></div>
                <p style="margin-top: 1rem; color: var(--text-light);">正在加载收藏图片...</p>
            </div>
        `;
    }
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
    // 加载完成后会通过renderImages重新渲染内容，无需特殊处理
}

/**
 * 显示错误信息
 */
function showError(message) {
    const grid = document.getElementById('favoritesGrid');
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                <i class="ri-error-warning-line" style="font-size: 3rem; color: var(--error-color); margin-bottom: 1rem;"></i>
                <p style="color: var(--error-color); font-weight: 600;">${message}</p>
                <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">重新加载</button>
            </div>
        `;
    }
}

/**
 * 滚动到顶部
 */
function scrollToTop() {
    // 使用common.js中的函数
    if (window.commonUtils && window.commonUtils.scrollToTop) {
        window.commonUtils.scrollToTop();
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

/**
 * 格式化日期
 */
function formatDate(dateString) {
    // 使用common.js中的函数
    if (window.commonUtils && window.commonUtils.formatDate) {
        return window.commonUtils.formatDate(dateString);
    } else {
        // 降级方案
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
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    // 使用common.js中的函数
    if (window.commonUtils && window.commonUtils.formatFileSize) {
        return window.commonUtils.formatFileSize(bytes);
    } else {
        // 降级方案
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

/**
 * 防抖函数
 */
function debounce(func, wait) {
    // 使用common.js中的函数
    if (window.commonUtils && window.commonUtils.debounce) {
        return window.commonUtils.debounce(func, wait);
    } else {
        // 降级方案
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
} 