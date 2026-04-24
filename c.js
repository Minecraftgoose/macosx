// ========== 控制中心 (Control Center) 完整逻辑 ==========
(function(){
    const cc = document.getElementById('control-center');
    const trigger = document.getElementById('control-center-trigger');
    const closeBtn = document.getElementById('cc-close-btn');
    let isInteracting = false;
    let interactionTimeout = null;

    function openCC() { 
        cc.classList.add('active'); 
    }
    function closeCC() { 
        if (isInteracting) return;
        cc.classList.remove('active'); 
    }

    // 触发器点击事件
    if (trigger) {
        trigger.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            if (cc.classList.contains('active')) closeCC();
            else openCC(); 
        });
    }

    // 关闭按钮
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCC);
    }

    // 修复：标记交互状态，防止拖拽滑块时误关闭
    if (cc) {
        cc.addEventListener('mousedown', () => {
            isInteracting = true;
            clearTimeout(interactionTimeout);
        });
        cc.addEventListener('touchstart', () => {
            isInteracting = true;
            clearTimeout(interactionTimeout);
        }, {passive: true});

        cc.addEventListener('mouseup', () => {
            interactionTimeout = setTimeout(() => { isInteracting = false; }, 100);
        });
        cc.addEventListener('touchend', () => {
            interactionTimeout = setTimeout(() => { isInteracting = false; }, 100);
        });
    }

    // 点击外部关闭
    document.addEventListener('click', (e) => { 
        if (isInteracting) return;
        if (cc && !cc.contains(e.target) && trigger && !trigger.contains(e.target)) {
            closeCC();
        }
    });

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && cc && cc.classList.contains('active')) {
            closeCC();
        }
    });

    // ========== 亮度滑块 ==========
    const brightnessSlider = document.getElementById('brightness-slider');
    const desktop = document.querySelector('.desktop');
    if (brightnessSlider && desktop) {
        brightnessSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            desktop.style.filter = `brightness(${val})`;
            // 控制中心也跟随调节，但保持稍微可见
            if (cc) cc.style.filter = `brightness(${Math.max(0.6, val)})`;
        });
        // 初始化
        desktop.style.filter = `brightness(${brightnessSlider.value})`;
    }

    // ========== 音量滑块 ==========
    const volumeSlider = document.getElementById('volume-slider');
    let audioCtx = null;
    let gainNode = null;

    function initAudio() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioCtx.createGain();
            gainNode.gain.value = parseFloat(volumeSlider ? volumeSlider.value : 0.6);
            gainNode.connect(audioCtx.destination);
            const osc = audioCtx.createOscillator();
            osc.frequency.value = 0;
            osc.connect(gainNode);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.001);
        } catch(e) {
            console.log('Web Audio API 不支持');
        }
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            if (!audioCtx) initAudio();
            if (audioCtx && gainNode) {
                if (audioCtx.state === 'suspended') audioCtx.resume();
                gainNode.gain.value = vol;
            }
        });
        // 首次交互初始化音频
        document.body.addEventListener('click', initAudio, { once: true });
        document.body.addEventListener('touchstart', initAudio, { once: true });
    }

    // ========== WiFi 切换 ==========
    const wifiToggle = document.getElementById('toggle-wifi');
    const wifiDetail = document.getElementById('wifi-detail');
    if (wifiToggle) {
        wifiToggle.addEventListener('click', () => {
            const currentState = wifiToggle.dataset.state;
            const newState = currentState === 'on' ? 'off' : 'on';
            wifiToggle.dataset.state = newState;

            if (newState === 'on') {
                wifiToggle.innerHTML = '<i class="fas fa-toggle-on"></i><span>开启</span>';
                if (wifiDetail) {
                    wifiDetail.textContent = 'MyHome_5G';
                    wifiDetail.style.opacity = '1';
                }
            } else {
                wifiToggle.innerHTML = '<i class="fas fa-toggle-off"></i><span>关闭</span>';
                if (wifiDetail) {
                    wifiDetail.textContent = '未连接';
                    wifiDetail.style.opacity = '0.6';
                }
            }
        });
    }

    // ========== 蓝牙切换 ==========
    const btToggle = document.getElementById('toggle-bluetooth');
    const btDetail = document.getElementById('bluetooth-detail');
    if (btToggle) {
        btToggle.addEventListener('click', () => {
            const currentState = btToggle.dataset.state;
            const newState = currentState === 'on' ? 'off' : 'on';
            btToggle.dataset.state = newState;

            if (newState === 'on') {
                btToggle.innerHTML = '<i class="fas fa-toggle-on"></i><span>开启</span>';
                if (btDetail) btDetail.textContent = '已连接"Magic Mouse"';
            } else {
                btToggle.innerHTML = '<i class="fas fa-toggle-off"></i><span>关闭</span>';
                if (btDetail) btDetail.textContent = '蓝牙已关闭';
            }
        });
    }

    // ========== 专注模式切换 ==========
    const focusToggle = document.getElementById('toggle-focus');
    if (focusToggle) {
        focusToggle.addEventListener('click', () => {
            const currentState = focusToggle.dataset.state;
            const newState = currentState === 'on' ? 'off' : 'on';
            focusToggle.dataset.state = newState;

            if (newState === 'on') {
                focusToggle.innerHTML = '<i class="fas fa-toggle-on"></i><span>开启</span>';
            } else {
                focusToggle.innerHTML = '<i class="fas fa-toggle-off"></i><span>关闭</span>';
            }
        });
    }

    // ========== 深色模式切换 ==========
    const darkToggle = document.getElementById('toggle-darkmode');
    if (darkToggle) {
        // 检测系统偏好
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-mode');
            darkToggle.dataset.state = 'on';
            darkToggle.innerHTML = '<i class="fas fa-toggle-on"></i><span>开启</span>';
        }

        darkToggle.addEventListener('click', () => {
            const currentState = darkToggle.dataset.state;
            const newState = currentState === 'on' ? 'off' : 'on';
            darkToggle.dataset.state = newState;

            if (newState === 'on') {
                darkToggle.innerHTML = '<i class="fas fa-toggle-on"></i><span>开启</span>';
                document.body.classList.add('dark-mode');
            } else {
                darkToggle.innerHTML = '<i class="fas fa-toggle-off"></i><span>关闭</span>';
                document.body.classList.remove('dark-mode');
            }

            // 同步到设置页面（如果打开）
            if (window.windows) {
                const settingsWindows = window.windows.filter(w => w.app === 'settings');
                settingsWindows.forEach(win => {
                    const iframe = win.dom.querySelector('iframe');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                            type: 'syncDarkMode',
                            enabled: newState === 'on'
                        }, '*');
                    }
                });

                // 同步到 about 页面（如果打开）及其子 iframe
                const aboutWindows = window.windows.filter(w => w.app === 'about');
                aboutWindows.forEach(win => {
                    const iframe = win.dom.querySelector('iframe');
                    if (iframe && iframe.contentWindow) {
                        // 发送给 about.html，让它同步子 iframe
                        iframe.contentWindow.postMessage({
                            type: 'darkMode',
                            enabled: newState === 'on'
                        }, '*');
                    }
                });
            }
        });
    }

    // ========== 屏幕镜像 ==========
    const screenMirror = document.getElementById('screen-mirror');
    if (screenMirror) {
        screenMirror.addEventListener('click', () => {
            alert('屏幕镜像：未检测到 Apple TV 或其他隔空播放设备');
        });
    }

    // ========== 锁定屏幕 ==========
    const lockBtn = document.getElementById('cc-lock');
    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            alert('🔒 屏幕已锁定 (演示模式)');
            closeCC();
        });
    }

    // ========== 睡眠 ==========
    const sleepBtn = document.getElementById('cc-sleep');
    if (sleepBtn) {
        sleepBtn.addEventListener('click', () => {
            alert('😴 进入睡眠模式 (演示)');
            closeCC();
        });
    }

    // ========== 暴露更新函数供外部调用 ==========
    window.updateCCDarkMode = function(enabled) {
        if (!darkToggle) return;
        const newState = enabled ? 'on' : 'off';
        if (darkToggle.dataset.state === newState) return;

        darkToggle.dataset.state = newState;
        if (enabled) {
            darkToggle.innerHTML = '<i class="fas fa-toggle-on"></i><span>开启</span>';
            document.body.classList.add('dark-mode');
        } else {
            darkToggle.innerHTML = '<i class="fas fa-toggle-off"></i><span>关闭</span>';
            document.body.classList.remove('dark-mode');
        }
    };

    window.ControlCenter = {
        open: openCC,
        close: closeCC,
        isOpen: () => cc ? cc.classList.contains('active') : false
    };
})();
