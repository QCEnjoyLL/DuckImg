/**
 * 极致美化交互效果 - 鸭鸭图床
 * 现代化微交互和视觉增强系统
 */

class BeautyEffects {
    constructor() {
        this.init();
    }

    init() {
        this.initParticleBackground();
        this.initScrollAnimations();
        this.initHoverEffects();
        this.initNotificationSystem();
        this.initImageEffects();
        this.bindEvents();
    }

    // 初始化粒子背景
    initParticleBackground() {
        const particlesContainer = document.createElement('div');
        particlesContainer.className = 'particles-beauty';
        document.body.appendChild(particlesContainer);

        // 创建30个粒子
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            // 随机位置
            particle.style.left = Math.random() * 100 + '%';
            particle.style.top = Math.random() * 100 + '%';
            
            // 随机延迟
            particle.style.animationDelay = Math.random() * 6 + 's';
            
            particlesContainer.appendChild(particle);
        }
    }

    // 初始化滚动动画
    initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-beauty-fadeIn');
                }
            });
        }, observerOptions);

        // 观察所有卡片和按钮
        document.querySelectorAll('.card-beauty, .btn-beauty, .input-beauty').forEach(el => {
            observer.observe(el);
        });
    }

    // 初始化悬停效果
    initHoverEffects() {
        // 为菜单项添加特殊悬停效果
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                this.createRippleEffect(item);
            });
        });

        // 为按钮添加点击波纹效果
        document.querySelectorAll('.btn-beauty, .btn-beauty-accent, .btn-beauty-secondary').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.createClickRipple(e, btn);
            });
        });
    }

    // 创建涟漪效果
    createRippleEffect(element) {
        const ripple = document.createElement('div');
        ripple.style.position = 'absolute';
        ripple.style.width = '10px';
        ripple.style.height = '10px';
        ripple.style.background = 'rgba(102, 126, 234, 0.3)';
        ripple.style.borderRadius = '50%';
        ripple.style.transform = 'scale(0)';
        ripple.style.animation = 'ripple-beauty 0.6s linear';
        ripple.style.pointerEvents = 'none';
        
        const rect = element.getBoundingClientRect();
        ripple.style.left = '50%';
        ripple.style.top = '50%';
        ripple.style.marginLeft = '-5px';
        ripple.style.marginTop = '-5px';
        
        element.style.position = 'relative';
        element.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    // 创建点击涟漪效果
    createClickRipple(event, element) {
        const ripple = document.createElement('div');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        
        ripple.style.position = 'absolute';
        ripple.style.width = size + 'px';
        ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.style.background = 'rgba(255, 255, 255, 0.3)';
        ripple.style.borderRadius = '50%';
        ripple.style.transform = 'scale(0)';
        ripple.style.animation = 'click-ripple 0.6s ease-out';
        ripple.style.pointerEvents = 'none';
        
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    // 初始化通知系统
    initNotificationSystem() {
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.style.position = 'fixed';
        this.notificationContainer.style.top = '20px';
        this.notificationContainer.style.right = '20px';
        this.notificationContainer.style.zIndex = '9999';
        document.body.appendChild(this.notificationContainer);
    }

    // 显示美化通知
    showNotification(message, type = 'success', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification-beauty notification-beauty-${type}`;
        notification.textContent = message;
        
        this.notificationContainer.appendChild(notification);
        
        // 触发显示动画
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // 自动移除
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, duration);
    }

    // 初始化图片效果
    initImageEffects() {
        document.querySelectorAll('img').forEach(img => {
            img.addEventListener('load', () => {
                img.parentElement.classList.add('image-beauty');
            });
        });
    }

    // 绑定事件
    bindEvents() {
        // 为复制按钮添加成功反馈
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showNotification('链接已复制到剪贴板！', 'success');
            });
        });

        // 为上传按钮添加特殊效果
        const uploadBtns = document.querySelectorAll('#uploadBtn, .upload-btn');
        uploadBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.createUploadEffect(btn);
            });
        });

        // 监听主题切换
        document.addEventListener('themeChanged', (e) => {
            this.adaptToTheme(e.detail.theme === 'dark');
        });
    }

    // 创建上传效果
    createUploadEffect(button) {
        const icon = button.querySelector('i');
        if (icon) {
            icon.style.animation = 'beauty-bounce 0.6s ease-in-out';
            setTimeout(() => {
                icon.style.animation = '';
            }, 600);
        }
    }

    // 适应主题
    adaptToTheme(isDark) {
        const particles = document.querySelectorAll('.particle');
        particles.forEach(particle => {
            if (isDark) {
                particle.style.opacity = '0.8';
            } else {
                particle.style.opacity = '0.4';
            }
        });
    }

    // 添加页面加载完成动画
    static initPageLoadAnimation() {
        document.addEventListener('DOMContentLoaded', () => {
            // 为主要元素添加加载动画
            const elements = document.querySelectorAll('.upload-container, .side-menu, .header');
            elements.forEach((el, index) => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(30px)';
                
                setTimeout(() => {
                    el.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                    el.style.opacity = '1';
                    el.style.transform = 'translateY(0)';
                }, index * 200 + 300);
            });
        });
    }

    // 添加成功上传庆祝动画
    static celebrateUpload() {
        // 创建庆祝粒子
        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
        
        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.style.position = 'fixed';
            particle.style.width = '8px';
            particle.style.height = '8px';
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];
            particle.style.borderRadius = '50%';
            particle.style.pointerEvents = 'none';
            particle.style.zIndex = '10000';
            
            const startX = window.innerWidth / 2;
            const startY = window.innerHeight / 2;
            
            particle.style.left = startX + 'px';
            particle.style.top = startY + 'px';
            
            document.body.appendChild(particle);
            
            // 随机方向和距离
            const angle = (Math.PI * 2 * i) / 50;
            const velocity = 100 + Math.random() * 100;
            const endX = startX + Math.cos(angle) * velocity;
            const endY = startY + Math.sin(angle) * velocity;
            
            particle.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0)`, opacity: 0 }
            ], {
                duration: 1000 + Math.random() * 500,
                easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            }).addEventListener('finish', () => {
                particle.remove();
            });
        }
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple-beauty {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    @keyframes click-ripple {
        to {
            transform: scale(1);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// 初始化美化效果
document.addEventListener('DOMContentLoaded', () => {
    window.beautyEffects = new BeautyEffects();
    BeautyEffects.initPageLoadAnimation();
});

// 导出给其他脚本使用
window.BeautyEffects = BeautyEffects; 