/**
 * 标签管理页面功能
 * 处理标签的创建、编辑、删除和管理
 */

document.addEventListener('DOMContentLoaded', () => {
    initTagsPage();
});

// 全局变量
let tags = [];
let filteredTags = [];
let currentSort = 'name';
let currentFilter = 'all';
let searchQuery = '';
let selectedTags = new Set();
let editingTagId = null;

// 预定义颜色
const TAG_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#71717a', '#374151', '#1f2937'
];

/**
 * 初始化标签管理页面
 */
function initTagsPage() {
    // 加载标签数据
    loadTags();
    
    // 初始化事件监听器
    initEventListeners();
    
    // 初始化颜色选择器
    initColorPicker();
}

/**
 * 加载标签数据（真实数据：聚合用户图片上的 tags）
 */
async function loadTags() {
    try {
        showLoading();

        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch('/api/images?page=1&limit=1000', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('获取图片失败');
        const data = await response.json();
        const files = data.files || [];

        // 聚合标签：name -> { count, images[] }
        const map = new Map();
        files.forEach(f => {
            (f.tags || []).forEach(tagName => {
                if (!map.has(tagName)) map.set(tagName, { count: 0, images: [] });
                const entry = map.get(tagName);
                entry.count++;
                if (entry.images.length < 5) {
                    entry.images.push({ id: f.id, thumbnailUrl: f.url, name: f.fileName || f.id });
                }
            });
        });

        let idx = 0;
        tags = Array.from(map.entries()).map(([name, entry]) => ({
            id: `tag_${encodeURIComponent(name)}`,
            name,
            description: '',
            color: TAG_COLORS[(idx++) % TAG_COLORS.length],
            imageCount: entry.count,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            images: entry.images
        }));

        filteredTags = [...tags];

        updateStats();
        applyFiltersAndSort();
        renderTags();

        // 标签为只读聚合视图：隐藏无数据支撑的“创建/合并”功能
        hideUnsupportedTagControls();

        hideLoading();
    } catch (error) {
        console.error('加载标签失败:', error);
        showError('加载标签失败，请刷新页面重试');
        hideLoading();
    }
}

/**
 * 隐藏没有后端支撑的标签管理控件（标签的增删改在“我的图片”里编辑单张图片完成）
 */
function hideUnsupportedTagControls() {
    ['createTagBtn', 'emptyCreateTagBtn', 'batchToolbar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    // 顶部加一句说明（只加一次）
    if (!document.getElementById('tagsHint')) {
        const grid = document.getElementById('tagsGrid');
        if (grid && grid.parentNode) {
            const hint = document.createElement('p');
            hint.id = 'tagsHint';
            hint.style.cssText = 'color:var(--text-light);font-size:0.9rem;margin:0 0 1rem;';
            hint.innerHTML = '<i class="ri-information-line"></i> 标签来自你为图片添加的标签。点击标签卡片可在「我的图片」中筛选；标签的添加/修改请在「我的图片」编辑单张图片时进行。';
            grid.parentNode.insertBefore(hint, grid);
        }
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
    
    // 创建标签按钮
    const createTagBtn = document.getElementById('createTagBtn');
    const emptyCreateTagBtn = document.getElementById('emptyCreateTagBtn');
    
    if (createTagBtn) {
        createTagBtn.addEventListener('click', () => openTagModal());
    }
    if (emptyCreateTagBtn) {
        emptyCreateTagBtn.addEventListener('click', () => openTagModal());
    }
    
    // 排序下拉菜单
    initDropdown('sortDropdown', 'sortBtn', handleSortChange);
    
    // 过滤下拉菜单
    initDropdown('filterDropdown', 'filterBtn', handleFilterChange);
    
    // 标签模态框
    initTagModal();
    
    // 批量操作
    initBatchOperations();
}

/**
 * 初始化下拉菜单
 */
function initDropdown(dropdownId, buttonId, changeHandler) {
    const dropdown = document.getElementById(dropdownId);
    const button = document.getElementById(buttonId);
    
    if (dropdown && button) {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            // 关闭其他下拉菜单
            document.querySelectorAll('.filter-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('active');
            });
            dropdown.classList.toggle('active');
        });
        
        // 选项点击事件
        const options = dropdown.querySelectorAll('.filter-option');
        options.forEach(option => {
            option.addEventListener('click', () => {
                const value = option.dataset.sort || option.dataset.filter;
                const text = option.querySelector('span').textContent.trim();
                changeHandler(value, text, option);
                dropdown.classList.remove('active');
            });
        });
    }
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', () => {
        if (dropdown) {
            dropdown.classList.remove('active');
        }
    });
}

