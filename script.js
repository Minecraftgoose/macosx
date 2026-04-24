let windows = [];
window.windows = windows; 
let nextWindowId = 1;
let highestZ = 1000;
let activeWindow = null;

let dragState = { 
    active: false, 
    target: null, 
    startX: 0, 
    startY: 0, 
    startLeft: 0, 
    startTop: 0 
};

let resizeState = { 
    active: false, 
    target: null, 
    direction: '', 
    startX: 0, 
    startY: 0, 
    startWidth: 0, 
    startHeight: 0, 
    startLeft: 0, 
    startTop: 0 
};

let overlay = null;
let animationManager = null;

function getEventCoords(e) {
    if (e.touches && e.touches.length) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
}

const appConfig = {
    finder: { title: "访达", src: "apps/finder.html", defaultW: 650, defaultH: 450 },
    safari: { title: "Safari", src: "apps/safari.html", defaultW: 700, defaultH: 480 },
    calendar: { title: "日历", src: "apps/calendar.html", defaultW: 600, defaultH: 450 },
    photos: { title: "照片", src: "apps/photos.html", defaultW: 700, defaultH: 500 },
    settings: { title: "设置", src: "apps/settings.html", defaultW: 600, defaultH: 450 },
    weather:  { title: "天气", src: "apps/weather.html", defaultW: 700, defaultH: 480 },
    yd: { title: "有道", src: "https://youdao.com/", defaultW: 650, defaultH: 450 },
    about: { title: "关于本机", src: "apps/about.html", defaultW: 500, defaultH: 400 }
};

function getWindowsByApp(app) {
    return windows.filter(w => w.app === app);
}

function updateBadge(app) {
    const hasWin = windows.some(w => w.app === app && !w.minimized);
    const badge = document.querySelector(`.dock-item[data-app="${app}"] .badge`);
    if (badge) {
        badge.classList.toggle('active', hasWin);
        if (hasWin) {
            badge.classList.add('anim-badge-appear');
            setTimeout(() => badge.classList.remove('anim-badge-appear'), 800);
        }
    }
}

function focusWindow(winObj) {
    highestZ++;
    winObj.dom.style.zIndex = highestZ;
    winObj.zIndex = highestZ;
    activeWindow = winObj;

    // 触发 Dock 焦点事件
    window.dispatchEvent(new CustomEvent('windowFocused', {
        detail: { appName: winObj.app, windowId: winObj.id }
    }));

    // 同步深色模式
    syncDarkModeToWindow(winObj);

    // 使用动画管理器播放焦点动画
    if (animationManager && !animationManager.isAnimating(winObj.dom)) {
        animationManager.animateWindowFocus(winObj.dom).catch(() => {});
    }
}

function notifyResize(winObj) {
    const iframe = winObj.dom.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
        const rect = winObj.dom.querySelector('.window-content').getBoundingClientRect();
        iframe.contentWindow.postMessage({ 
            type: 'resize', 
            width: rect.width, 
            height: rect.height 
        }, '*');
    }
}

function syncDarkModeToWindow(winObj) {
    if (winObj.app === 'about') {
        const iframe = winObj.dom.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
            const isDark = document.body.classList.contains('dark-mode');
            iframe.contentWindow.postMessage({ 
                type: 'darkMode', 
                enabled: isDark 
            }, '*');
        }
    }
}

// ========== 窗口关闭动画 (稳定版) ==========
async function closeWindow(winObj) {
    // 触发 Dock 关闭事件
    window.dispatchEvent(new CustomEvent('appClosed', {
        detail: { appName: winObj.app, windowId: winObj.id }
    }));

    const dom = winObj.dom;

    // 防止重复关闭
    if (dom.classList.contains('window-closing')) return;
    dom.classList.add('window-closing');

    // 使用动画管理器
    if (animationManager) {
        await animationManager.animateWindowClose(dom);
    } else {
        // 降级方案
        dom.style.transition = 'all 0.8s cubic-bezier(0.4, 0.0, 1.0, 1.0)';
        dom.style.opacity = '0';
        dom.style.transform = 'scale(0.85)';
        await new Promise(r => setTimeout(r, 800));
    }

    // 清理
    dom.remove();
    windows = windows.filter(w => w.id !== winObj.id);
    updateBadge(winObj.app);

    if (activeWindow === winObj) {
        activeWindow = windows.length > 0 ? windows[windows.length - 1] : null;
        if (activeWindow) focusWindow(activeWindow);
    }
}

