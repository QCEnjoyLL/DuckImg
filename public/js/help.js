/**
 * 帮助文档页面功能
 * 处理导航、搜索、FAQ展开等交互
 */

document.addEventListener('DOMContentLoaded', () => {
    initHelpPage();
});

/**
 * 初始化帮助页面
 */
function initHelpPage() {
    // 初始化导航功能
    initNavigation();
    
    // 初始化FAQ功能
    initFAQ();
    
    // 初始化搜索功能
    initSearch();
    
    // 监听URL哈希变化
    window.addEventListener('hashchange', handleHashChange);
    
    // 处理初始哈希
    handleHashChange();
}

/**
 * 初始化导航功能
 */
function initNavigation() {
    const navItems = document.querySelectorAll('.help-nav-item');
    const sections = document.querySelectorAll('.help-section');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 移除所有活动状态
            navItems.forEach(nav => nav.classList.remove('active'));
            sections.forEach(section => section.classList.remove('active'));
            
            // 添加活动状态
            item.classList.add('active');
            
            // 显示对应的section
            const targetSection = item.getAttribute('data-section');
            const section = document.getElementById(targetSection);
            if (section) {
                section.classList.add('active');
                
                // 更新URL哈希
                window.location.hash = targetSection;
                
                // 滚动到顶部
                document.querySelector('.help-main').scrollTop = 0;
            }
        });
    });
}

/**
 * 初始化FAQ功能
 */
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                // 切换当前项的状态
                item.classList.toggle('active');
                
                // 添加点击动画
                question.style.transform = 'scale(0.98)';
                setTimeout(() => {
                    question.style.transform = 'scale(1)';
                }, 150);
            });
        }
    });
}

/**
 * 初始化搜索功能
 */
function initSearch() {
    const searchInput = document.getElementById('helpSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSearchEnter(searchInput.value);
            }
        });
    }
}

/**
 * 处理搜索
 */
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    
    if (query.length === 0) {
        clearSearchHighlights();
        return;
    }
    
    if (query.length < 2) {
        return; // 至少输入2个字符才开始搜索
    }
    
    searchInContent(query);
}

/**
 * 搜索内容
 */
function searchInContent(query) {
    const sections = document.querySelectorAll('.help-section');
    const results = [];
    
    sections.forEach(section => {
        const sectionId = section.id;
        const sectionTitle = section.querySelector('.help-section-title')?.textContent || '';
        const sectionContent = section.textContent.toLowerCase();
        
        if (sectionContent.includes(query)) {
            results.push({
                id: sectionId,
                title: sectionTitle,
                relevance: calculateRelevance(sectionContent, query)
            });
        }
    });
    
    // 按相关度排序
    results.sort((a, b) => b.relevance - a.relevance);
    
    if (results.length > 0) {
        showSearchResults(results, query);
    } else {
        showNoResults(query);
    }
}

/**
 * 计算相关度
 */
function calculateRelevance(content, query) {
    const matches = (content.match(new RegExp(query, 'g')) || []).length;
    return matches;
}

/**
 * 显示搜索结果
 */
function showSearchResults(results, query) {
    // 如果只有一个结果，直接跳转
    if (results.length === 1) {
        navigateToSection(results[0].id);
        highlightSearchTerm(query);
        return;
    }
    
    // 创建搜索结果提示
    showSearchSuggestions(results, query);
}

/**
 * 显示搜索建议
 */