/**
 * 初始化标签模态框
 */
function initTagModal() {
    const modal = document.getElementById('tagModal');
    const closeBtn = document.getElementById('tagModalClose');
    const cancelBtn = document.getElementById('tagModalCancel');
    const form = document.getElementById('tagForm');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeTagModal);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeTagModal);
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeTagModal();
            }
        });
    }
    
    if (form) {
        form.addEventListener('submit', handleTagFormSubmit);
    }
}

/**
 * 初始化批量操作
 */
function initBatchOperations() {
    const batchMerge = document.getElementById('batchMerge');
    const batchDelete = document.getElementById('batchDelete');
    const batchCancel = document.getElementById('batchCancel');
    
    if (batchMerge) {
        batchMerge.addEventListener('click', handleBatchMerge);
    }
    if (batchDelete) {
        batchDelete.addEventListener('click', handleBatchDelete);
    }
    if (batchCancel) {
        batchCancel.addEventListener('click', clearSelection);
    }
}

/**
 * 初始化颜色选择器
 */
function initColorPicker() {
    const colorPicker = document.getElementById('colorPicker');
    if (!colorPicker) return;
    
    colorPicker.innerHTML = TAG_COLORS.map(color => `
        <div class="color-option" style="background-color: ${color}" data-color="${color}"></div>
    `).join('');
    
    // 绑定颜色选择事件
    colorPicker.addEventListener('click', (e) => {
        if (e.target.classList.contains('color-option')) {
            // 移除其他选中状态
            colorPicker.querySelectorAll('.color-option').forEach(option => {
                option.classList.remove('selected');
            });
            
            // 添加选中状态
            e.target.classList.add('selected');
        }
    });
}

/**
 * 处理搜索
 */
function handleSearch(e) {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFiltersAndSort();
}

/**
 * 处理排序改变
 */
function handleSortChange(sortType, sortLabel, option) {
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
    const sortOptions = document.querySelectorAll('#sortDropdown .filter-option');
    sortOptions.forEach(opt => {
        opt.classList.toggle('active', opt === option);
    });
    
    applyFiltersAndSort();
}

/**
 * 处理过滤改变
 */
function handleFilterChange(filterType, filterLabel, option) {
    currentFilter = filterType;
    
    // 更新按钮文本
    const filterBtn = document.getElementById('filterBtn');
    if (filterBtn) {
        const textSpan = filterBtn.querySelector('span');
        if (textSpan) {
            textSpan.textContent = filterLabel;
        }
    }
    
    // 更新活动状态
    const filterOptions = document.querySelectorAll('#filterDropdown .filter-option');
    filterOptions.forEach(opt => {
        opt.classList.toggle('active', opt === option);
    });
    
    applyFiltersAndSort();
}

/**
 * 应用过滤和排序
 */
function applyFiltersAndSort() {
    // 应用搜索过滤
    filteredTags = tags.filter(tag => {
        // 搜索过滤
        if (searchQuery) {
            const searchInName = tag.name.toLowerCase().includes(searchQuery);
            const searchInDesc = tag.description.toLowerCase().includes(searchQuery);
            if (!searchInName && !searchInDesc) {
                return false;
            }
        }
        
        // 状态过滤
        if (currentFilter === 'used' && tag.imageCount === 0) {
            return false;
        }
        if (currentFilter === 'unused' && tag.imageCount > 0) {
            return false;
        }
        
        return true;
    });
    
    // 应用排序
    applySorting();
    
    // 渲染标签
    renderTags();
    
    // 更新统计
    updateStats();
}