// ========== 窗口最小化动画 - Genie Effect (稳定版) ==========
async function minimizeWindow(winObj) {
    // 触发 Dock 最小化事件
    window.dispatchEvent(new CustomEvent('windowMinimized', {
        detail: { appName: winObj.app, windowId: winObj.id }
    }));

    if (winObj.minimized || winObj.isMinimizing) return;
    winObj.isMinimizing = true;

    const win = winObj.dom;
    const rect = win.getBoundingClientRect();

    // 保存原始位置和尺寸
    winObj.originalRect = { 
        left: rect.left, 
        top: rect.top, 
        width: rect.width, 
        height: rect.height 
    };

    const dockItem = document.querySelector(`.dock-item[data-app="${winObj.app}"]`);

    if (!dockItem) {
        // 无Dock图标，直接隐藏
        win.style.display = 'none';
        winObj.minimized = true;
        winObj.isMinimizing = false;
        updateBadge(winObj.app);
        return;
    }

    const dockRect = dockItem.getBoundingClientRect();

    // 使用动画管理器播放Genie效果
    if (animationManager) {
        await animationManager.animateWindowMinimize(win, dockRect, rect);
    } else {
        // 降级方案 - 简化版Genie
        const translateX = (dockRect.left + dockRect.width / 2) - (rect.left + rect.width / 2);
        const translateY = (dockRect.top + dockRect.height / 2) - (rect.top + rect.height / 2);

        win.style.transition = 'all 1.2s cubic-bezier(0.4, 0.0, 1.0, 1.0)';
        win.style.transform = `translate(${translateX}px, ${translateY}px) scale(0.1)`;
        win.style.opacity = '0';

        await new Promise(r => setTimeout(r, 1200));
    }

    // 动画完成后
    win.style.display = 'none';
    win.style.transform = '';
    win.style.opacity = '';
    win.style.transition = '';
    win.style.clipPath = '';
    win.style.filter = '';

    winObj.minimized = true;
    winObj.isMinimizing = false;
    updateBadge(winObj.app);

    // 切换焦点
    if (activeWindow === winObj) {
        const nextWindow = windows.find(w => !w.minimized && w.id !== winObj.id);
        if (nextWindow) focusWindow(nextWindow);
    }
}

// ========== 窗口恢复动画 - 反向Genie Effect (稳定版) ==========
async function restoreWindow(winObj) {
    // 触发 Dock 恢复事件
    window.dispatchEvent(new CustomEvent('windowRestored', {
        detail: { appName: winObj.app, windowId: winObj.id }
    }));

    if (!winObj.minimized || winObj.isRestoring) return;
    winObj.isRestoring = true;

    const win = winObj.dom;
    const orig = winObj.originalRect;
    const dockItem = document.querySelector(`.dock-item[data-app="${winObj.app}"]`);

    if (!orig || !dockItem) {
        // 直接显示
        win.style.display = 'flex';
        winObj.minimized = false;
        winObj.isRestoring = false;
        updateBadge(winObj.app);
        focusWindow(winObj);
        return;
    }

    const dockRect = dockItem.getBoundingClientRect();

    // 设置初始位置
    win.style.left = `${orig.left}px`;
    win.style.top = `${orig.top}px`;
    win.style.width = `${orig.width}px`;
    win.style.height = `${orig.height}px`;
    win.style.display = 'flex';

    // 使用动画管理器
    if (animationManager) {
        await animationManager.animateWindowRestore(win, dockRect, orig);
    } else {
        // 降级方案
        win.style.transition = 'all 1.2s cubic-bezier(0.0, 0.0, 0.2, 1)';
        win.style.opacity = '0';
        win.style.transform = 'scale(0.1)';

        await new Promise(r => setTimeout(r, 50));

        win.style.opacity = '1';
        win.style.transform = 'scale(1)';

        await new Promise(r => setTimeout(r, 1200));
    }

    // 清理
    win.style.transform = '';
    win.style.opacity = '';
    win.style.transition = '';
    win.style.clipPath = '';
    win.style.filter = '';

    winObj.minimized = false;
    winObj.isRestoring = false;
    updateBadge(winObj.app);

    notifyResize(winObj);
    focusWindow(winObj);
}