function showSearchSuggestions(results, query) {
    // 移除现有的建议
    const existingSuggestions = document.querySelector('.search-suggestions');
    if (existingSuggestions) {
        existingSuggestions.remove();
    }
    
    const suggestions = document.createElement('div');
    suggestions.className = 'search-suggestions';
    suggestions.innerHTML = `
        <div class="search-suggestions-header">
            <span>找到 ${results.length} 个相关结果</span>
            <button class="close-suggestions">&times;</button>
        </div>
        <div class="search-suggestions-list">
            ${results.map(result => `
                <div class="search-suggestion-item" data-section="${result.id}">
                    <i class="ri-search-line"></i>
                    <span>${result.title}</span>
                </div>
            `).join('')}
        </div>
    `;
    
    // 添加样式
    suggestions.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        z-index: 1000;
        max-height: 300px;
        overflow-y: auto;
    `;
    
    // 添加到搜索容器
    const searchContainer = document.querySelector('.help-search');
    searchContainer.style.position = 'relative';
    searchContainer.appendChild(suggestions);
    
    // 添加事件监听
    suggestions.addEventListener('click', (e) => {
        if (e.target.closest('.close-suggestions')) {
            suggestions.remove();
        } else if (e.target.closest('.search-suggestion-item')) {
            const sectionId = e.target.closest('.search-suggestion-item').dataset.section;
            navigateToSection(sectionId);
            highlightSearchTerm(query);
            suggestions.remove();
        }
    });
}

/**
 * 导航到指定section
 */
function navigateToSection(sectionId) {
    const navItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (navItem) {
        navItem.click();
    }
}

/**
 * 高亮搜索词
 */
function highlightSearchTerm(query) {
    const activeSection = document.querySelector('.help-section.active');
    if (!activeSection) return;
    
    // 移除现有高亮
    clearSearchHighlights();
    
    // 添加新高亮
    const walker = document.createTreeWalker(
        activeSection,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }
    
    textNodes.forEach(textNode => {
        const parent = textNode.parentNode;
        if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return;
        
        const text = textNode.textContent;
        const regex = new RegExp(`(${query})`, 'gi');
        
        if (regex.test(text)) {
            const highlightedText = text.replace(regex, '<mark class="search-highlight">$1</mark>');
            const wrapper = document.createElement('span');
            wrapper.innerHTML = highlightedText;
            parent.replaceChild(wrapper, textNode);
        }
    });
}

/**
 * 清除搜索高亮
 */
function clearSearchHighlights() {
    const highlights = document.querySelectorAll('.search-highlight');
    highlights.forEach(highlight => {
        const parent = highlight.parentNode;
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
    });
}

/**
 * 显示无结果
 */
function showNoResults(query) {
    console.log('No results found for:', query);
    // 这里可以显示"未找到结果"的提示
}

/**
 * 处理搜索回车
 */
function handleSearchEnter(query) {
    if (query.trim().length === 0) return;
    
    // 如果有搜索建议，选择第一个
    const firstSuggestion = document.querySelector('.search-suggestion-item');
    if (firstSuggestion) {
        firstSuggestion.click();
    }
}

/**
 * 处理URL哈希变化
 */
function handleHashChange() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const navItem = document.querySelector(`[data-section="${hash}"]`);
        if (navItem && !navItem.classList.contains('active')) {
            navItem.click();
        }
    }
}

/**
 * 添加搜索样式
 */
function addSearchStyles() {
    if (document.querySelector('#help-search-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'help-search-styles';
    style.textContent = `
        .search-suggestions-header {
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.9rem;
            color: var(--text-light);
        }
        
        .close-suggestions {
            background: none;
            border: none;
            color: var(--text-light);
            cursor: pointer;
            font-size: 1.2rem;
            padding: 0.25rem;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        
        .close-suggestions:hover {
            background: rgba(0, 0, 0, 0.1);
            color: var(--text-color);
        }
        
        .search-suggestion-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            cursor: pointer;
            transition: all 0.2s ease;
            border-bottom: 1px solid var(--border-color);
        }
        
        .search-suggestion-item:last-child {
            border-bottom: none;
        }
        
        .search-suggestion-item:hover {
            background: var(--primary-light);
            color: white;
        }
        
        .search-highlight {
            background: #ffeb3b;
            color: #000;
            padding: 0.1em 0.2em;
            border-radius: 3px;
            font-weight: 600;
        }
        
        body.dark-mode .search-highlight {
            background: #ff9800;
            color: #fff;
        }
    `;
    document.head.appendChild(style);
}

// 添加样式
addSearchStyles(); 