/**
 * 应用排序
 */
function applySorting() {
    filteredTags.sort((a, b) => {
        switch (currentSort) {
            case 'name':
                return a.name.localeCompare(b.name, 'zh-CN');
            case 'count':
                return b.imageCount - a.imageCount;
            case 'date':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'color':
                return a.color.localeCompare(b.color);
            default:
                return a.name.localeCompare(b.name, 'zh-CN');
        }
    });
}

/**
 * 渲染标签
 */
function renderTags() {
    const grid = document.getElementById('tagsGrid');
    const emptyState = document.getElementById('emptyState');
    
    if (!grid || !emptyState) return;
    
    if (filteredTags.length === 0) {
        // 显示空状态
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    // 隐藏空状态
    grid.style.display = 'grid';
    emptyState.style.display = 'none';
    
    // 渲染标签卡片
    grid.innerHTML = filteredTags.map(tag => createTagCard(tag)).join('');
    
    // 绑定卡片事件
    bindTagCardEvents();
}

/**
 * 创建标签卡片
 */
function createTagCard(tag) {
    const isSelected = selectedTags.has(tag.id);
    const createdDate = formatDate(tag.createdAt);
    const esc = (typeof escapeHtml === 'function')
        ? escapeHtml
        : (window.commonUtils && window.commonUtils.escapeHtml) || ((s) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
    const safeName = esc(tag.name);
    const safeId = esc(tag.id);
    // 颜色仅允许 #hex，避免 style 注入
    const rawColor = String(tag.color || '#6366f1');
    const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : '#6366f1';

    return `
        <div class="tag-card" data-id="${safeId}" data-name="${safeName}" style="cursor:pointer;" title="在「我的图片」中查看该标签">
            <div class="tag-header">
                <h3 class="tag-name">
                    <div class="tag-color" style="background-color: ${safeColor}"></div>
                    <span>${safeName}</span>
                </h3>
            </div>

            <div class="tag-stats">
                <div class="tag-stat">
                    <i class="ri-image-line"></i>
                    <span>${Number(tag.imageCount) || 0} 张图片</span>
                </div>
            </div>

            <div class="tag-images-preview">
                ${(tag.images || []).slice(0, 4).map(img => {
                    const n = esc(img.name);
                    const u = esc(img.thumbnailUrl);
                    return `<img src="${u}" alt="${n}" class="tag-image-thumb" title="${n}">`;
                }).join('')}
                ${tag.imageCount > 4 ? `
                    <div class="tag-more-count">+${Number(tag.imageCount) - 4}</div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * 绑定标签卡片事件（点击卡片 -> 在「我的图片」按该标签筛选）
 */
function bindTagCardEvents() {
    const tagCards = document.querySelectorAll('.tag-card');
    tagCards.forEach(card => {
        card.addEventListener('click', (e) => {
            // 缩略图点击单独处理（查看大图）
            if (e.target.closest('.tag-image-thumb')) return;
            const name = card.dataset.name;
            window.location.href = `/dashboard.html?tag=${encodeURIComponent(name)}`;
        });
    });

    // 图片缩略图点击：查看真实大图
    const imageThumbs = document.querySelectorAll('.tag-image-thumb');
    imageThumbs.forEach(thumb => {
        thumb.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(thumb.src, '_blank');
        });
    });
}

/**
 * 处理标签选择
 */
function handleTagSelection(tagId, card) {
    if (selectedTags.has(tagId)) {
        selectedTags.delete(tagId);
        card.classList.remove('selected');
    } else {
        selectedTags.add(tagId);
        card.classList.add('selected');
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
    
    selectedCount.textContent = selectedTags.size;
    
    if (selectedTags.size > 0) {
        toolbar.classList.add('active');
    } else {
        toolbar.classList.remove('active');
    }
}

/**
 * 清除选择
 */
function clearSelection() {
    selectedTags.clear();
    
    // 更新UI
    const tagCards = document.querySelectorAll('.tag-card');
    tagCards.forEach(card => {
        card.classList.remove('selected');
    });
    
    updateBatchToolbar();
}

/**
 * 打开标签模态框
 */
function openTagModal(tagId = null) {
    const modal = document.getElementById('tagModal');
    const title = document.getElementById('tagModalTitle');
    const nameInput = document.getElementById('tagName');
    const descInput = document.getElementById('tagDescription');
    const colorPicker = document.getElementById('colorPicker');
    const submitBtn = document.getElementById('tagModalSubmit');
    
    if (!modal) return;
    
    editingTagId = tagId;
    
    if (tagId) {
        // 编辑模式
        const tag = tags.find(t => t.id === tagId);
        if (!tag) return;
        
        title.textContent = '编辑标签';
        nameInput.value = tag.name;
        descInput.value = tag.description;
        submitBtn.innerHTML = '<i class="ri-save-line"></i>更新标签';
        
        // 选中对应颜色
        const colorOptions = colorPicker.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.classList.toggle('selected', option.dataset.color === tag.color);
        });
    } else {
        // 创建模式
        title.textContent = '创建标签';
        nameInput.value = '';
        descInput.value = '';
        submitBtn.innerHTML = '<i class="ri-save-line"></i>保存标签';
        
        // 清除颜色选择
        const colorOptions = colorPicker.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.classList.remove('selected');
        });
        // 默认选择第一个颜色
        if (colorOptions.length > 0) {
            colorOptions[0].classList.add('selected');
        }
    }
    
    modal.classList.add('active');
    nameInput.focus();
}

