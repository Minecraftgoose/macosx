// ========== Siri / Apple Intelligence 对话完整逻辑 ==========
(function(){
    let isProcessing = false;
    let chatHistory = [];
    const MAX_HISTORY = 20;

    const API_KEY = 'sk_EQ4HTMiRyRQ6n3ZCKcClBQX5J2Iru3Kj';
    const API_ENDPOINT = 'https://gen.pollinations.ai/v1/chat/completions';

    const siriOverlay = document.getElementById('ai-overlay');
    const siriInterface = document.getElementById('siri-interface');
    const chatContainer = document.getElementById('chat-container');
    const inputArea = document.getElementById('input-area');
    const siriInput = document.getElementById('siri-input');
    const sendBtn = document.getElementById('send-btn');

    function setInputEnabled(enabled) {
        if (enabled) {
            inputArea.classList.remove('disabled');
            siriInput.disabled = false;
            sendBtn.disabled = false;
        } else {
            inputArea.classList.add('disabled');
            siriInput.disabled = true;
            sendBtn.disabled = true;
        }
    }

    function addMessage(text, isUser = false, isTemp = false) {
        const bubble = document.createElement('div');
        bubble.className = isUser ? 'user-bubble' : 'siri-bubble';
        if (isTemp) bubble.classList.add('thinking');
        if (isTemp) {
            bubble.innerHTML = text + '<span class="thinking-dots"><span></span><span></span><span></span></span>';
        } else {
            bubble.textContent = text;
        }
        chatContainer.appendChild(bubble);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        if (!isTemp) {
            chatHistory.push({ role: isUser ? 'user' : 'assistant', content: text });
            while (chatHistory.length > MAX_HISTORY) {
                chatHistory.shift();
                if (chatContainer.firstChild && chatContainer.children.length > MAX_HISTORY) {
                    chatContainer.removeChild(chatContainer.firstChild);
                }
            }
        }
        return bubble;
    }

    function clearChatHistory() {
        chatContainer.innerHTML = '';
        chatHistory = [];
    }

    async function fetchAIResponse(userMessage) {
        const messages = [
            { role: "system", content: "你是 Siri，苹果智能助手。用简洁、友好、略带俏皮的中文回答。避免markdown。如果用户骂你，幽默地回应。" }
        ];
        const recentHistory = chatHistory.slice(-MAX_HISTORY);
        messages.push(...recentHistory);
        messages.push({ role: "user", content: userMessage });
        const requestBody = { model: "deepseek", messages, stream: false, temperature: 0.7, seed: -1 };
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            const response = await fetch(API_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                switch(response.status) {
                    case 401: return "API Key 无效或已过期，请检查密钥设置。";
                    case 402: return "API 余额不足，请前往 enter.pollinations.ai 充值。";
                    case 429: return "请求过于频繁，请稍后再试。";
                    default: return `请求失败 (${response.status})：${errorData.error?.message || '未知错误'}`;
                }
            }
            const data = await response.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content;
            }
            throw new Error("API 返回格式异常");
        } catch (error) {
            console.error("AI 调用错误:", error);
            if (error.name === 'AbortError') return "请求超时，请检查网络连接后重试。";
            if (error.message.includes('Failed to fetch')) return "网络连接失败，请检查网络或 CORS 设置。";
            return "抱歉，我暂时无法回答，请稍后再试。";
        }
    }

    async function handleUserInput(text) {
        if (!text.trim() || isProcessing) return;
        isProcessing = true;
        setInputEnabled(false);
        addMessage(text, true);
        siriInput.value = '';
        const thinkingBubble = addMessage("正在思考", false, true);
        try {
            const aiReply = await fetchAIResponse(text);
            thinkingBubble.remove();
            addMessage(aiReply, false);
        } catch (err) {
            thinkingBubble.remove();
            addMessage("出错了，请检查网络后重试。", false);
        } finally {
            isProcessing = false;
            setInputEnabled(true);
            siriInput.focus();
        }
    }

    function openSiri() {
        if (siriOverlay.classList.contains('active')) return;
        clearChatHistory();
        siriOverlay.classList.add('active');
        setTimeout(() => {
            siriInterface.classList.add('active');
            addMessage('有什么可以帮您的？', false);
            siriInput.focus();
        }, 300);
    }

    function closeSiri() {
        isProcessing = false;
        setInputEnabled(true);
        siriOverlay.classList.remove('active');
        siriInterface.classList.remove('active');
        clearChatHistory();
        siriInput.value = '';
    }

    // 事件绑定
    siriOverlay.addEventListener('click', closeSiri);

    const siriTrigger = document.getElementById('siri-trigger');
    if (siriTrigger) {
        siriTrigger.addEventListener('click', openSiri);
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', () => handleUserInput(siriInput.value));
    }

    if (siriInput) {
        siriInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') handleUserInput(siriInput.value); 
        });
    }

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.code === 'Space') {
            e.preventDefault();
            if (siriOverlay.classList.contains('active')) closeSiri();
            else openSiri();
        }
        if (e.code === 'Escape' && siriOverlay.classList.contains('active')) {
            e.preventDefault();
            closeSiri();
        }
    });

    // 暴露全局方法
    window.Siri = {
        open: openSiri,
        close: closeSiri,
        isOpen: () => siriOverlay.classList.contains('active')
    };
})();
