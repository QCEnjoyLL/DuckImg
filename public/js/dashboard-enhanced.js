// 仪表盘增强功能模块
class DashboardEnhanced {
    constructor() {
        this.statistics = {
            totalImages: 0,
            totalSize: 0,
            uploadTrend: [],
            formatDistribution: {},
            sizeDistribution: {},
            monthlyUploads: {},
            popularTags: {},
            recentActivity: []
        };
        
        this.charts = {};
        this.filters = {
            dateRange: 'all',
            format: 'all',
            tag: 'all',
            favoriteOnly: false
        };
        
        this.init();
    }

    // 初始化增强功能
    init() {
        this.createEnhancedWidgets();
        this.bindEvents();
        this.loadStatistics();
    }

    // 创建增强的仪表盘小部件
    createEnhancedWidgets() {
        this.createAdvancedStatsWidget();
        this.createActivityTimelineWidget();
        this.createStorageAnalyticsWidget();
        this.createQuickActionsWidget();
        this.createRecentActivityWidget();
    }

    // 创建高级统计小部件
    createAdvancedStatsWidget() {
        const statsContainer = document.querySelector('.dashboard-stats');
        if (!statsContainer) return;

        // 添加新的统计卡片
        const advancedStats = document.createElement('div');
        advancedStats.className = 'advanced-stats-container';
        advancedStats.innerHTML = `
            <div class="stat-card advanced-stat-card">
                <div class="stat-icon">
                    <i class="ri-calendar-line"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value" id="thisMonthUploads">0</div>
                    <div class="stat-label">本月上传</div>
                    <div class="stat-trend" id="monthlyTrend">
                        <i class="ri-arrow-up-line"></i>
                        <span>+0%</span>
                    </div>
                </div>
            </div>
            
            <div class="stat-card advanced-stat-card">
                <div class="stat-icon">
                    <i class="ri-heart-line"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value" id="favoriteCount">0</div>
                    <div class="stat-label">收藏图片</div>
                    <div class="stat-trend positive">
                        <i class="ri-star-line"></i>
                        <span>精选</span>
                    </div>
                </div>
            </div>
            
            <div class="stat-card advanced-stat-card">
                <div class="stat-icon">
                    <i class="ri-share-line"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value" id="shareCount">0</div>
                    <div class="stat-label">分享次数</div>
                    <div class="stat-trend" id="shareTrend">
                        <i class="ri-eye-line"></i>
                        <span>热门</span>
                    </div>
                </div>
            </div>
            
            <div class="stat-card advanced-stat-card">
                <div class="stat-icon">
                    <i class="ri-speed-line"></i>
                </div>
                <div class="stat-content">
                    <div class="stat-value" id="avgFileSize">0 MB</div>
                    <div class="stat-label">平均大小</div>
                    <div class="stat-trend" id="sizeTrend">
                        <i class="ri-database-line"></i>
                        <span>优化</span>
                    </div>
                </div>
            </div>
        `;

        statsContainer.appendChild(advancedStats);
    }

    // 创建活动时间线小部件
    createActivityTimelineWidget() {
        const dashboardContainer = document.querySelector('.dashboard-container');
        if (!dashboardContainer) return;

        const timelineWidget = document.createElement('div');
        timelineWidget.className = 'dashboard-widget timeline-widget';
        timelineWidget.innerHTML = `
            <div class="widget-header">
                <h3>
                    <i class="ri-time-line"></i>
                    <span>活动时间线</span>
                </h3>
                <div class="widget-actions">
                    <button class="widget-action-btn" id="refreshTimeline">
                        <i class="ri-refresh-line"></i>
                    </button>
                    <button class="widget-action-btn" id="exportTimeline">
                        <i class="ri-download-line"></i>
                    </button>
                </div>
            </div>
            <div class="widget-content">
                <div class="timeline-container" id="activityTimeline">
                    <!-- 时间线项目将在这里动态生成 -->
                </div>
            </div>
        `;

        // 插入到图表容器之后
        const chartsContainer = document.querySelector('.dashboard-charts');
        if (chartsContainer) {
            chartsContainer.parentNode.insertBefore(timelineWidget, chartsContainer.nextSibling);
        } else {
            dashboardContainer.appendChild(timelineWidget);
        }
    }