/**
 * 关闭标签模态框
 */
function closeTagModal() {
    const modal = document.getElementById('tagModal');
    if (modal) {
        modal.classList.remove('active');
        editingTagId = null;
    }
}

/**
 * 处理标签表单提交
 */
function handleTagFormSubmit(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('tagName');
    const descInput = document.getElementById('tagDescription');
    const selectedColor = document.querySelector('.color-option.selected');
    
    if (!nameInput || !selectedColor) return;
    
    const tagData = {
        name: nameInput.value.trim(),
        description: descInput ? descInput.value.trim() : '',
        color: selectedColor.dataset.color
    };
    
    if (!tagData.name) {
        showNotification('请输入标签名称', 'error');
        nameInput.focus();
        return;
    }
    
    // 检查标签名称是否重复
    const existingTag = tags.find(tag => 
        tag.name.toLowerCase() === tagData.name.toLowerCase() && 
        tag.id !== editingTagId
    );
    
    if (existingTag) {
        showNotification('标签名称已存在', 'error');
        nameInput.focus();
        return;
    }
    
    if (editingTagId) {
        updateTag(editingTagId, tagData);
    } else {
        createTag(tagData);
    }
    
    closeTagModal();
}

/**
 * 创建标签
 */
function createTag(tagData) {
    const newTag = {
        id: `tag_${Date.now()}`,
        ...tagData,
        imageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        images: []
    };
    
    tags.unshift(newTag);
    applyFiltersAndSort();
    
    showNotification('标签创建成功', 'success');
    
    // 这里应该调用API
    // await fetch('/api/tags', { method: 'POST', body: JSON.stringify(newTag) });
}

/**
 * 更新标签
 */
function updateTag(tagId, tagData) {
    const tagIndex = tags.findIndex(tag => tag.id === tagId);
    if (tagIndex === -1) return;
    
    tags[tagIndex] = {
        ...tags[tagIndex],
        ...tagData,
        updatedAt: new Date().toISOString()
    };
    
    applyFiltersAndSort();
    
    showNotification('标签更新成功', 'success');
    
    // 这里应该调用API
    // await fetch(`/api/tags/${tagId}`, { method: 'PUT', body: JSON.stringify(tagData) });
}

/**
 * 编辑标签
 */
function editTag(tagId) {
    openTagModal(tagId);
}

/**
 * 删除标签
 */