// ========== 窗口全屏切换 (稳定版) ==========
async function toggleFullscreen(winObj) {
    const win = winObj.dom;
    const menuH = 28;
    const dockH = 78;

    // 防止重复触发
    if (winObj.isFullscreenTransitioning) return;
    winObj.isFullscreenTransitioning = true;

    if (!winObj.isFullscreen) {
        // 保存原始尺寸
        winObj.originalRect = {
            left: parseInt(win.style.left) || 0,
            top: parseInt(win.style.top) || 0,
            width: win.offsetWidth,
            height: win.offsetHeight
        };

        const targetRect = {
            left: 0,
            top: menuH,
            width: window.innerWidth,
            height: window.innerHeight - menuH - dockH
        };

        if (animationManager) {
            await animationManager.animateWindowFullscreen(win, true, targetRect);
        } else {
            win.style.transition = 'all 1.0s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            win.style.left = '0px';
            win.style.top = `${menuH}px`;
            win.style.width = '100%';
            win.style.height = `calc(100% - ${menuH + dockH}px)`;
            await new Promise(r => setTimeout(r, 1000));
        }

        winObj.isFullscreen = true;
    } else {
        const o = winObj.originalRect;

        if (animationManager) {
            await animationManager.animateWindowFullscreen(win, false, o);
        } else {
            win.style.transition = 'all 1.0s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            win.style.left = `${o.left}px`;
            win.style.top = `${o.top}px`;
            win.style.width = `${o.width}px`;
            win.style.height = `${o.height}px`;
            await new Promise(r => setTimeout(r, 1000));
        }

        winObj.isFullscreen = false;
    }

    // 清理
    win.style.transition = '';
    winObj.isFullscreenTransitioning = false;
    notifyResize(winObj);
}

