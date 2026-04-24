// ========== d.js - macOS风格动画管理器 (重构版) ==========
// 所有动画持续时间 >= 1秒，防动画缺失，贴近macOS Sonoma风格

/**
 * 动画管理器 - 稳定版
 * 集中管理所有动画，确保动画不缺失、不冲突
 */
const AnimationManager = {
    // 动画配置 - 所有持续时间 >= 1秒
    config: {
        // 缓动函数 - macOS官方曲线
        easing: {
            standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
            decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
            accelerate: 'cubic-bezier(0.4, 0.0, 1.0, 1.0)',
            spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            smooth: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)'
        },
        // 持续时间配置 (毫秒) - 所有 >= 1000ms
        duration: {
            instant: 100,
            fast: 300,
            normal: 600,
            slow: 1000,      // 最小1秒
            slower: 1200,    // 标准窗口动画
            slowest: 1500, // 强调动画
            boot: 1500,
            genie: 1200      // Genie效果
        },
        // 性能优化
        gpu: {
            transform: 'translateZ(0)',
            backface: 'hidden',
            perspective: '1000px'
        }
    },

    // 动画状态跟踪 - 防止动画缺失和冲突
    state: {
        activeAnimations: new Map(),
        isAnimating: false,
        windowStates: new Map(),
        lastAnimationTime: 0
    },

    /**
     * 初始化动画系统
     */
    init() {
        this.createOverlay();
        this.setupGlobalListeners();
        console.log('🎬 macOS动画系统已初始化 (v2.0-stable)');
    },

    /**
     * 创建拖拽/调整大小遮罩层 - 防止动画中断
     */
    createOverlay() {
        if (document.getElementById('animation-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'animation-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 99999;
            background: transparent;
            cursor: default;
            display: none;
            touch-action: none;
            pointer-events: auto;
        `;
        document.body.appendChild(overlay);
        return overlay;
    },

    /**
     * 显示遮罩层 - 防止动画期间鼠标事件干扰
     */
    showOverlay(cursorStyle = 'default') {
        const overlay = document.getElementById('animation-overlay');
        if (overlay) {
            overlay.style.cursor = cursorStyle;
            overlay.style.display = 'block';
            this.state.isAnimating = true;
        }
    },

    /**
     * 隐藏遮罩层
     */
    hideOverlay() {
        const overlay = document.getElementById('animation-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            this.state.isAnimating = false;
        }
    },

    /**
     * 等待下一帧 - 确保动画流畅开始
     */
    async nextFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    },

    /**
     * 等待多帧 - 用于复杂动画准备
     */
    async waitFrames(count = 2) {
        for (let i = 0; i < count; i++) {
            await this.nextFrame();
        }
    },

    /**
     * 等待过渡/动画完成 - 带超时保护
     */
    async waitForAnimation(element, timeout = null) {
        if (!element) return;

        const duration = timeout || this.config.duration.slower;

        return new Promise((resolve) => {
            let resolved = false;

            const cleanup = () => {
                if (resolved) return;
                resolved = true;
                element.removeEventListener('transitionend', onEnd);
                element.removeEventListener('animationend', onEnd);
                element.removeEventListener('animationcancel', onCancel);
                clearTimeout(safetyTimeout);
                resolve();
            };

            const onEnd = (e) => {
                if (e.target === element) cleanup();
            };

            const onCancel = () => cleanup();

            const safetyTimeout = setTimeout(cleanup, duration + 200);

            element.addEventListener('transitionend', onEnd);
            element.addEventListener('animationend', onEnd);
            element.addEventListener('animationcancel', onCancel);
        });
    },

    /**
     * 应用CSS动画类 - 稳定版
     */
    async applyAnimation(element, animationClass, duration = null) {
        if (!element) return;

        const animId = `${element.id || 'unknown'}-${animationClass}-${Date.now()}`;

        // 检查是否有冲突动画
        if (this.state.activeAnimations.has(element)) {
            await this.cancelAnimation(element);
        }

        this.state.activeAnimations.set(element, animId);

        return new Promise(async (resolve) => {
            let resolved = false;
            const timeoutDuration = duration || this.config.duration.slower;

            const cleanup = () => {
                if (resolved) return;
                resolved = true;
                element.classList.remove(animationClass);
                element.removeEventListener('animationend', onEnd);
                element.removeEventListener('animationcancel', onCancel);
                clearTimeout(safetyTimeout);

                if (this.state.activeAnimations.get(element) === animId) {
                    this.state.activeAnimations.delete(element);
                }
                resolve();
            };

            const onEnd = (e) => {
                if (e.target === element) cleanup();
            };

            const onCancel = () => cleanup();

            element.addEventListener('animationend', onEnd, { once: false });
            element.addEventListener('animationcancel', onCancel, { once: true });

            const safetyTimeout = setTimeout(cleanup, timeoutDuration + 300);

            // 强制重绘后添加动画类
            element.offsetHeight;
            element.classList.add(animationClass);
        });
    },

    /**
     * 取消当前动画
     */
    async cancelAnimation(element) {
        if (!element) return;

        const activeAnim = this.state.activeAnimations.get(element);
        if (activeAnim) {
            // 获取所有动画类并移除
            const classes = Array.from(element.classList);
            const animClasses = classes.filter(c => c.startsWith('anim-'));
            animClasses.forEach(c => element.classList.remove(c));

            this.state.activeAnimations.delete(element);

            // 等待一帧确保取消生效
            await this.nextFrame();
        }
    },

    /**
     * 设置过渡效果 - 稳定版
     */
    setTransition(element, properties = 'all', duration = null, easing = null) {
        if (!element) return;

        const dur = (duration || this.config.duration.slower) + 'ms';
        const ease = easing || this.config.easing.spring;

        // 如果properties是数组，为每个属性设置
        if (Array.isArray(properties)) {
            const transitions = properties.map(prop => `${prop} ${dur} ${ease}`);
            element.style.transition = transitions.join(', ');
        } else {
            element.style.transition = `${properties} ${dur} ${ease}`;
        }

        // 设置will-change优化性能
        element.style.willChange = Array.isArray(properties) 
            ? properties.join(', ') 
            : properties;
    },

    /**
     * 清除过渡效果
     */
    clearTransition(element) {
        if (!element) return;
        element.style.transition = '';
        element.style.willChange = '';
    },

    /**
     * 窗口打开动画 - 1.2秒，带入场效果
     */
    async animateWindowOpen(windowElement) {
        if (!windowElement) return;

        const winId = windowElement.id || 'window-' + Date.now();

        // 防止重复动画
        if (this.state.windowStates.get(winId) === 'opening') return;
        this.state.windowStates.set(winId, 'opening');

        // 准备初始状态
        windowElement.style.opacity = '0';
        windowElement.style.transform = 'scale(0.88) translateY(40px)';
        windowElement.style.filter = 'blur(12px)';
        windowElement.style.transition = 'none';

        // 强制重绘
        await this.waitFrames(2);

        // 应用动画类
        this.showOverlay();
        await this.applyAnimation(windowElement, 'anim-window-open', this.config.duration.slower);
        this.hideOverlay();

        // 清理状态
        windowElement.style.opacity = '';
        windowElement.style.transform = '';
        windowElement.style.filter = '';
        windowElement.style.transition = '';

        this.state.windowStates.set(winId, 'open');

        // 发送resize消息
        this.notifyWindowResize(windowElement);
    },

    /**
     * 窗口关闭动画 - 0.8秒加速退出
     */
    async animateWindowClose(windowElement) {
        if (!windowElement) return;

        const winId = windowElement.id || 'unknown';
        this.state.windowStates.set(winId, 'closing');

        this.showOverlay();

        // 添加关闭动画类
        await this.applyAnimation(windowElement, 'anim-window-close', this.config.duration.fast);

        this.hideOverlay();
        this.state.windowStates.delete(winId);
    },

    /**
     * 窗口最小化动画 - Genie Effect (1.2秒)
     * macOS标志性神灯效果
     */
    async animateWindowMinimize(windowElement, dockRect, windowRect) {
        if (!windowElement || !dockRect || !windowRect) return;

        const winId = windowElement.id || 'unknown';
        this.state.windowStates.set(winId, 'minimizing');

        // 计算目标位置（Dock图标中心）
        const targetX = dockRect.left + dockRect.width / 2;
        const targetY = dockRect.top + dockRect.height / 2;
        const startX = windowRect.left + windowRect.width / 2;
        const startY = windowRect.top + windowRect.height / 2;

        // 计算变换
        const translateX = targetX - startX;
        const translateY = targetY - startY;

        // 准备动画
        windowElement.classList.add('window-minimizing');
        windowElement.style.transformOrigin = 'center center';

        this.showOverlay();

        // 使用CSS动画类
        await this.applyAnimation(windowElement, 'anim-window-minimize', this.config.duration.genie);

        // 动画完成后隐藏
        windowElement.style.display = 'none';
        windowElement.classList.remove('window-minimizing');
        windowElement.style.transform = '';
        windowElement.style.opacity = '';
        windowElement.style.filter = '';
        windowElement.style.clipPath = '';

        this.hideOverlay();
        this.state.windowStates.set(winId, 'minimized');
    },

    /**
     * 窗口从Dock恢复动画 - 反向Genie Effect (1.2秒)
     */
    async animateWindowRestore(windowElement, dockRect, originalRect) {
        if (!windowElement || !dockRect || !originalRect) return;

        const winId = windowElement.id || 'unknown';
        this.state.windowStates.set(winId, 'restoring');

        // 设置初始位置为原始位置
        windowElement.style.left = originalRect.left + 'px';
        windowElement.style.top = originalRect.top + 'px';
        windowElement.style.width = originalRect.width + 'px';
        windowElement.style.height = originalRect.height + 'px';
        windowElement.style.display = 'flex';

        // 准备动画状态
        windowElement.classList.add('window-restoring');

        this.showOverlay();

        // 应用恢复动画
        await this.applyAnimation(windowElement, 'anim-window-restore', this.config.duration.genie);

        // 清理
        windowElement.classList.remove('window-restoring');
        windowElement.style.transform = '';
        windowElement.style.opacity = '';
        windowElement.style.filter = '';
        windowElement.style.clipPath = '';

        this.hideOverlay();
        this.state.windowStates.set(winId, 'open');

        // 发送resize消息
        this.notifyWindowResize(windowElement);
    },

    /**
     * 窗口全屏切换动画 (1.0秒)
     */
    async animateWindowFullscreen(windowElement, isFullscreen, targetRect) {
        if (!windowElement || !targetRect) return;

        const winId = windowElement.id || 'unknown';
        this.state.windowStates.set(winId, isFullscreen ? 'fullscreening' : 'exiting-fullscreen');

        this.showOverlay();

        // 设置目标尺寸
        this.setTransition(windowElement, 
            ['width', 'height', 'left', 'top'], 
            this.config.duration.slow, 
            this.config.easing.spring
        );

        windowElement.style.left = targetRect.left + 'px';
        windowElement.style.top = targetRect.top + 'px';
        windowElement.style.width = targetRect.width + 'px';
        windowElement.style.height = targetRect.height + 'px';

        // 等待过渡完成
        await this.waitForAnimation(windowElement, this.config.duration.slow + 100);

        this.clearTransition(windowElement);
        this.hideOverlay();

        this.state.windowStates.set(winId, isFullscreen ? 'fullscreen' : 'open');

        // 发送resize消息
        this.notifyWindowResize(windowElement);
    },

    /**
     * 窗口获得焦点动画
     */
    async animateWindowFocus(windowElement) {
        if (!windowElement) return;

        // 移除之前的焦点动画
        windowElement.classList.remove('anim-window-focus');
        await this.nextFrame();

        // 应用新的焦点动画
        await this.applyAnimation(windowElement, 'anim-window-focus', this.config.duration.slowest);
    },

    /**
     * Dock图标弹跳动画
     */
    async animateDockBounce(dockItem) {
        if (!dockItem) return;
        await this.applyAnimation(dockItem, 'anim-dock-bounce', 600);
    },

    /**
     * Dock图标出现动画 - 带延迟
     */
    async animateDockItemAppear(dockItem, delay = 0) {
        if (!dockItem) return;

        dockItem.style.opacity = '0';
        await this.nextFrame();

        setTimeout(async () => {
            await this.applyAnimation(dockItem, 'anim-dock-item-pop', this.config.duration.slow);
        }, delay);
    },

    /**
     * 桌面图标交错出现
     */
    async animateDesktopIconsStagger() {
        const icons = document.querySelectorAll('.desktop-icon');

        icons.forEach((icon, index) => {
            setTimeout(async () => {
                await this.applyAnimation(icon, 'anim-icon-fade-in', this.config.duration.slow);
            }, index * 100); // 每个图标延迟100ms
        });
    },

    /**
     * 控制中心显示动画
     */
    async animateControlCenterShow(controlCenter) {
        if (!controlCenter) return;

        controlCenter.style.opacity = '0';
        await this.nextFrame();

        await this.applyAnimation(controlCenter, 'anim-control-center', this.config.duration.slower);

        // 模块交错动画
        const modules = controlCenter.querySelectorAll('.cc-module');
        modules.forEach((mod, index) => {
            setTimeout(() => {
                this.applyAnimation(mod, 'anim-module-stagger', this.config.duration.normal);
            }, index * 80);
        });
    },

    /**
     * 右键菜单显示
     */
    async animateContextMenu(menu) {
        if (!menu) return;

        menu.style.opacity = '0';
        await this.nextFrame();

        await this.applyAnimation(menu, 'anim-context-menu', this.config.duration.slow);
    },

    /**
     * 拖拽开始视觉反馈
     */
    async animateDragStart(windowElement) {
        if (!windowElement) return;

        windowElement.classList.add('window-dragging');
        await this.applyAnimation(windowElement, 'anim-drag-lift', 300);
    },

    /**
     * 拖拽结束
     */
    animateDragEnd(windowElement) {
        if (!windowElement) return;
        windowElement.classList.remove('window-dragging');
        windowElement.style.transform = '';
        windowElement.style.boxShadow = '';
    },

    /**
     * 调整大小开始
     */
    animateResizeStart(windowElement) {
        if (!windowElement) return;
        windowElement.classList.add('window-resizing');
    },

    /**
     * 调整大小结束
     */
    animateResizeEnd(windowElement) {
        if (!windowElement) return;
        windowElement.classList.remove('window-resizing');
        this.notifyWindowResize(windowElement);
    },

    /**
     * 启动开机动画序列
     */
    async startBootSequence(bootScreen, progressBar, onComplete) {
        if (!bootScreen) return;

        // Logo脉冲动画
        const logo = bootScreen.querySelector('.boot-logo');
        if (logo) {
            logo.classList.add('anim-logo-pulse');
        }

        // 进度条动画
        let progress = 0;
        const updateInterval = 50; // 每50ms更新
        const totalTime = this.config.duration.boot;
        const increment = 100 / (totalTime / updateInterval);

        const progressInterval = setInterval(() => {
            progress += increment + (Math.random() * 2 - 1); // 添加随机性
            progress = Math.min(progress, 100);

            if (progressBar) {
                progressBar.style.width = progress + '%';
            }

            if (progress >= 100) {
                clearInterval(progressInterval);
                setTimeout(() => {
                    bootScreen.classList.add('hide-boot');
                    setTimeout(() => {
                        bootScreen.style.display = 'none';
                        if (onComplete) onComplete();
                    }, 800);
                }, 300);
            }
        }, updateInterval);

        // 安全超时
        setTimeout(() => {
            clearInterval(progressInterval);
            if (progressBar) progressBar.style.width = '100%';
            bootScreen.classList.add('hide-boot');
            setTimeout(() => {
                bootScreen.style.display = 'none';
                if (onComplete) onComplete();
            }, 800);
        }, totalTime + 1000);
    },

    /**
     * 通知窗口内容调整大小
     */
    notifyWindowResize(windowElement) {
        const iframe = windowElement.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
            const rect = windowElement.querySelector('.window-content')?.getBoundingClientRect();
            if (rect) {
                iframe.contentWindow.postMessage({
                    type: 'resize',
                    width: rect.width,
                    height: rect.height
                }, '*');
            }
        }
    },

    /**
     * 设置全局事件监听
     */
    setupGlobalListeners() {
        // 监听减少动画偏好
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mediaQuery.matches) {
            document.body.classList.add('reduce-motion');
        }

        mediaQuery.addEventListener('change', (e) => {
            if (e.matches) {
                document.body.classList.add('reduce-motion');
            } else {
                document.body.classList.remove('reduce-motion');
            }
        });
    },

    /**
     * 获取窗口当前状态
     */
    getWindowState(windowElement) {
        if (!windowElement) return null;
        return this.state.windowStates.get(windowElement.id) || 'unknown';
    },

    /**
     * 检查是否正在动画中
     */
    isAnimating(windowElement) {
        if (windowElement) {
            return this.state.activeAnimations.has(windowElement);
        }
        return this.state.isAnimating;
    }
};

// 初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AnimationManager.init());
} else {
    AnimationManager.init();
}

// 导出
window.AnimationManager = AnimationManager;

// 兼容性导出
window.macOSAnimation = AnimationManager;