function deleteTag(tagId) {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;
    
    const message = tag.imageCount > 0 
        ? `确定要删除标签"${tag.name}"吗？这将移除 ${tag.imageCount} 张图片的标签关联。`
        : `确定要删除标签"${tag.name}"吗？`;
    
    if (confirm(message)) {
        tags = tags.filter(t => t.id !== tagId);
        selectedTags.delete(tagId);
        applyFiltersAndSort();
        updateBatchToolbar();
        
        showNotification('标签已删除', 'success');
        
        // 这里应该调用API
        // await fetch(`/api/tags/${tagId}`, { method: 'DELETE' });
    }
}

/**
 * 批量合并标签
 */
function handleBatchMerge() {
    if (selectedTags.size < 2) {
        showNotification('请至少选择两个标签进行合并', 'warning');
        return;
    }
    
    const selectedTagsArray = Array.from(selectedTags);
    const tagNames = selectedTagsArray.map(id => 
        tags.find(tag => tag.id === id)?.name
    ).filter(Boolean).join('、');
    
    if (confirm(`确定要合并这些标签吗？\n${tagNames}\n\n合并后将保留第一个标签，其他标签将被删除。`)) {
        // 模拟合并操作
        const primaryTagId = selectedTagsArray[0];
        const primaryTag = tags.find(tag => tag.id === primaryTagId);
        
        if (primaryTag) {
            // 计算合并后的图片数量
            let totalImages = 0;
            selectedTagsArray.forEach(tagId => {
                const tag = tags.find(t => t.id === tagId);
                if (tag) {
                    totalImages += tag.imageCount;
                }
            });
            
            // 更新主标签
            primaryTag.imageCount = totalImages;
            primaryTag.updatedAt = new Date().toISOString();
            
            // 删除其他标签
            tags = tags.filter(tag => 
                tag.id === primaryTagId || !selectedTagsArray.includes(tag.id)
            );
            
            clearSelection();
            applyFiltersAndSort();
            
            showNotification(`标签已合并到"${primaryTag.name}"`, 'success');
        }
    }
}

/**
 * 批量删除标签
 */
function handleBatchDelete() {
    if (selectedTags.size === 0) return;
    
    const selectedTagsArray = Array.from(selectedTags);
    const totalImages = selectedTagsArray.reduce((total, tagId) => {
        const tag = tags.find(t => t.id === tagId);
        return total + (tag ? tag.imageCount : 0);
    }, 0);
    
    const message = totalImages > 0
        ? `确定要删除 ${selectedTags.size} 个标签吗？这将移除 ${totalImages} 张图片的标签关联。`
        : `确定要删除 ${selectedTags.size} 个标签吗？`;
    
    if (confirm(message)) {
        tags = tags.filter(tag => !selectedTags.has(tag.id));
        clearSelection();
        applyFiltersAndSort();
        
        showNotification(`已删除 ${selectedTagsArray.length} 个标签`, 'success');
    }
}

/**
 * 更新统计信息
 */
function updateStats() {
    const totalTagsElement = document.getElementById('totalTags');
    const totalImagesElement = document.getElementById('totalImages');
    
    if (totalTagsElement) {
        totalTagsElement.textContent = tags.length;
    }
    
    if (totalImagesElement) {
        const totalImages = tags.reduce((total, tag) => total + tag.imageCount, 0);
        totalImagesElement.textContent = totalImages;
    }
}

/**
 * 显示加载状态
 */
function showLoading() {
    const grid = document.getElementById('tagsGrid');
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                <div class="loading-spinner"></div>
                <p style="margin-top: 1rem; color: var(--text-light);">正在加载标签...</p>
            </div>
        `;
    }
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
    // 加载完成后会通过renderTags重新渲染内容，无需特殊处理
}

/**
 * 显示错误信息
 */
function showError(message) {
    const grid = document.getElementById('tagsGrid');
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                <i class="ri-error-warning-line" style="font-size: 3rem; color: var(--error-color); margin-bottom: 1rem;"></i>
                <p style="color: var(--error-color); font-weight: 600;">${message}</p>
                <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer;">重新加载</button>
            </div>
        `;
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