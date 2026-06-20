// 图像编辑器主控制器
class ImageEditor {
    constructor() {
        this.processor = null;
        this.overlay = null;
        this.canvas = null;
        this.originalImage = null;
        this.currentFilename = '';
        this.isActive = false;
        this.cropMode = false;
        this.cropSelection = null;
        this.resizeLinked = true;
        this.originalDimensions = { width: 0, height: 0 };
        
        this.init();
    }

    // 初始化编辑器
    init() {
        this.createEditorOverlay();
        this.bindEvents();
    }

    // 创建编辑器界面
    createEditorOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'image-editor-overlay';
        this.overlay.innerHTML = `
            <div class="image-editor-header">
                <div class="image-editor-title">
                    <i class="ri-image-edit-line"></i>
                    <span>图像编辑器</span>
                </div>
                <div class="image-editor-actions">
                    <button class="editor-btn editor-btn-secondary" id="resetEditor">
                        <i class="ri-refresh-line"></i>
                        <span>重置</span>
                    </button>
                    <button class="editor-btn editor-btn-primary" id="saveEditor">
                        <i class="ri-download-line"></i>
                        <span>保存</span>
                    </button>
                    <button class="editor-btn editor-btn-danger" id="closeEditor">
                        <i class="ri-close-line"></i>
                        <span>关闭</span>
                    </button>
                </div>
            </div>
            <div class="image-editor-content">
                <div class="image-editor-canvas-container">
                    <canvas class="image-editor-canvas" id="editorCanvas"></canvas>
                    <div class="editor-crop-overlay" id="cropOverlay" style="display: none;"></div>
                </div>
                <div class="image-editor-sidebar">
                    <!-- 滤镜预设 -->
                    <div class="editor-section">
                        <div class="editor-section-title">
                            <i class="ri-palette-line"></i>
                            <span>滤镜预设</span>
                        </div>
                        <div class="editor-filter-presets">
                            <button class="filter-preset-btn active" data-preset="original">原图</button>
                            <button class="filter-preset-btn" data-preset="bw">黑白</button>
                            <button class="filter-preset-btn" data-preset="sepia">复古</button>
                            <button class="filter-preset-btn" data-preset="vintage">怀旧</button>
                            <button class="filter-preset-btn" data-preset="bright">明亮</button>
                            <button class="filter-preset-btn" data-preset="contrast">高对比</button>
                        </div>
                    </div>

                    <!-- 色彩调整 -->
                    <div class="editor-section">
                        <div class="editor-section-title">
                            <i class="ri-contrast-2-line"></i>
                            <span>色彩调整</span>
                        </div>
                        <div class="editor-control-group">
                            <div class="editor-control-label">
                                <span>亮度</span>
                                <span class="editor-control-value" id="brightnessValue">100%</span>
                            </div>
                            <input type="range" class="editor-slider" id="brightnessSlider" 
                                   min="0" max="200" value="100" step="1">
                        </div>
                        <div class="editor-control-group">
                            <div class="editor-control-label">
                                <span>对比度</span>
                                <span class="editor-control-value" id="contrastValue">100%</span>
                            </div>
                            <input type="range" class="editor-slider" id="contrastSlider" 
                                   min="0" max="200" value="100" step="1">
                        </div>
                        <div class="editor-control-group">
                            <div class="editor-control-label">
                                <span>饱和度</span>
                                <span class="editor-control-value" id="saturationValue">100%</span>
                            </div>
                            <input type="range" class="editor-slider" id="saturationSlider" 
                                   min="0" max="200" value="100" step="1">
                        </div>
                    </div>

                    <!-- 效果调整 -->
                    <div class="editor-section">
                        <div class="editor-section-title">
                            <i class="ri-magic-line"></i>
                            <span>特效</span>
                        </div>
                        <div class="editor-control-group">
                            <div class="editor-control-label">
                                <span>模糊</span>
                                <span class="editor-control-value" id="blurValue">0px</span>
                            </div>
                            <input type="range" class="editor-slider" id="blurSlider" 
                                   min="0" max="20" value="0" step="0.5">
                        </div>
                        <div class="editor-control-group">
                            <div class="editor-control-label">
                                <span>复古效果</span>
                                <span class="editor-control-value" id="vintageValue">0%</span>
                            </div>
                            <input type="range" class="editor-slider" id="vintageSlider" 
                                   min="0" max="100" value="0" step="1">
                        </div>
                        <div class="editor-control-group">
                            <div class="editor-control-label">
                                <span>棕褐色</span>
                                <span class="editor-control-value" id="sepiaValue">0%</span>
                            </div>
                            <input type="range" class="editor-slider" id="sepiaSlider" 
                                   min="0" max="100" value="0" step="1">
                        </div>
                    </div>

                    <!-- 变换工具 -->
                    <div class="editor-section">
                        <div class="editor-section-title">
                            <i class="ri-refresh-line"></i>
                            <span>变换</span>
                        </div>
                        <div class="editor-transform-controls">
                            <button class="transform-btn" id="rotateLeft">
                                <i class="ri-rotate-lock-line"></i>
                                <span>左转90°</span>
                            </button>
                            <button class="transform-btn" id="rotateRight">
                                <i class="ri-rotate-lock-fill"></i>
                                <span>右转90°</span>
                            </button>
                            <button class="transform-btn" id="flipHorizontal">
                                <i class="ri-flip-horizontal-line"></i>
                                <span>水平翻转</span>
                            </button>
                            <button class="transform-btn" id="flipVertical">
                                <i class="ri-flip-vertical-line"></i>
                                <span>垂直翻转</span>
                            </button>
                        </div>
                    </div>

                    <!-- 尺寸调整 -->
                    <div class="editor-section">
                        <div class="editor-section-title">
                            <i class="ri-aspect-ratio-line"></i>
                            <span>尺寸调整</span>
                        </div>
                        <div class="editor-resize-controls">
                            <input type="number" class="resize-input" id="widthInput" placeholder="宽度">
                            <button class="resize-link-btn active" id="linkDimensions">
                                <i class="ri-link"></i>
                            </button>
                            <input type="number" class="resize-input" id="heightInput" placeholder="高度">
                        </div>
                        <div style="margin-top: 0.5rem;">
                            <button class="editor-btn editor-btn-secondary" id="applyResize" style="width: 100%;">
                                <i class="ri-check-line"></i>
                                <span>应用尺寸</span>
                            </button>
                        </div>
                    </div>

                    <!-- 裁剪工具 -->
                    <div class="editor-section">
                        <div class="editor-section-title">
                            <i class="ri-crop-line"></i>
                            <span>裁剪</span>
                        </div>
                        <div style="display: grid; gap: 0.5rem;">
                            <button class="editor-btn editor-btn-secondary" id="startCrop">
                                <i class="ri-crop-line"></i>
                                <span>开始裁剪</span>
                            </button>
                            <button class="editor-btn editor-btn-primary" id="applyCrop" style="display: none;">
                                <i class="ri-check-line"></i>
                                <span>确认裁剪</span>
                            </button>
                            <button class="editor-btn editor-btn-danger" id="cancelCrop" style="display: none;">
                                <i class="ri-close-line"></i>
                                <span>取消裁剪</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="editor-progress" id="editorProgress" style="display: none;">
                <div class="editor-progress-spinner"></div>
                <div>正在处理图像...</div>
            </div>
        `;
        
