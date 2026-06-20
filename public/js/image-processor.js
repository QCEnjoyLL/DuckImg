// 图像处理模块
class ImageProcessor {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.originalImageData = null;
        this.currentImageData = null;
        this.filters = {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            hue: 0,
            blur: 0,
            sharpen: 0,
            vintage: 0,
            sepia: 0,
            blackAndWhite: 0
        };
    }

    // 初始化图像处理器
    init(imageElement) {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 设置画布尺寸
        this.canvas.width = imageElement.naturalWidth;
        this.canvas.height = imageElement.naturalHeight;
        
        // 绘制原始图像
        this.ctx.drawImage(imageElement, 0, 0);
        
        // 保存原始图像数据
        this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        return this.canvas;
    }

    // 应用亮度调整
    applyBrightness(value) {
        this.filters.brightness = value;
        this.applyFilters();
    }

    // 应用对比度调整
    applyContrast(value) {
        this.filters.contrast = value;
        this.applyFilters();
    }

    // 应用饱和度调整
    applySaturation(value) {
        this.filters.saturation = value;
        this.applyFilters();
    }

    // 应用色相调整
    applyHue(value) {
        this.filters.hue = value;
        this.applyFilters();
    }

    // 应用模糊效果
    applyBlur(value) {
        this.filters.blur = value;
        this.applyFilters();
    }

    // 应用锐化效果
    applySharpen(value) {
        this.filters.sharpen = value;
        this.applyFilters();
    }

    // 应用复古效果
    applyVintage(value) {
        this.filters.vintage = value;
        this.applyFilters();
    }

    // 应用棕褐色效果
    applySepia(value) {
        this.filters.sepia = value;
        this.applyFilters();
    }

    // 应用黑白效果
    applyBlackAndWhite(value) {
        this.filters.blackAndWhite = value;
        this.applyFilters();
    }

    // 应用所有滤镜
    applyFilters() {
        // 从原始图像数据开始
        const imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );

        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            
            // 应用亮度
            if (this.filters.brightness !== 100) {
                const factor = this.filters.brightness / 100;
                r *= factor;
                g *= factor;
                b *= factor;
            }
            
            // 应用对比度
            if (this.filters.contrast !== 100) {
                const factor = (259 * (this.filters.contrast + 255)) / (255 * (259 - this.filters.contrast));
                r = factor * (r - 128) + 128;
                g = factor * (g - 128) + 128;
                b = factor * (b - 128) + 128;
            }
            
            // 应用饱和度
            if (this.filters.saturation !== 100) {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                const factor = this.filters.saturation / 100;
                r = gray + (r - gray) * factor;
                g = gray + (g - gray) * factor;
                b = gray + (b - gray) * factor;
            }
            
            // 应用黑白效果
            if (this.filters.blackAndWhite > 0) {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                const factor = this.filters.blackAndWhite / 100;
                r = r + (gray - r) * factor;
                g = g + (gray - g) * factor;
                b = b + (gray - b) * factor;
            }
            
            // 应用棕褐色效果
            if (this.filters.sepia > 0) {
                const factor = this.filters.sepia / 100;
                const newR = (r * 0.393) + (g * 0.769) + (b * 0.189);
                const newG = (r * 0.349) + (g * 0.686) + (b * 0.168);
                const newB = (r * 0.272) + (g * 0.534) + (b * 0.131);
                
                r = r + (newR - r) * factor;
                g = g + (newG - g) * factor;
                b = b + (newB - b) * factor;
            }
            
            // 应用复古效果
            if (this.filters.vintage > 0) {
                const factor = this.filters.vintage / 100;
                r = r + (r * 0.2 - 10) * factor;
                g = g + (g * 0.1 - 5) * factor;
                b = b + (b * 0.05 - 15) * factor;
            }
            
            // 限制色值范围
            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
        
        // 更新画布
        this.currentImageData = imageData;
        this.ctx.putImageData(imageData, 0, 0);
        
        // 应用模糊效果
        if (this.filters.blur > 0) {
            this.ctx.filter = `blur(${this.filters.blur}px)`;
            this.ctx.drawImage(this.canvas, 0, 0);
            this.ctx.filter = 'none';
        }
    }

    // 重置所有滤镜
    reset() {
        this.filters = {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            hue: 0,
            blur: 0,
            sharpen: 0,
            vintage: 0,
            sepia: 0,
            blackAndWhite: 0
        };
        this.ctx.putImageData(this.originalImageData, 0, 0);
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    // 获取处理后的图像数据URL
    getProcessedImageDataURL(format = 'image/jpeg', quality = 0.9) {
        return this.canvas.toDataURL(format, quality);
    }

    // 获取处理后的图像文件
    getProcessedImageFile(filename, format = 'image/jpeg', quality = 0.9) {
        return new Promise((resolve) => {
            this.canvas.toBlob((blob) => {
                const file = new File([blob], filename, { type: format });
                resolve(file);
            }, format, quality);
        });
    }

    // 图像尺寸调整
    resize(width, height, maintainAspectRatio = true) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        if (maintainAspectRatio) {
            const aspectRatio = this.canvas.width / this.canvas.height;
            if (width / height > aspectRatio) {
                width = height * aspectRatio;
            } else {
                height = width / aspectRatio;
            }
        }
        
        tempCanvas.width = width;
        tempCanvas.height = height;
        
        // 使用高质量缩放
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(this.canvas, 0, 0, width, height);
        
        // 更新主画布
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.drawImage(tempCanvas, 0, 0);
        
        // 更新图像数据
        this.originalImageData = this.ctx.getImageData(0, 0, width, height);
        this.currentImageData = this.ctx.getImageData(0, 0, width, height);
    }

    // 图像裁剪
    crop(x, y, width, height) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = width;
        tempCanvas.height = height;
        
        tempCtx.drawImage(this.canvas, x, y, width, height, 0, 0, width, height);
        
        // 更新主画布
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.drawImage(tempCanvas, 0, 0);
        
        // 更新图像数据
        this.originalImageData = this.ctx.getImageData(0, 0, width, height);
        this.currentImageData = this.ctx.getImageData(0, 0, width, height);
    }

    // 图像旋转
    rotate(degrees) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        const radians = degrees * Math.PI / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        
        const newWidth = this.canvas.height * sin + this.canvas.width * cos;
        const newHeight = this.canvas.height * cos + this.canvas.width * sin;
        
        tempCanvas.width = newWidth;
        tempCanvas.height = newHeight;
        
        tempCtx.translate(newWidth / 2, newHeight / 2);
        tempCtx.rotate(radians);
        tempCtx.drawImage(this.canvas, -this.canvas.width / 2, -this.canvas.height / 2);
        
        // 更新主画布
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        this.ctx.clearRect(0, 0, newWidth, newHeight);
        this.ctx.drawImage(tempCanvas, 0, 0);
        
        // 更新图像数据
        this.originalImageData = this.ctx.getImageData(0, 0, newWidth, newHeight);
        this.currentImageData = this.ctx.getImageData(0, 0, newWidth, newHeight);
    }

    // 图像翻转
    flip(horizontal = true) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        
        tempCtx.save();
        if (horizontal) {
            tempCtx.scale(-1, 1);
            tempCtx.translate(-this.canvas.width, 0);
        } else {
            tempCtx.scale(1, -1);
            tempCtx.translate(0, -this.canvas.height);
        }
        tempCtx.drawImage(this.canvas, 0, 0);
        tempCtx.restore();
        
        // 更新主画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(tempCanvas, 0, 0);
        
        // 更新图像数据
        this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
}

// 导出图像处理器类
window.ImageProcessor = ImageProcessor; 