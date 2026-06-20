// 批量处理管理器
class BatchProcessor {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.maxConcurrent = 3; // 最大并发处理数
        this.currentProcessing = 0;
        this.completedCount = 0;
        this.failedCount = 0;
        this.totalCount = 0;
        this.progressCallback = null;
        this.completeCallback = null;
        this.errorCallback = null;
        
        this.init();
    }

    // 初始化批量处理器
    init() {
        this.createBatchModal();
        this.bindEvents();
    }

    // 创建批量处理模态框
    createBatchModal() {
        const modal = document.createElement('div');
        modal.className = 'batch-processor-modal';
        modal.innerHTML = `
            <div class="batch-modal-overlay"></div>
            <div class="batch-modal-content">
                <div class="batch-modal-header">
                    <h3>
                        <i class="ri-stack-line"></i>
                        <span>批量处理</span>
                    </h3>
                    <button class="batch-modal-close" id="closeBatchModal">
                        <i class="ri-close-line"></i>
                    </button>
                </div>
                
                <div class="batch-modal-body">
                    <!-- 处理配置 -->
                    <div class="batch-config-section">
                        <h4>处理设置</h4>
                        <div class="batch-config-grid">
                            <div class="config-group">
                                <label>输出格式</label>
                                <select id="batchOutputFormat" class="batch-select">
                                    <option value="original">保持原格式</option>
                                    <option value="jpeg">JPEG</option>
                                    <option value="png">PNG</option>
                                    <option value="webp">WebP</option>
                                </select>
                            </div>
                            <div class="config-group">
                                <label>图片质量</label>
                                <div class="quality-control">
                                    <input type="range" id="batchQuality" min="10" max="100" value="90" class="batch-slider">
                                    <span id="batchQualityValue">90%</span>
                                </div>
                            </div>
                            <div class="config-group">
                                <label>尺寸调整</label>
                                <div class="resize-control">
                                    <input type="checkbox" id="batchResize" class="batch-checkbox">
                                    <div class="resize-inputs" id="resizeInputs" style="display: none;">
                                        <input type="number" id="batchWidth" placeholder="宽度" class="batch-input">
                                        <span>×</span>
                                        <input type="number" id="batchHeight" placeholder="高度" class="batch-input">
                                        <label class="aspect-ratio-lock">
                                            <input type="checkbox" id="batchKeepAspect" checked>
                                            <span>保持比例</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div class="config-group">
                                <label>滤镜效果</label>
                                <select id="batchFilter" class="batch-select">
                                    <option value="none">无滤镜</option>
                                    <option value="bw">黑白</option>
                                    <option value="sepia">复古</option>
                                    <option value="vintage">怀旧</option>
                                    <option value="bright">明亮</option>
                                    <option value="contrast">高对比</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- 文件列表 -->
                    <div class="batch-files-section">
                        <h4>待处理文件 (<span id="batchFileCount">0</span>)</h4>
                        <div class="batch-file-list" id="batchFileList">
                            <!-- 文件列表将在这里动态生成 -->
                        </div>
                    </div>

                    <!-- 进度显示 -->
                    <div class="batch-progress-section" id="batchProgressSection" style="display: none;">
                        <h4>处理进度</h4>
                        <div class="batch-progress-info">
                            <div class="progress-stats">
                                <span>已完成: <strong id="batchCompletedCount">0</strong></span>
                                <span>失败: <strong id="batchFailedCount">0</strong></span>
                                <span>总计: <strong id="batchTotalCount">0</strong></span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar" id="batchProgressBar">
                                    <div class="progress-fill" id="batchProgressFill"></div>
                                </div>
                                <span class="progress-percent" id="batchProgressPercent">0%</span>
                            </div>
                        </div>
                        <div class="batch-log" id="batchLog">
                            <!-- 处理日志 -->
                        </div>
                    </div>

                    <!-- 结果展示 -->
                    <div class="batch-results-section" id="batchResultsSection" style="display: none;">
                        <h4>处理结果</h4>
                        <div class="batch-results-summary">
                            <div class="result-stat success">
                                <i class="ri-check-circle-line"></i>
                                <span>成功: <strong id="resultSuccessCount">0</strong></span>
                            </div>
                            <div class="result-stat failed">
                                <i class="ri-error-warning-line"></i>
                                <span>失败: <strong id="resultFailedCount">0</strong></span>
                            </div>
                        </div>
                        <div class="batch-download-actions">
                            <button class="batch-btn batch-btn-primary" id="downloadAllBtn">
                                <i class="ri-download-line"></i>
                                <span>下载全部</span>
                            </button>
                            <button class="batch-btn batch-btn-secondary" id="downloadSuccessBtn">
                                <i class="ri-download-line"></i>
                                <span>下载成功的</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="batch-modal-footer">
                    <button class="batch-btn batch-btn-secondary" id="cancelBatchBtn">
                        <i class="ri-close-line"></i>
                        <span>取消</span>
                    </button>
                    <button class="batch-btn batch-btn-primary" id="startBatchBtn">
                        <i class="ri-play-line"></i>
                        <span>开始处理</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modal = modal;
    }

    // 绑定事件
    bindEvents() {
        // 质量滑块
        const qualitySlider = document.getElementById('batchQuality');
        const qualityValue = document.getElementById('batchQualityValue');
        
        qualitySlider.addEventListener('input', (e) => {
            qualityValue.textContent = e.target.value + '%';
        });

        // 尺寸调整复选框
        const resizeCheckbox = document.getElementById('batchResize');
        const resizeInputs = document.getElementById('resizeInputs');
        
        resizeCheckbox.addEventListener('change', (e) => {
            resizeInputs.style.display = e.target.checked ? 'flex' : 'none';
        });

        // 保持比例复选框
        const keepAspectCheckbox = document.getElementById('batchKeepAspect');
        const widthInput = document.getElementById('batchWidth');
        const heightInput = document.getElementById('batchHeight');
        
        widthInput.addEventListener('input', (e) => {
            if (keepAspectCheckbox.checked && this.originalAspectRatio) {
                heightInput.value = Math.round(e.target.value / this.originalAspectRatio);
            }
        });

        heightInput.addEventListener('input', (e) => {
            if (keepAspectCheckbox.checked && this.originalAspectRatio) {
                widthInput.value = Math.round(e.target.value * this.originalAspectRatio);
            }
        });

        // 关闭模态框
        document.getElementById('closeBatchModal').addEventListener('click', () => {
            this.close();
        });

        document.getElementById('cancelBatchBtn').addEventListener('click', () => {
            this.close();
        });

        // 开始处理
        document.getElementById('startBatchBtn').addEventListener('click', () => {
            this.startProcessing();
        });

        // 下载按钮
        document.getElementById('downloadAllBtn').addEventListener('click', () => {
            this.downloadResults('all');
        });

        document.getElementById('downloadSuccessBtn').addEventListener('click', () => {
            this.downloadResults('success');
        });

        // 点击遮罩关闭
        this.modal.querySelector('.batch-modal-overlay').addEventListener('click', () => {
            this.close();
        });
    }

    // 打开批量处理器
    open(files) {
        if (!files || files.length === 0) {
            console.error('没有文件可处理');
            return;
        }

        this.files = Array.from(files);
        this.queue = [];
        this.processing = false;
        this.currentProcessing = 0;
        this.completedCount = 0;
        this.failedCount = 0;
        this.totalCount = this.files.length;
        this.results = [];

        // 更新文件计数
        document.getElementById('batchFileCount').textContent = this.files.length;

        // 生成文件列表
        this.generateFileList();

        // 计算平均长宽比
        this.calculateAverageAspectRatio();

        // 显示模态框
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // 重置界面状态
        this.resetUI();
    }

    // 关闭批量处理器
    close() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // 如果正在处理，询问是否确认关闭
        if (this.processing) {
            if (confirm('批量处理正在进行中，确定要关闭吗？')) {
                this.stopProcessing();
            } else {
                this.modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                return;
            }
        }
    }

    // 生成文件列表
    generateFileList() {
        const fileList = document.getElementById('batchFileList');
        fileList.innerHTML = '';

        this.files.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'batch-file-item';
            
            // 创建预览图
            const reader = new FileReader();
            reader.onload = (e) => {
                fileItem.innerHTML = `
                    <div class="file-preview">
                        <img src="${e.target.result}" alt="${file.name}">
                    </div>
                    <div class="file-info">
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                    </div>
                    <div class="file-status" id="fileStatus${index}">
                        <i class="ri-time-line"></i>
                        <span>等待处理</span>
                    </div>
                    <button class="file-remove-btn" onclick="batchProcessor.removeFile(${index})">
                        <i class="ri-close-line"></i>
                    </button>
                `;
            };
            reader.readAsDataURL(file);

            fileList.appendChild(fileItem);
        });
    }

    // 移除文件
    removeFile(index) {
        this.files.splice(index, 1);
        this.totalCount = this.files.length;
        document.getElementById('batchFileCount').textContent = this.files.length;
        this.generateFileList();
        
        if (this.files.length === 0) {
            this.close();
        }
    }

    // 计算平均长宽比
    calculateAverageAspectRatio() {
        // 这里简化处理，实际项目中可以加载图片获取真实尺寸
        this.originalAspectRatio = 16 / 9; // 默认比例
    }

    // 重置UI状态
    resetUI() {
        document.getElementById('batchProgressSection').style.display = 'none';
        document.getElementById('batchResultsSection').style.display = 'none';
        document.getElementById('startBatchBtn').style.display = 'block';
        document.getElementById('cancelBatchBtn').textContent = '取消';
    }

    // 开始处理
    async startProcessing() {
        if (this.processing) return;

        this.processing = true;
        this.completedCount = 0;
        this.failedCount = 0;
        this.results = [];

        // 更新UI
        document.getElementById('batchProgressSection').style.display = 'block';
        document.getElementById('startBatchBtn').style.display = 'none';
        document.getElementById('cancelBatchBtn').textContent = '停止处理';
        document.getElementById('batchTotalCount').textContent = this.totalCount;

        // 获取处理配置
        const config = this.getProcessingConfig();

        // 创建处理队列
        this.queue = this.files.map((file, index) => ({
            file,
            index,
            config,
            status: 'pending'
        }));

        // 开始并发处理
        const promises = [];
        for (let i = 0; i < Math.min(this.maxConcurrent, this.queue.length); i++) {
            promises.push(this.processNext());
        }

        await Promise.all(promises);

        // 处理完成
        this.onProcessingComplete();
    }

    // 获取处理配置
    getProcessingConfig() {
        return {
            outputFormat: document.getElementById('batchOutputFormat').value,
            quality: parseInt(document.getElementById('batchQuality').value) / 100,
            resize: document.getElementById('batchResize').checked,
            width: parseInt(document.getElementById('batchWidth').value) || null,
            height: parseInt(document.getElementById('batchHeight').value) || null,
            keepAspect: document.getElementById('batchKeepAspect').checked,
            filter: document.getElementById('batchFilter').value
        };
    }

    // 处理下一个文件
    async processNext() {
        while (this.processing && this.queue.length > 0) {
            const item = this.queue.shift();
            if (!item) break;

            this.currentProcessing++;
            this.updateFileStatus(item.index, 'processing', '处理中...');

            try {
                const result = await this.processFile(item.file, item.config);
                result.originalIndex = item.index;
                result.originalName = item.file.name;
                this.results.push(result);
                
                this.completedCount++;
                this.updateFileStatus(item.index, 'success', '处理完成');
                this.addLog(`✓ ${item.file.name} 处理成功`, 'success');
                
            } catch (error) {
                console.error('处理文件失败:', error);
                this.failedCount++;
                this.updateFileStatus(item.index, 'error', '处理失败');
                this.addLog(`✗ ${item.file.name} 处理失败: ${error.message}`, 'error');
            }

            this.currentProcessing--;
            this.updateProgress();
        }
    }

    // 处理单个文件
    async processFile(file, config) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = async () => {
                try {
                    const processor = new ImageProcessor();
                    processor.init(img);

                    // 应用滤镜
                    if (config.filter && config.filter !== 'none') {
                        this.applyFilter(processor, config.filter);
                    }

                    // 调整尺寸
                    if (config.resize && config.width && config.height) {
                        processor.resize(config.width, config.height, config.keepAspect);
                    }

                    // 获取输出格式
                    let outputFormat = 'image/jpeg';
                    let extension = 'jpg';
                    
                    if (config.outputFormat === 'png') {
                        outputFormat = 'image/png';
                        extension = 'png';
                    } else if (config.outputFormat === 'webp') {
                        outputFormat = 'image/webp';
                        extension = 'webp';
                    } else if (config.outputFormat === 'original') {
                        outputFormat = file.type;
                        extension = file.name.split('.').pop();
                    }

                    // 生成新文件名
                    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
                    const newFileName = `${nameWithoutExt}_processed.${extension}`;

                    // 获取处理后的文件
                    const processedFile = await processor.getProcessedImageFile(newFileName, outputFormat, config.quality);
                    
                    resolve({
                        file: processedFile,
                        dataUrl: processor.getProcessedImageDataURL(outputFormat, config.quality)
                    });
                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => {
                reject(new Error('图片加载失败'));
            };

            // 加载图片
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // 应用滤镜
    applyFilter(processor, filterType) {
        switch (filterType) {
            case 'bw':
                processor.applyBlackAndWhite(100);
                break;
            case 'sepia':
                processor.applySepia(80);
                break;
            case 'vintage':
                processor.applyVintage(60);
                processor.applyContrast(110);
                processor.applySaturation(80);
                break;
            case 'bright':
                processor.applyBrightness(120);
                processor.applyContrast(105);
                break;
            case 'contrast':
                processor.applyContrast(140);
                processor.applySaturation(110);
                break;
        }
    }

    // 更新文件状态
    updateFileStatus(index, status, text) {
        const statusElement = document.getElementById(`fileStatus${index}`);
        if (statusElement) {
            let icon = 'ri-time-line';
            let className = '';
            
            switch (status) {
                case 'processing':
                    icon = 'ri-loader-4-line';
                    className = 'processing';
                    break;
                case 'success':
                    icon = 'ri-check-line';
                    className = 'success';
                    break;
                case 'error':
                    icon = 'ri-error-warning-line';
                    className = 'error';
                    break;
            }
            
            statusElement.className = `file-status ${className}`;
            statusElement.innerHTML = `<i class="${icon}"></i><span>${text}</span>`;
        }
    }

    // 更新进度
    updateProgress() {
        const processed = this.completedCount + this.failedCount;
        const progress = (processed / this.totalCount) * 100;
        
        document.getElementById('batchCompletedCount').textContent = this.completedCount;
        document.getElementById('batchFailedCount').textContent = this.failedCount;
        document.getElementById('batchProgressFill').style.width = progress + '%';
        document.getElementById('batchProgressPercent').textContent = Math.round(progress) + '%';
    }

    // 添加日志
    addLog(message, type = 'info') {
        const log = document.getElementById('batchLog');
        const logItem = document.createElement('div');
        logItem.className = `log-item log-${type}`;
        logItem.innerHTML = `
            <span class="log-time">${new Date().toLocaleTimeString()}</span>
            <span class="log-message">${message}</span>
        `;
        log.appendChild(logItem);
        log.scrollTop = log.scrollHeight;
    }

    // 处理完成
    onProcessingComplete() {
        this.processing = false;
        
        // 显示结果
        document.getElementById('batchResultsSection').style.display = 'block';
        document.getElementById('resultSuccessCount').textContent = this.completedCount;
        document.getElementById('resultFailedCount').textContent = this.failedCount;
        
        // 更新按钮状态
        document.getElementById('cancelBatchBtn').textContent = '关闭';
        
        this.addLog(`批量处理完成！成功: ${this.completedCount}, 失败: ${this.failedCount}`, 'info');
    }

    // 停止处理
    stopProcessing() {
        this.processing = false;
        this.queue = [];
    }

    // 下载结果
    downloadResults(type) {
        const resultsToDownload = type === 'all' ? this.results : 
                                 this.results.filter(result => result.file);

        if (resultsToDownload.length === 0) {
            alert('没有可下载的文件');
            return;
        }

        // 创建ZIP文件或逐个下载
        if (resultsToDownload.length === 1) {
            // 单个文件直接下载
            const result = resultsToDownload[0];
            const url = URL.createObjectURL(result.file);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.file.name;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            // 多个文件逐个下载（简化实现）
            resultsToDownload.forEach((result, index) => {
                setTimeout(() => {
                    const url = URL.createObjectURL(result.file);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = result.file.name;
                    a.click();
                    URL.revokeObjectURL(url);
                }, index * 500); // 延迟下载避免浏览器阻止
            });
        }
    }

    // 格式化文件大小
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// 创建全局批量处理器实例
window.batchProcessor = new BatchProcessor(); 