        document.body.appendChild(this.overlay);
        this.canvas = document.getElementById('editorCanvas');
    }

    // 绑定事件
    bindEvents() {
        // 关闭编辑器
        document.getElementById('closeEditor').addEventListener('click', () => {
            this.close();
        });

        // 重置编辑器
        document.getElementById('resetEditor').addEventListener('click', () => {
            this.reset();
        });

        // 保存图像
        document.getElementById('saveEditor').addEventListener('click', () => {
            this.save();
        });

        // 滤镜预设
        document.querySelectorAll('.filter-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyPreset(btn.dataset.preset);
                document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // 绑定滑块控制
        this.bindSlider('brightnessSlider', 'brightnessValue', (value) => {
            this.processor.applyBrightness(value);
            document.getElementById('brightnessValue').textContent = value + '%';
        });

        this.bindSlider('contrastSlider', 'contrastValue', (value) => {
            this.processor.applyContrast(value);
            document.getElementById('contrastValue').textContent = value + '%';
        });

        this.bindSlider('saturationSlider', 'saturationValue', (value) => {
            this.processor.applySaturation(value);
            document.getElementById('saturationValue').textContent = value + '%';
        });

        this.bindSlider('blurSlider', 'blurValue', (value) => {
            this.processor.applyBlur(value);
            document.getElementById('blurValue').textContent = value + 'px';
        });

        this.bindSlider('vintageSlider', 'vintageValue', (value) => {
            this.processor.applyVintage(value);
            document.getElementById('vintageValue').textContent = value + '%';
        });

        this.bindSlider('sepiaSlider', 'sepiaValue', (value) => {
            this.processor.applySepia(value);
            document.getElementById('sepiaValue').textContent = value + '%';
        });

        // 变换控制
        document.getElementById('rotateLeft').addEventListener('click', () => {
            this.processor.rotate(-90);
            this.updateDimensionInputs();
        });

        document.getElementById('rotateRight').addEventListener('click', () => {
            this.processor.rotate(90);
            this.updateDimensionInputs();
        });

        document.getElementById('flipHorizontal').addEventListener('click', () => {
            this.processor.flip(true);
        });

        document.getElementById('flipVertical').addEventListener('click', () => {
            this.processor.flip(false);
        });

        // ESC键关闭编辑器
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isActive) {
                this.close();
            }
        });
    }

    // 绑定滑块事件
    bindSlider(sliderId, valueId, callback) {
        const slider = document.getElementById(sliderId);
        slider.addEventListener('input', (e) => {
            callback(e.target.value);
        });
    }

    // 打开编辑器
    open(imageElement, filename = '') {
        this.originalImage = imageElement;
        this.currentFilename = filename || 'edited-image.jpg';
        
        // 初始化图像处理器
        this.processor = new ImageProcessor();
        const canvas = this.processor.init(imageElement);
        
        // 替换编辑器中的画布
        const container = this.canvas.parentNode;
        container.removeChild(this.canvas);
        this.canvas = canvas;
        this.canvas.className = 'image-editor-canvas';
        this.canvas.id = 'editorCanvas';
        container.appendChild(this.canvas);
        
        // 记录原始尺寸
        this.originalDimensions = {
            width: imageElement.naturalWidth,
            height: imageElement.naturalHeight
        };
        
        // 显示编辑器
        this.overlay.classList.add('active');
        this.isActive = true;
        
        // 禁用页面滚动
        document.body.style.overflow = 'hidden';
    }

    // 关闭编辑器
    close() {
        this.overlay.classList.remove('active');
        this.isActive = false;
        this.cropMode = false;
        
        // 恢复页面滚动
        document.body.style.overflow = '';
        
        // 重置状态
        this.reset();
    }

    // 重置编辑器
    reset() {
        if (this.processor && this.originalImage) {
            this.processor.reset();
            this.updateSliders();
            
            // 重置滤镜预设选择
            document.querySelectorAll('.filter-preset-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector('[data-preset="original"]').classList.add('active');
        }
    }

    // 更新滑块值
    updateSliders() {
        document.getElementById('brightnessSlider').value = 100;
        document.getElementById('brightnessValue').textContent = '100%';
        document.getElementById('contrastSlider').value = 100;
        document.getElementById('contrastValue').textContent = '100%';
        document.getElementById('saturationSlider').value = 100;
        document.getElementById('saturationValue').textContent = '100%';
        document.getElementById('blurSlider').value = 0;
        document.getElementById('blurValue').textContent = '0px';
        document.getElementById('vintageSlider').value = 0;
        document.getElementById('vintageValue').textContent = '0%';
        document.getElementById('sepiaSlider').value = 0;
        document.getElementById('sepiaValue').textContent = '0%';
    }

    // 更新尺寸输入框
    updateDimensionInputs() {
        if (this.processor) {
            document.getElementById('widthInput').value = this.processor.canvas.width;
            document.getElementById('heightInput').value = this.processor.canvas.height;
            this.originalDimensions = {
                width: this.processor.canvas.width,
                height: this.processor.canvas.height
            };
        }
    }

    // 应用滤镜预设
    applyPreset(preset) {
        if (!this.processor) return;
        
        // 先重置
        this.processor.reset();
        
        switch (preset) {
            case 'bw':
                this.processor.applyBlackAndWhite(100);
                break;
            case 'sepia':
                this.processor.applySepia(80);
                break;
            case 'vintage':
                this.processor.applyVintage(60);
                this.processor.applyContrast(110);
                this.processor.applySaturation(80);
                break;
            case 'bright':
                this.processor.applyBrightness(120);
                this.processor.applyContrast(105);
                break;
            case 'contrast':
                this.processor.applyContrast(140);
                this.processor.applySaturation(110);
                break;
            default: // original
                break;
        }
        
        this.updateSliders();
    }

    // 保存图像
    async save() {
        if (!this.processor) return;
        
        try {
            // 显示进度指示器
            document.getElementById('editorProgress').style.display = 'block';
            
            // 获取处理后的图像文件
            const processedFile = await this.processor.getProcessedImageFile(this.currentFilename);
            
            // 创建下载链接
            const url = URL.createObjectURL(processedFile);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.currentFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // 隐藏进度指示器
            document.getElementById('editorProgress').style.display = 'none';
            
            // 显示成功消息
            this.showMessage('图像已保存成功！', 'success');
            
        } catch (error) {
            console.error('保存图像失败:', error);
            document.getElementById('editorProgress').style.display = 'none';
            this.showMessage('保存图像失败，请重试', 'error');
        }
    }

    // 显示消息
    showMessage(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// 初始化图像编辑器
window.imageEditor = new ImageEditor(); 