// ========== 创建窗口 (稳定版) ==========
function createWindow(appName, left, top, width, height) {
    const app = appConfig[appName];
    if (!app) {
        console.error(`应用 ${appName} 不存在`);
        return null;
    }

    const winId = nextWindowId++;
    const winDiv = document.createElement('div');
    winDiv.className = 'window gpu-accelerated';
    winDiv.id = `window-${winId}`;
    winDiv.style.left = `${left}px`;
    winDiv.style.top = `${top}px`;
    winDiv.style.width = `${width}px`;
    winDiv.style.height = `${height}px`;
    winDiv.style.zIndex = ++highestZ;

    winDiv.innerHTML = `
        <div class="window-header">
            <div class="window-controls">
                <button class="window-close" title="关闭"></button>
                <button class="window-minimize" title="最小化"></button>
                <button class="window-maximize" title="全屏"></button>
            </div>
            <div class="window-title">${app.title}</div>
        </div>
        <div class="window-content">
            <iframe src="${app.src}" sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-top-navigation"></iframe>
        </div>
        <div class="resize-handle resize-nw" data-dir="nw"></div>
        <div class="resize-handle resize-ne" data-dir="ne"></div>
        <div class="resize-handle resize-sw" data-dir="sw"></div>
        <div class="resize-handle resize-se" data-dir="se"></div>
        <div class="resize-handle resize-n" data-dir="n"></div>
        <div class="resize-handle resize-s" data-dir="s"></div>
        <div class="resize-handle resize-w" data-dir="w"></div>
        <div class="resize-handle resize-e" data-dir="e"></div>
    `;

    document.body.appendChild(winDiv);

    const winObj = {
        id: winId,
        app: appName,
        dom: winDiv,
        minimized: false,
        zIndex: highestZ,
        isFullscreen: false,
        originalRect: null,
        isMinimizing: false,
        isRestoring: false,
        isFullscreenTransitioning: false
    };

    // 事件绑定
    winDiv.querySelector('.window-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeWindow(winObj);
    });

    winDiv.querySelector('.window-minimize').addEventListener('click', (e) => {
        e.stopPropagation();
        minimizeWindow(winObj);
    });

    winDiv.querySelector('.window-maximize').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen(winObj);
    });

    const header = winDiv.querySelector('.window-header');

    // 拖拽功能
    const startDrag = async (clientX, clientY) => {
        if (winObj.isFullscreen) {
            await toggleFullscreen(winObj);
        }

        dragState.active = true;
        dragState.target = winDiv;
        dragState.startX = clientX;
        dragState.startY = clientY;
        dragState.startLeft = parseInt(winDiv.style.left) || 0;
        dragState.startTop = parseInt(winDiv.style.top) || 0;

        focusWindow(winObj);

        // 拖拽视觉反馈
        if (animationManager) {
            await animationManager.animateDragStart(winDiv);
        } else {
            winDiv.classList.add('window-dragging');
        }
    };

    const onDragMove = (clientX, clientY) => {
        if (!dragState.active || dragState.target !== winDiv) return;

        const dx = clientX - dragState.startX;
        const dy = clientY - dragState.startY;
        let newLeft = dragState.startLeft + dx;
        let newTop = dragState.startTop + dy;

        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - winDiv.offsetWidth));
        newTop = Math.max(22, Math.min(newTop, window.innerHeight - winDiv.offsetHeight - 50));

        winDiv.style.left = `${newLeft}px`;
        winDiv.style.top = `${newTop}px`;
    };

    const stopDrag = () => {
        if (!dragState.active || dragState.target !== winDiv) return;
        dragState.active = false;
        dragState.target = null;

        if (animationManager) {
            animationManager.animateDragEnd(winDiv);
        } else {
            winDiv.classList.remove('window-dragging');
        }
    };

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.window-controls')) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
    });

    header.addEventListener('touchstart', (e) => {
        if (e.target.closest('.window-controls')) return;
        e.preventDefault();
        const coords = getEventCoords(e);
        startDrag(coords.clientX, coords.clientY);
    }, { passive: false });

    // 调整大小功能
    const handles = winDiv.querySelectorAll('.resize-handle');

    const startResize = (clientX, clientY, dir) => {
        if (winObj.isFullscreen) {
            toggleFullscreen(winObj);
        }

        resizeState.active = true;
        resizeState.target = winDiv;
        resizeState.direction = dir;
        resizeState.startX = clientX;
        resizeState.startY = clientY;
        resizeState.startWidth = winDiv.offsetWidth;
        resizeState.startHeight = winDiv.offsetHeight;
        resizeState.startLeft = parseInt(winDiv.style.left) || 0;
        resizeState.startTop = parseInt(winDiv.style.top) || 0;

        focusWindow(winObj);

        if (animationManager) {
            animationManager.animateResizeStart(winDiv);
        } else {
            winDiv.classList.add('window-resizing');
        }
    };

    const onResizeMove = (clientX, clientY) => {
        if (!resizeState.active || resizeState.target !== winDiv) return;

        const dx = clientX - resizeState.startX;
        const dy = clientY - resizeState.startY;
        let newWidth = resizeState.startWidth;
        let newHeight = resizeState.startHeight;
        let newLeft = resizeState.startLeft;
        let newTop = resizeState.startTop;
        const dir = resizeState.direction;
        const minW = 400;
        const minH = 300;

        if (dir.includes('e')) {
            newWidth = Math.max(minW, resizeState.startWidth + dx);
        }
        if (dir.includes('w')) {
            newWidth = Math.max(minW, resizeState.startWidth - dx);
            newLeft = resizeState.startLeft + (resizeState.startWidth - newWidth);
        }
        if (dir.includes('s')) {
            newHeight = Math.max(minH, resizeState.startHeight + dy);
        }
        if (dir.includes('n')) {
            newHeight = Math.max(minH, resizeState.startHeight - dy);
            newTop = resizeState.startTop + (resizeState.startHeight - newHeight);
        }

        // 边界限制
        if (newLeft < 0) {
            newWidth += newLeft;
            newLeft = 0;
        }
        if (newTop < 22) {
            newHeight += newTop - 22;
            newTop = 22;
        }
        if (newLeft + newWidth > window.innerWidth) {
            newWidth = window.innerWidth - newLeft;
        }
        if (newTop + newHeight > window.innerHeight - 50) {
            newHeight = window.innerHeight - 50 - newTop;
        }

        winDiv.style.width = `${newWidth}px`;
        winDiv.style.height = `${newHeight}px`;
        winDiv.style.left = `${newLeft}px`;
        winDiv.style.top = `${newTop}px`;

        notifyResize(winObj);
    };

    const stopResize = () => {
        if (!resizeState.active || resizeState.target !== winDiv) return;
        resizeState.active = false;
        resizeState.target = null;

        if (animationManager) {
            animationManager.animateResizeEnd(winDiv);
        } else {
            winDiv.classList.remove('window-resizing');
        }
    };

    handles.forEach(handle => {
        const dir = handle.getAttribute('data-dir');
        if (!dir) return;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(e.clientX, e.clientY, dir);
        });

        handle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const coords = getEventCoords(e);
            startResize(coords.clientX, coords.clientY, dir);
        }, { passive: false });
    });

    // 全局事件
    const globalMouseMove = (e) => {
        if (dragState.active) onDragMove(e.clientX, e.clientY);
        if (resizeState.active) onResizeMove(e.clientX, e.clientY);
    };

    const globalMouseUp = () => {
        if (dragState.active) stopDrag();
        if (resizeState.active) stopResize();
    };

    const globalTouchMove = (e) => {
        if ((dragState.active) || (resizeState.active)) {
            e.preventDefault();
            const coords = getEventCoords(e);
            if (dragState.active) onDragMove(coords.clientX, coords.clientY);
            if (resizeState.active) onResizeMove(coords.clientX, coords.clientY);
        }
    };

    const globalTouchEnd = () => {
        if (dragState.active) stopDrag();
        if (resizeState.active) stopResize();
    };

    window.addEventListener('mousemove', globalMouseMove);
    window.addEventListener('mouseup', globalMouseUp);
    window.addEventListener('touchmove', globalTouchMove, { passive: false });
    window.addEventListener('touchend', globalTouchEnd);
    window.addEventListener('touchcancel', globalTouchEnd);

    winObj.cleanupListeners = () => {
        window.removeEventListener('mousemove', globalMouseMove);
        window.removeEventListener('mouseup', globalMouseUp);
        window.removeEventListener('touchmove', globalTouchMove);
        window.removeEventListener('touchend', globalTouchEnd);
        window.removeEventListener('touchcancel', globalTouchEnd);
    };

    // 焦点事件
    winDiv.addEventListener('mousedown', () => focusWindow(winObj));
    winDiv.addEventListener('touchstart', () => focusWindow(winObj), { passive: true });

    // iframe加载
    const iframe = winDiv.querySelector('iframe');
    iframe.addEventListener('load', () => {
        notifyResize(winObj);
        syncDarkModeToWindow(winObj);
    });

    // 播放打开动画
    if (animationManager) {
        animationManager.animateWindowOpen(winDiv).catch(console.error);
    } else {
        // 降级方案
        winDiv.style.opacity = '0';
        winDiv.style.transform = 'scale(0.88) translateY(40px)';
        winDiv.style.filter = 'blur(12px)';

        requestAnimationFrame(() => {
            winDiv.style.transition = 'all 1.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            winDiv.style.opacity = '1';
            winDiv.style.transform = 'scale(1) translateY(0)';
            winDiv.style.filter = 'blur(0)';

            setTimeout(() => {
                winDiv.style.transition = '';
                notifyResize(winObj);
            }, 1200);
        });
    }

    return winObj;
}