    // 创建存储分析小部件
    createStorageAnalyticsWidget() {
        const dashboardContainer = document.querySelector('.dashboard-container');
        if (!dashboardContainer) return;

        const storageWidget = document.createElement('div');
        storageWidget.className = 'dashboard-widget storage-widget';
        storageWidget.innerHTML = `
            <div class="widget-header">
                <h3>
                    <i class="ri-pie-chart-line"></i>
                    <span>存储分析</span>
                </h3>
                <div class="widget-actions">
                    <select class="widget-select" id="storageAnalysisPeriod">
                        <option value="week">最近一周</option>
                        <option value="month" selected>最近一月</option>
                        <option value="quarter">最近三月</option>
                        <option value="year">最近一年</option>
                    </select>
                </div>
            </div>
            <div class="widget-content">
                <div class="storage-overview">
                    <div class="storage-stat">
                        <div class="storage-stat-icon">
                            <i class="ri-folder-line"></i>
                        </div>
                        <div class="storage-stat-info">
                            <div class="storage-stat-value" id="totalStorageUsed">0 MB</div>
                            <div class="storage-stat-label">已用空间</div>
                        </div>
                    </div>
                    <div class="storage-stat">
                        <div class="storage-stat-icon">
                            <i class="ri-file-line"></i>
                        </div>
                        <div class="storage-stat-info">
                            <div class="storage-stat-value" id="avgFileSize">0 KB</div>
                            <div class="storage-stat-label">平均文件大小</div>
                        </div>
                    </div>
                    <div class="storage-stat">
                        <div class="storage-stat-icon">
                            <i class="ri-archive-line"></i>
                        </div>
                        <div class="storage-stat-info">
                            <div class="storage-stat-value" id="largestFile">0 MB</div>
                            <div class="storage-stat-label">最大文件</div>
                        </div>
                    </div>
                </div>
                <div class="storage-charts">
                    <div class="chart-container storage-chart">
                        <canvas id="storageDistributionChart"></canvas>
                    </div>
                    <div class="chart-container format-chart">
                        <canvas id="formatDistributionChart"></canvas>
                    </div>
                </div>
            </div>
        `;

        const timelineWidget = document.querySelector('.timeline-widget');
        if (timelineWidget) {
            timelineWidget.parentNode.insertBefore(storageWidget, timelineWidget.nextSibling);
        } else {
            dashboardContainer.appendChild(storageWidget);
        }
    }

    // 创建快速操作小部件
    createQuickActionsWidget() {
        const dashboardContainer = document.querySelector('.dashboard-container');
        if (!dashboardContainer) return;

        const quickActionsWidget = document.createElement('div');
        quickActionsWidget.className = 'dashboard-widget quick-actions-widget';
        quickActionsWidget.innerHTML = `
            <div class="widget-header">
                <h3>
                    <i class="ri-flashlight-line"></i>
                    <span>快速操作</span>
                </h3>
            </div>
            <div class="widget-content">
                <div class="quick-actions-grid">
                    <button class="quick-action-btn" id="bulkUploadBtn">
                        <div class="quick-action-icon">
                            <i class="ri-upload-cloud-2-line"></i>
                        </div>
                        <div class="quick-action-text">
                            <div class="quick-action-title">批量上传</div>
                            <div class="quick-action-desc">上传多张图片</div>
                        </div>
                    </button>
                    
                    <button class="quick-action-btn" id="bulkEditBtn">
                        <div class="quick-action-icon">
                            <i class="ri-edit-box-line"></i>
                        </div>
                        <div class="quick-action-text">
                            <div class="quick-action-title">批量编辑</div>
                            <div class="quick-action-desc">批量处理图片</div>
                        </div>
                    </button>
                    
                    <button class="quick-action-btn" id="exportDataBtn">
                        <div class="quick-action-icon">
                            <i class="ri-download-2-line"></i>
                        </div>
                        <div class="quick-action-text">
                            <div class="quick-action-title">导出数据</div>
                            <div class="quick-action-desc">导出图片信息</div>
                        </div>
                    </button>
                    
                    <button class="quick-action-btn" id="cleanupBtn">
                        <div class="quick-action-icon">
                            <i class="ri-delete-bin-line"></i>
                        </div>
                        <div class="quick-action-text">
                            <div class="quick-action-title">清理空间</div>
                            <div class="quick-action-desc">删除无用文件</div>
                        </div>
                    </button>
                    
                    <button class="quick-action-btn" id="shareCollectionBtn">
                        <div class="quick-action-icon">
                            <i class="ri-share-forward-line"></i>
                        </div>
                        <div class="quick-action-text">
                            <div class="quick-action-title">分享合集</div>
                            <div class="quick-action-desc">创建分享链接</div>
                        </div>
                    </button>
                    
                    <button class="quick-action-btn" id="settingsBtn">
                        <div class="quick-action-icon">
                            <i class="ri-settings-3-line"></i>
                        </div>
                        <div class="quick-action-text">
                            <div class="quick-action-title">偏好设置</div>
                            <div class="quick-action-desc">个性化配置</div>
                        </div>
                    </button>
                </div>
            </div>
        `;

        const storageWidget = document.querySelector('.storage-widget');
        if (storageWidget) {
            storageWidget.parentNode.insertBefore(quickActionsWidget, storageWidget.nextSibling);
        } else {
            dashboardContainer.appendChild(quickActionsWidget);
        }
    }

