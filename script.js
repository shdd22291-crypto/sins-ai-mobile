class SinsEngine {
    constructor() {
        this.chats = JSON.parse(localStorage.getItem('sins_chats') || '{}');
        this.currentChatId = localStorage.getItem('sins_current_chat_id');
        this.isUserScrollingUp = false;
        
        // Инициализируем базу из 1000 ключей в памяти браузера админа (или генерируем при первом запуске)
        this.initKeyPool();

        this.initDOM();
        this.initEvents();
        this.initApp();
    }

    // Создаем пул из 1000 статических заготовленных ключей один раз
    initKeyPool() {
        if (!localStorage.getItem('sins_master_pool')) {
            const pool = {};
            // Генерируем 1000 ключей формата sins-xxxx-xxxx
            for (let i = 1; i <= 1000; i++) {
                const rand = Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8);
                const key = `sins-${rand}`;
                pool[key] = { status: 'free', expiresAt: null }; // status: 'free' или 'active'
            }
            localStorage.setItem('sins_master_pool', JSON.stringify(pool));
        }
    }

    initDOM() {
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.chatBox = document.getElementById('chatBox');
        this.userInput = document.getElementById('userInput');
        this.chatHistoryList = document.getElementById('chatHistoryList');
        this.sinsApiKeyInput = document.getElementById('sinsApiKeyInput');
        this.adminModal = document.getElementById('adminModal');
        this.scrollDownBtn = document.getElementById('scrollDownBtn');
        this.headerModelSelect = document.getElementById('headerModelSelect');
        this.refreshModelsBtn = document.getElementById('refreshModelsBtn');
    }

    initEvents() {
        document.getElementById('openSidebarBtn').onclick = () => this.openSidebar();
        document.getElementById('closeSidebarBtn').onclick = () => this.closeSidebar();
        this.sidebarOverlay.onclick = () => this.closeSidebar();
        document.getElementById('newChatBtn').onclick = () => this.createNewChat();
        document.getElementById('adminOpenBtn').onclick = () => this.requestAdminAccess();
        document.getElementById('adminCloseBtn').onclick = () => this.closeAdminPanel();
        document.getElementById('adminGenerateKeyBtn').onclick = () => this.adminGenerateKey();
        document.getElementById('sendBtn').onclick = () => this.sendMessage();
        this.refreshModelsBtn.onclick = () => this.fetchOpenRouterModelsBackground();

        this.headerModelSelect.onchange = () => {
            localStorage.setItem('sins_selected_model', this.headerModelSelect.value);
        };

        this.sinsApiKeyInput.onchange = () => {
            localStorage.setItem('sins_api_key', this.sinsApiKeyInput.value.trim());
        };

        this.userInput.addEventListener("input", () => {
            this.userInput.style.height = "auto";
            this.userInput.style.height = (this.userInput.scrollHeight) + "px";
        });

        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.chatBox.addEventListener('scroll', () => {
            const threshold = 50;
            const position = this.chatBox.scrollTop + this.chatBox.clientHeight;
            const height = this.chatBox.scrollHeight;
            
            this.isUserScrollingUp = height - position > threshold;
            if (this.isUserScrollingUp) {
                this.scrollDownBtn.style.display = 'flex';
            } else {
                this.scrollDownBtn.style.display = 'none';
            }
        });

        this.scrollDownBtn.onclick = () => this.scrollToBottom(true);
    }

    initApp() {
        const savedKey = localStorage.getItem('sins_api_key') || '';
        this.sinsApiKeyInput.value = savedKey;

        const savedModel = localStorage.getItem('sins_selected_model');
        if (savedModel) {
            if (![...this.headerModelSelect.options].some(o => o.value === savedModel)) {
                const opt = document.createElement('option');
                opt.value = savedModel;
                opt.textContent = savedModel;
                this.headerModelSelect.appendChild(opt);
            }
            this.headerModelSelect.value = savedModel;
        }

        if (!this.currentChatId || !this.chats[this.currentChatId]) {
            this.createNewChat(false);
        } else {
            this.renderHistoryList();
            this.loadChat(this.currentChatId);
        }

        this.fetchOpenRouterModelsBackground();
    }

    async fetchOpenRouterModelsBackground() {
        try {
            const res = await fetch("https://openrouter.ai/api/v1/models");
            const data = await res.json();
            
            if (data && data.data && Array.isArray(data.data)) {
                const models = data.data.filter(m => !m.id.toLowerCase().includes('batch'));
                const currentSelected = this.headerModelSelect.value;
                this.headerModelSelect.innerHTML = '';

                const prioritySlugs = ['deepseek/deepseek-chat', 'qwen/qwen-2.5-coder-32b-instruct', 'deepseek/deepseek-reasoner'];

                prioritySlugs.forEach(slug => {
                    const found = models.find(m => m.id === slug);
                    if (found) {
                        const opt = document.createElement('option');
                        opt.value = found.id;
                        opt.textContent = `★ ${found.name || found.id}`;
                        this.headerModelSelect.appendChild(opt);
                    }
                });

                models.forEach(m => {
                    if (!prioritySlugs.includes(m.id)) {
                        const opt = document.createElement('option');
                        opt.value = m.id;
                        const isFree = m.pricing && parseFloat(m.pricing.prompt) === 0;
                        opt.textContent = `${m.name || m.id} ${isFree ? '(Free)' : ''}`;
                        this.headerModelSelect.appendChild(opt);
                    }
                });

                if ([...this.headerModelSelect.options].some(o => o.value === currentSelected)) {
                    this.headerModelSelect.value = currentSelected;
                }
            }
        } catch (e) {
            console.warn("Фоновое обновление моделей не удалось:", e);
        }
    }

    openSidebar() {
        this.sidebar.classList.add('open');
        this.sidebarOverlay.classList.add('open');
    }

    closeSidebar() {
        this.sidebar.classList.remove('open');
        this.sidebarOverlay.classList.remove('open');
    }

    scrollToBottom(smooth = false) {
        this.chatBox.scrollTo({ top: this.chatBox.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        this.scrollDownBtn.style.display = 'none';
    }

    requestAdminAccess() {
        const pin = prompt("Введите пин-код админ-панели:");
        if (pin === "111111") {
            this.adminModal.classList.add('open');
            this.renderAdminStats();
        } else if (pin !== null) {
            alert("Неверный пин-код!");
        }
    }

    closeAdminPanel() {
        this.adminModal.classList.remove('open');
    }

    // Выдача рандомного ключа из пула
    adminGenerateKey() {
        const days = parseInt(document.getElementById('adminKeyDuration').value);
        let pool = JSON.parse(localStorage.getItem('sins_master_pool') || '{}');
        
        // Ищем первый свободный ключ
        const freeKey = Object.keys(pool).find(k => pool[k].status === 'free');
        if (!freeKey) {
            alert("Все 1000 ключей закончились!");
            return;
        }

        // Рассчитываем срок действия
        let expiresAt = null; // Навсегда
        if (days > 0) {
            expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
        }

        pool[freeKey] = {
            status: 'active',
            expiresAt: expiresAt
        };

        localStorage.setItem('sins_master_pool', JSON.stringify(pool));

        // Выводим результат в админку
        const out = document.getElementById('generatedKeyOutput');
        out.innerHTML = `Готовый ключ (${days === 0 ? 'Навсегда' : days + ' дн.'}): <br><b style="font-size: 1.1rem; user-select: all;">${freeKey}</b>`;
        
        navigator.clipboard.writeText(freeKey).catch(() => {});
        this.renderAdminStats();
    }

    adminRevokeKey(key) {
        let pool = JSON.parse(localStorage.getItem('sins_master_pool') || '{}');
        if (pool[key]) {
            pool[key] = { status: 'free', expiresAt: null };
            localStorage.setItem('sins_master_pool', JSON.stringify(pool));
            this.renderAdminStats();
        }
    }

    renderAdminStats() {
        let pool = JSON.parse(localStorage.getItem('sins_master_pool') || '{}');
        const keys = Object.keys(pool);
        
        let freeCount = 0;
        let activeCount = 0;
        const tbody = document.getElementById('adminActiveKeysList');
        tbody.innerHTML = '';

        keys.forEach(k => {
            const item = pool[k];
            if (item.status === 'free') {
                freeCount++;
            } else if (item.status === 'active') {
                // Проверяем не истек ли срок
                if (item.expiresAt && Date.now() > item.expiresAt) {
                    pool[k] = { status: 'free', expiresAt: null };
                    freeCount++;
                } else {
                    activeCount++;
                    let timeLeft = "Навсегда";
                    if (item.expiresAt) {
                        const diff = item.expiresAt - Date.now();
                        const hoursLeft = Math.ceil(diff / (1000 * 60 * 60));
                        if (hoursLeft > 24) {
                            timeLeft = Math.ceil(hoursLeft / 24) + " дн. осталось";
                        } else {
                            timeLeft = hoursLeft + " ч. осталось";
                        }
                    }

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="padding: 6px; font-family: monospace; user-select: all;">${k}</td>
                        <td style="padding: 6px; color: var(--accent-color);">${timeLeft}</td>
                        <td style="padding: 6px; text-align: right;">
                            <button class="btn-small" style="background: #f04747; padding: 2px 6px;" onclick="sinsApp.adminRevokeKey('${k}')"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                }
            }
        });

        localStorage.setItem('sins_master_pool', JSON.stringify(pool));

        document.getElementById('freeKeysCount').textContent = freeCount;
        document.getElementById('activeUsersCount').textContent = activeCount;
    }

    createNewChat(shouldRender = true) {
        const id = 'chat_' + Date.now();
        this.chats[id] = {
            title: 'Новый диалог',
            messages: [
                { role: 'assistant', text: 'Универсальная система **SINS AI Engine** активна. Введите ваш ключ SINS в сайдбере, выберите модель и начните диалог.' }
            ]
        };
        this.currentChatId = id;
        this.saveChats();
        if (shouldRender) {
            this.renderHistoryList();
            this.loadChat(id);
            this.closeSidebar();
        }
    }

    saveChats() {
        localStorage.setItem('sins_chats', JSON.stringify(this.chats));
        localStorage.setItem('sins_current_chat_id', this.currentChatId);
    }

    loadChat(id) {
        this.currentChatId = id;
        localStorage.setItem('sins_current_chat_id', id);
        this.renderHistoryList();

        this.chatBox.innerHTML = `
            <button class="scroll-down-btn" id="scrollDownBtn" style="display: none;">
                <i class="fa-solid fa-arrow-down"></i> Вниз
            </button>
        `;
        this.scrollDownBtn = document.getElementById('scrollDownBtn');
        this.scrollDownBtn.onclick = () => this.scrollToBottom(true);

        const chat = this.chats[id];
        if (chat && chat.messages) {
            chat.messages.forEach(msg => {
                this.appendMessageUI(msg.role, msg.text, false);
            });
        }
        this.scrollToBottom(false);
    }

    deleteChat(e, id) {
        e.stopPropagation();
        delete this.chats[id];
        this.saveChats();
        
        const remainingIds = Object.keys(this.chats);
        if (remainingIds.length === 0) {
            this.createNewChat();
        } else {
            if (this.currentChatId === id) {
                this.loadChat(remainingIds[0]);
            } else {
                this.renderHistoryList();
            }
        }
    }

    renderHistoryList() {
        this.chatHistoryList.innerHTML = '';

        Object.keys(this.chats).reverse().forEach(id => {
            const item = document.createElement('div');
            item.className = `history-item ${id === this.currentChatId ? 'active' : ''}`;
            item.onclick = () => {
                this.loadChat(id);
                this.closeSidebar();
            };

            item.innerHTML = `
                <div class="history-title"><i class="fa-regular fa-message"></i> ${this.chats[id].title}</div>
                <i class="fa-solid fa-trash delete-chat-btn" id="del_${id}"></i>
            `;
            
            item.querySelector('.delete-chat-btn').onclick = (e) => this.deleteChat(e, id);
            this.chatHistoryList.appendChild(item);
        });
    }

    appendMessageUI(role, text, scroll = true) {
        const msgEl = document.createElement('div');
        msgEl.className = `message ${role}`;
        
        if (role === 'assistant') {
            msgEl.innerHTML = marked.parse(text);
        } else {
            msgEl.textContent = text;
        }

        this.chatBox.insertBefore(msgEl, this.scrollDownBtn);

        if (scroll && !this.isUserScrollingUp) {
            this.scrollToBottom(true);
        }

        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }

    async sendMessage() {
        const text = this.userInput.value.trim();
        if (!text) return;

        const userKey = this.sinsApiKeyInput.value.trim();
        if (!userKey) {
            alert("Пожалуйста, введите ваш SINS ключ в боковой панели слева!");
            return;
        }

        // Проверяем ключ по нашему пулу
        let pool = JSON.parse(localStorage.getItem('sins_master_pool') || '{}');
        const keyData = pool[userKey];

        if (!keyData || keyData.status !== 'active') {
            alert("Введенный SINS ключ недействителен или уже неактивен!");
            return;
        }

        // Проверяем срок годности
        if (keyData.expiresAt && Date.now() > keyData.expiresAt) {
            alert("Срок действия этого SINS ключа истек!");
            pool[userKey] = { status: 'free', expiresAt: null };
            localStorage.setItem('sins_master_pool', JSON.stringify(pool));
            return;
        }

        // Безопасная заглушка для GitHub Actions (заменишь на свой sk-or-v1-... перед сборкой, если нужно)
        const openRouterMasterKey = "sk-or-v1-placeholder";
        const modelVersion = this.headerModelSelect.value;

        this.chats[this.currentChatId].messages.push({ role: 'user', text: text });
        
        if (this.chats[this.currentChatId].title === 'Новый диалог') {
            this.chats[this.currentChatId].title = text.length > 25 ? text.substring(0, 25) + '...' : text;
        }

        this.saveChats();
        this.renderHistoryList();
        this.appendMessageUI('user', text);

        this.userInput.value = '';
        this.userInput.style.height = "auto";

        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'message assistant';
        loadingMsg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Обработка запроса (${modelVersion})...`;
        this.chatBox.insertBefore(loadingMsg, this.scrollDownBtn);
        if (!this.isUserScrollingUp) this.scrollToBottom(true);

        try {
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openRouterMasterKey}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'SINS AI'
                },
                body: JSON.stringify({
                    model: modelVersion,
                    messages: [{ role: "user", content: text }]
                })
            });

            const data = await res.json();
            if (!res.ok) {
                const errorMsgText = data.error?.message || JSON.stringify(data.error);
                throw new Error(`OpenRouter: ${errorMsgText}`);
            }
            
            const responseText = data.choices[0].message.content;

            this.chatBox.removeChild(loadingMsg);
            this.chats[this.currentChatId].messages.push({ role: 'assistant', text: responseText });
            this.saveChats();
            this.appendMessageUI('assistant', responseText);

        } catch (err) {
            this.chatBox.removeChild(loadingMsg);
            const errorMsg = document.createElement('div');
            errorMsg.className = 'message assistant error-msg';
            errorMsg.innerHTML = `<strong>Ошибка SINS AI:</strong> ${err.message}`;
            this.chatBox.insertBefore(errorMsg, this.scrollDownBtn);
            if (!this.isUserScrollingUp) this.scrollToBottom(true);
        }
    }
}

let sinsApp;
window.onload = () => {
    sinsApp = new SinsEngine();
};
```[cite: 1]