// ========== 打开应用 (稳定版) ==========
async function openApp(appName) {
    const existing = getWindowsByApp(appName);
    const visible = existing.find(w => !w.minimized);

    // 如果已有可见窗口，聚焦并弹跳
    if (visible) {
        focusWindow(visible);

        // Dock图标弹跳
        const dockItem = document.querySelector(`.dock-item[data-app="${appName}"]`);
        if (dockItem && animationManager) {
            await animationManager.animateDockBounce(dockItem);
        } else if (dockItem) {
            dockItem.style.animation = 'dockBounce 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            setTimeout(() => dockItem.style.animation = '', 600);
        }
        return;
    }

    // 如果有最小化窗口，恢复它
    const minimized = existing.find(w => w.minimized);
    if (minimized) {
        await restoreWindow(minimized);
        return;
    }

    // 创建新窗口
    const offset = windows.length * 28;
    const left = 80 + offset;
    const top = 60 + offset;
    const cfg = appConfig[appName];

    if (!cfg) {
        console.error(`应用 ${appName} 未配置`);
        return;
    }

    const winObj = createWindow(appName, left, top, cfg.defaultW, cfg.defaultH);
    if (winObj) {
        windows.push(winObj);
        updateBadge(appName);
        focusWindow(winObj);

        // 触发 Dock 打开事件
        window.dispatchEvent(new CustomEvent('appOpened', {
            detail: { appName: appName, windowId: winObj.id }
        }));
    }
}