    // 创建最近活动小部件
    createRecentActivityWidget() {
        const dashboardContainer = document.querySelector('.dashboard-container');
        if (!dashboardContainer) return;

        const activityWidget = document.createElement('div');
        activityWidget.className = 'dashboard-widget recent-activity-widget';
        activityWidget.innerHTML = `
            <div class="widget-header">
                <h3>
                    <i class="ri-history-line"></i>
                    <span>最近活动</span>
                </h3>
                <div class="widget-actions">
                    <button class="widget-action-btn" id="clearActivityBtn">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
            <div class="widget-content">
                <div class="activity-list" id="recentActivityList">
                    <!-- 活动项目将在这里动态生成 -->
                </div>
            </div>
        `;

        const quickActionsWidget = document.querySelector('.quick-actions-widget');
        if (quickActionsWidget) {
            quickActionsWidget.parentNode.insertBefore(activityWidget, quickActionsWidget.nextSibling);
        } else {
            dashboardContainer.appendChild(activityWidget);
        }
    }

    // 绑定事件
    bindEvents() {
        // 刷新时间线
        const refreshTimelineBtn = document.getElementById('refreshTimeline');
        if (refreshTimelineBtn) {
            refreshTimelineBtn.addEventListener('click', () => {
                this.refreshActivityTimeline();
            });
        }

        // 导出时间线
        const exportTimelineBtn = document.getElementById('exportTimeline');
        if (exportTimelineBtn) {
            exportTimelineBtn.addEventListener('click', () => {
                this.exportTimeline();
            });
        }

        // 存储分析周期选择
        const periodSelect = document.getElementById('storageAnalysisPeriod');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                this.updateStorageAnalytics(e.target.value);
            });
        }

        // 快速操作按钮
        this.bindQuickActionEvents();

        // 清除活动记录
        const clearActivityBtn = document.getElementById('clearActivityBtn');
        if (clearActivityBtn) {
            clearActivityBtn.addEventListener('click', () => {
                this.clearRecentActivity();
            });
        }
    }

    // 绑定快速操作事件
    bindQuickActionEvents() {
        // 批量上传
        const bulkUploadBtn = document.getElementById('bulkUploadBtn');
        if (bulkUploadBtn) {
            bulkUploadBtn.addEventListener('click', () => {
                // 触发文件选择
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.multiple = true;
                fileInput.accept = 'image/*';
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        this.handleBulkUpload(e.target.files);
                    }
                });
                fileInput.click();
            });
        }

        // 批量编辑
        const bulkEditBtn = document.getElementById('bulkEditBtn');
        if (bulkEditBtn) {
            bulkEditBtn.addEventListener('click', () => {
                this.openBulkEditDialog();
            });
        }

        // 导出数据
        const exportDataBtn = document.getElementById('exportDataBtn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', () => {
                this.exportUserData();
            });
        }

        // 清理空间
        const cleanupBtn = document.getElementById('cleanupBtn');
        if (cleanupBtn) {
            cleanupBtn.addEventListener('click', () => {
                this.openCleanupDialog();
            });
        }

        // 分享合集
        const shareCollectionBtn = document.getElementById('shareCollectionBtn');
        if (shareCollectionBtn) {
            shareCollectionBtn.addEventListener('click', () => {
                this.createShareCollection();
            });
        }

        // 设置
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.openSettingsDialog();
            });
        }
    }

    // 加载统计数据
    async loadStatistics() {
        try {
            // 这里应该从API获取数据，现在用模拟数据
            const data = await this.fetchStatisticsData();
            this.statistics = { ...this.statistics, ...data };
            this.updateStatisticsDisplay();
            this.updateCharts();
            this.updateActivityTimeline();
            this.updateRecentActivity();
        } catch (error) {
            console.error('加载统计数据失败:', error);
        }
    }

    // 模拟获取统计数据
    async fetchStatisticsData() {
        // 模拟API调用
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    totalImages: 156,
                    totalSize: 2.4 * 1024 * 1024 * 1024, // 2.4GB
                    thisMonthUploads: 23,
                    favoriteCount: 12,
                    shareCount: 45,
                    avgFileSize: 1.8 * 1024 * 1024, // 1.8MB
                    largestFile: 8.5 * 1024 * 1024, // 8.5MB
                    uploadTrend: [
                        { date: '2024-01-01', count: 5 },
                        { date: '2024-01-02', count: 8 },
                        { date: '2024-01-03', count: 12 },
                        { date: '2024-01-04', count: 6 },
                        { date: '2024-01-05', count: 15 }
                    ],
                    formatDistribution: {
                        'JPEG': 45,
                        'PNG': 35,
                        'WebP': 15,
                        'GIF': 5
                    },
                    recentActivity: [
                        { type: 'upload', description: '上传了 5 张图片', time: '2 分钟前' },
                        { type: 'favorite', description: '收藏了图片 "sunset.jpg"', time: '15 分钟前' },
                        { type: 'share', description: '分享了图片合集', time: '1 小时前' },
                        { type: 'edit', description: '编辑了图片 "portrait.png"', time: '3 小时前' }
                    ]
                });
            }, 500);
        });
    }

    // 更新统计显示
    updateStatisticsDisplay() {
        // 更新本月上传
        const thisMonthElement = document.getElementById('thisMonthUploads');
        if (thisMonthElement) {
            thisMonthElement.textContent = this.statistics.thisMonthUploads;
        }

        // 更新收藏数量
        const favoriteElement = document.getElementById('favoriteCount');
        if (favoriteElement) {
            favoriteElement.textContent = this.statistics.favoriteCount;
        }

        // 更新分享次数
        const shareElement = document.getElementById('shareCount');
        if (shareElement) {
            shareElement.textContent = this.statistics.shareCount;
        }

        // 更新平均文件大小
        const avgSizeElement = document.getElementById('avgFileSize');
        if (avgSizeElement) {
            avgSizeElement.textContent = this.formatFileSize(this.statistics.avgFileSize);
        }

        // 更新存储统计
        const totalStorageElement = document.getElementById('totalStorageUsed');
        if (totalStorageElement) {
            totalStorageElement.textContent = this.formatFileSize(this.statistics.totalSize);
        }

        const largestFileElement = document.getElementById('largestFile');
        if (largestFileElement) {
            largestFileElement.textContent = this.formatFileSize(this.statistics.largestFile);
        }
    }

    // 更新图表
    updateCharts() {
        this.updateStorageDistributionChart();
        this.updateFormatDistributionChart();
    }

    // 更新存储分布图表
    updateStorageDistributionChart() {
        const canvas = document.getElementById('storageDistributionChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // 简化的图表实现（实际项目中可以使用Chart.js等库）
        this.drawSimpleChart(ctx, 'doughnut', {
            labels: ['已使用', '可用空间'],
            data: [this.statistics.totalSize, 1024*1024*1024*10 - this.statistics.totalSize],
            colors: ['#4361ee', '#e5e7eb']
        });
    }

    // 更新格式分布图表
    updateFormatDistributionChart() {
        const canvas = document.getElementById('formatDistributionChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        this.drawSimpleChart(ctx, 'bar', {
            labels: Object.keys(this.statistics.formatDistribution),
            data: Object.values(this.statistics.formatDistribution),
            colors: ['#4361ee', '#06d6a0', '#f72585', '#fbb13c']
        });
    }

    // 简单图表绘制（可替换为专业图表库）
    drawSimpleChart(ctx, type, config) {
        const { labels, data, colors } = config;
        const canvas = ctx.canvas;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 20;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (type === 'doughnut') {
            let startAngle = 0;
            const total = data.reduce((sum, value) => sum + value, 0);

            data.forEach((value, index) => {
                const sliceAngle = (value / total) * 2 * Math.PI;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
                ctx.arc(centerX, centerY, radius * 0.6, startAngle + sliceAngle, startAngle, true);
                ctx.closePath();
                ctx.fillStyle = colors[index];
                ctx.fill();
                startAngle += sliceAngle;
            });
        } else if (type === 'bar') {
            const barWidth = (canvas.width - 40) / data.length;
            const maxValue = Math.max(...data);

            data.forEach((value, index) => {
                const barHeight = (value / maxValue) * (canvas.height - 60);
                const x = 20 + index * barWidth;
                const y = canvas.height - 30 - barHeight;

                ctx.fillStyle = colors[index % colors.length];
                ctx.fillRect(x, y, barWidth - 10, barHeight);

                // 绘制标签
                ctx.fillStyle = '#666';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(labels[index], x + (barWidth - 10) / 2, canvas.height - 10);
            });
        }
    }

    // 更新活动时间线
    updateActivityTimeline() {
        const timelineContainer = document.getElementById('activityTimeline');
        if (!timelineContainer) return;

        timelineContainer.innerHTML = '';

        this.statistics.uploadTrend.forEach((item, index) => {
            const timelineItem = document.createElement('div');
            timelineItem.className = 'timeline-item';
            timelineItem.innerHTML = `
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                    <div class="timeline-date">${item.date}</div>
                    <div class="timeline-description">上传了 ${item.count} 张图片</div>
                </div>
            `;
            timelineContainer.appendChild(timelineItem);
        });
    }

    // 更新最近活动
    updateRecentActivity() {
        const activityList = document.getElementById('recentActivityList');
        if (!activityList) return;

        activityList.innerHTML = '';

        this.statistics.recentActivity.forEach((activity) => {
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';
            
            let iconClass = 'ri-upload-line';
            switch (activity.type) {
                case 'favorite': iconClass = 'ri-heart-line'; break;
                case 'share': iconClass = 'ri-share-line'; break;
                case 'edit': iconClass = 'ri-edit-line'; break;
            }

            activityItem.innerHTML = `
                <div class="activity-icon">
                    <i class="${iconClass}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-description">${activity.description}</div>
                    <div class="activity-time">${activity.time}</div>
                </div>
            `;
            activityList.appendChild(activityItem);
        });
    }

    // 快速操作方法
    async handleBulkUpload(files) {
        console.log('批量上传', files.length, '个文件');
        // 这里可以集成现有的上传功能
        if (window.batchProcessor) {
            window.batchProcessor.open(files);
        }
    }

    openBulkEditDialog() {
        console.log('打开批量编辑对话框');
        // 实现批量编辑功能
    }

    async exportUserData() {
        console.log('导出用户数据');
        // 实现数据导出功能
        const data = {
            statistics: this.statistics,
            images: [], // 从API获取图片列表
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dashboard-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    openCleanupDialog() {
        console.log('打开清理对话框');
        // 实现清理功能
    }

    createShareCollection() {
        console.log('创建分享合集');
        // 实现分享合集功能
    }

    openSettingsDialog() {
        console.log('打开设置对话框');
        // 实现设置功能
    }

    refreshActivityTimeline() {
        this.loadStatistics();
    }

    exportTimeline() {
        const data = {
            timeline: this.statistics.uploadTrend,
            activity: this.statistics.recentActivity,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-timeline-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    clearRecentActivity() {
        if (confirm('确定要清除所有活动记录吗？')) {
            this.statistics.recentActivity = [];
            this.updateRecentActivity();
        }
    }

    updateStorageAnalytics(period) {
        console.log('更新存储分析，周期:', period);
        // 根据选择的周期重新加载数据
        this.loadStatistics();
    }

    // 工具方法
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// 初始化仪表盘增强功能
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.dashboardEnhanced = new DashboardEnhanced();
    });
} else {
    window.dashboardEnhanced = new DashboardEnhanced();
} 