// 消息监听
window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data) return;

    if (data.type === 'closeWindow') {
        const win = windows.find(w => w.dom.querySelector('iframe') === e.source.frameElement);
        if (win) closeWindow(win);
    } else if (data.type === 'toggleDarkMode') {
        document.body.classList.toggle('dark-mode', data.enabled);
        if (window.updateCCDarkMode) {
            window.updateCCDarkMode(data.enabled);
        }
        // 同步到所有相关窗口
        windows.filter(w => w.app === 'settings').forEach(win => {
            const iframe = win.dom.querySelector('iframe');
            if (iframe && iframe.contentWindow && iframe.contentWindow !== e.source) {
                iframe.contentWindow.postMessage({
                    type: 'syncDarkMode',
                    enabled: data.enabled
                }, '*');
            }
        });
        windows.filter(w => w.app === 'about').forEach(win => {
            const iframe = win.dom.querySelector('iframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ 
                    type: 'darkMode', 
                    enabled: data.enabled 
                }, '*');
            }
        });
    } else if (data.type === 'showDesktopIcons') {
        const iconsDiv = document.querySelector('.desktop-icons');
        if (iconsDiv) iconsDiv.style.display = data.visible ? 'grid' : 'none';
    }
});

// ========== 初始化函数 ==========
function initMenuBar() {
    const aboutMenuItem = document.querySelector('.menu-item .submenu ul li:first-child a');
    if (aboutMenuItem && aboutMenuItem.textContent.includes('关于本机')) {
        aboutMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            openApp('about');
        });
    }

    const prefsMenuItem = document.getElementById('menu-settings');
    if (prefsMenuItem) {
        prefsMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            openApp('settings');
        });
    }

    document.querySelectorAll('.menu-item').forEach(menu => {
        const title = menu.querySelector('.menu-title');

        if (title && title.textContent === '文件') {
            const submenuItems = menu.querySelectorAll('.submenu li a');
            submenuItems.forEach(sub => {
                if (sub.textContent.includes('新建访达窗口')) {
                    sub.addEventListener('click', (e) => {
                        e.preventDefault();
                        openApp('finder');
                    });
                }
                if (sub.textContent.includes('新建文件夹')) {
                    sub.addEventListener('click', (e) => {
                        e.preventDefault();
                        alert('新建文件夹功能（演示）');
                    });
                }
                if (sub.textContent.includes('关闭')) {
                    sub.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (activeWindow) {
                            closeWindow(activeWindow);
                        } else {
                            alert('没有活动窗口');
                        }
                    });
                }
            });
        }

        if (title && title.textContent === '窗口') {
            const submenuItems = menu.querySelectorAll('.submenu li a');
            submenuItems.forEach(sub => {
                if (sub.textContent.includes('最小化')) {
                    sub.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (activeWindow && !activeWindow.minimized) {
                            minimizeWindow(activeWindow);
                        }
                    });
                }
                if (sub.textContent.includes('缩放')) {
                    sub.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (activeWindow) {
                            toggleFullscreen(activeWindow);
                        }
                    });
                }
            });
        }
    });

    const helpSearch = document.querySelector('.menu-item:last-child .submenu li a');
    if (helpSearch && helpSearch.textContent.includes('macOS 帮助')) {
        helpSearch.addEventListener('click', (e) => {
            e.preventDefault();
            openApp('about');
            setTimeout(() => {
                const aboutWin = windows.find(w => w.app === 'about' && !w.minimized);
                if (aboutWin) {
                    const iframe = aboutWin.dom.querySelector('iframe');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({ type: 'switchTab', tab: 'software' }, '*');
                    }
                }
            }, 500);
        });
    }
}

function initDesktopIcons() {
    document.querySelectorAll('.desktop-icon').forEach(icon => {
        icon.addEventListener('dblclick', () => {
            const app = icon.getAttribute('data-app');
            if (app) openApp(app);
        });

        let lastTap = 0;
        icon.addEventListener('touchstart', (e) => {
            const currentTime = Date.now();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                const app = icon.getAttribute('data-app');
                if (app) openApp(app);
                lastTap = 0;
            } else {
                lastTap = currentTime;
            }
        });

        icon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY);
        });
    });

    // 播放桌面图标交错出现动画
    if (animationManager) {
        setTimeout(() => {
            animationManager.animateDesktopIconsStagger();
        }, 500);
    }
}

async function showContextMenu(x, y) {
    const menu = document.getElementById('desktop-context-menu');
    if (!menu) return;

    const menuWidth = 200;
    const menuHeight = 250;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    if (x + menuWidth > winWidth) finalX = winWidth - menuWidth - 10;
    if (y + menuHeight > winHeight) finalY = winHeight - menuHeight - 10;

    menu.style.display = 'block';
    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;

    // 播放菜单出现动画
    if (animationManager) {
        await animationManager.animateContextMenu(menu);
    } else {
        menu.style.opacity = '0';
        menu.style.transform = 'scale(0.92) translateY(-10px)';
        requestAnimationFrame(() => {
            menu.style.transition = 'all 1.0s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            menu.style.opacity = '1';
            menu.style.transform = 'scale(1) translateY(0)';
        });
    }

    const closeMenu = () => {
        menu.style.display = 'none';
        document.removeEventListener('click', closeMenu);
    };

    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 100);
}

function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.textContent = timeStr;
    }
}

// ========== 开机动画 (稳定版) ==========
async function startBootAnimation() {
    const bootScreen = document.getElementById('boot-screen');
    const progressBar = document.getElementById('boot-progress-bar');

    if (!bootScreen) return;

    // 使用动画管理器
    if (animationManager) {
        await animationManager.startBootSequence(bootScreen, progressBar, () => {
            console.log('✨ macOS 桌面已就绪');
        });
    } else {
        // 降级方案
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 4 + 1;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                bootScreen.classList.add('hide-boot');
                setTimeout(() => {
                    bootScreen.style.display = 'none';
                }, 800);
            }
            if (progressBar) {
                progressBar.style.width = Math.min(progress, 100) + '%';
            }
        }, 180);

        setTimeout(() => {
            clearInterval(interval);
            if (progressBar) progressBar.style.width = '100%';
            bootScreen.classList.add('hide-boot');
            setTimeout(() => {
                bootScreen.style.display = 'none';
            }, 800);
        }, 5000);
    }
}

// ========== DOMContentLoaded 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
    // 等待动画管理器初始化
    let initAttempts = 0;
    const maxAttempts = 50;

    while (!window.AnimationManager && initAttempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 100));
        initAttempts++;
    }

    if (window.AnimationManager) {
        animationManager = window.AnimationManager;
        console.log('✅ 动画管理器已连接');
    } else {
        console.warn('⚠️ 动画管理器未加载，使用降级方案');
    }

    // 启动开机动画
    await startBootAnimation();

    // 初始化其他组件
    updateTime();
    setInterval(updateTime, 60000);

    initMenuBar();
    initDesktopIcons();

    // 右键菜单事件
    document.getElementById('new-folder')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert('📁 新建文件夹（演示）');
    });

    document.getElementById('new-document')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert('📄 新建文档（演示）');
    });

    document.getElementById('paste')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert('📋 粘贴（演示）');
    });

    document.getElementById('sort-by')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert('📊 排序方式（演示）');
    });

    document.getElementById('show-view-options')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert('🔍 查看显示选项（演示）');
    });

    document.getElementById('get-info')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert('ℹ️ 显示简介\n\nmacOS 桌面\n项目数量: 5\n可用空间: 256 GB');
    });

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('desktop-context-menu');
        if (menu && !menu.contains(e.target)) menu.style.display = 'none';
    });

    document.querySelector('.desktop')?.addEventListener('contextmenu', (e) => {
        if (e.target.classList.contains('desktop') || e.target.classList.contains('desktop-icons')) {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY);
        }
    });

    console.log('✨ macOS 网页版已启动！(动画系统 v2.0-stable)');
});

// 导出API
window.macOS = {
    openApp,
    windows,
    activeWindow,
    version: '3.0-dynamic-dock',
    animationManager: () => animationManager
};

// 导出供 DockManager 使用
window.openApp = openApp;
window.closeWindow = closeWindow;
window.minimizeWindow = minimizeWindow;
window.restoreWindow = restoreWindow;
window.appConfig = appConfig;
