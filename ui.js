// ui.js — построение и управление панелью UI.
/* global window, document */

(() => {
    const U = (window.MMS && window.MMS.utils) || {};
    const { qs, ce, escapeHTML, fmtDateTime } = U;

    const C = (window.MMS && window.MMS.consts) || {};
    const { PANEL_ID, ACTIVE_CLASS, TAB_ACTIVE_CLASS } = C;

    function createPanel(deps) {
        const {
            apiGetThread,
            fetchUsers,
            getRootPostId,
            formatDisplayName,
            normalizeThread,
            toAIJSON,
            extractPostIdFromString,
        } = deps;

        // если уже создана — вернём существующий
        const existing = qs(`#${PANEL_ID}`);
        if (existing) return existing;

        // --- DOM каркас ---
        const panel = ce("div", { id: PANEL_ID, className: `mms-panel` });

        // header
        const title = ce("div", { className: "mms-title", textContent: "Thread Tools" });
        const btnRefresh = ce("button", { className: "mms-btn", textContent: "Refresh", title: "Обновить" });
        const btnCopy = ce("button", { className: "mms-btn", textContent: "Copy", title: "Скопировать текущий вид" });
        const btnDownload = ce("button", { className: "mms-btn", textContent: "Download", title: "Скачать текущий вид" });

        const tabsWrap = ce("div", { className: "mms-tabs", role: "tablist", "aria-label": "Thread views" });
        const tabThread = ce("button", { className: "mms-tab", textContent: "Thread", role: "tab", "aria-selected": "true" });
        const tabRaw = ce("button", { className: "mms-tab", textContent: "Raw JSON", role: "tab" });
        const tabAI = ce("button", { className: "mms-tab", textContent: "JSON для AI", role: "tab" });

        const header = ce("div", { className: "mms-header" }, [
            title,
            btnRefresh,
            btnCopy,
            btnDownload,
            tabsWrap,
            tabThread,
            tabRaw,
            tabAI,
        ]);

        // body
        const body = ce("div", { className: "mms-body" });
        const secThread = ce("div", { className: `mms-section ${ACTIVE_CLASS}`, id: "mms-sec-thread" });
        const secRaw = ce("pre", { className: "mms-section", id: "mms-sec-raw" });
        const secAI = ce("pre", { className: "mms-section", id: "mms-sec-ai" });

        body.append(secThread, secRaw, secAI);
        panel.append(header, body);

        // --- состояние панели ---
        const state = {
            activeTab: "thread",  // thread | raw | ai
            rawThread: null,
            messages: [],
            usersById: new Map(),
        };

        // --- рендеры ---
        function renderThread() {
            secThread.innerHTML = "";
            if (!state.messages.length) {
                secThread.textContent = "Нет данных. Нажмите Refresh.";
                return;
            }
            for (const m of state.messages) {
                const u = state.usersById.get(m.user_id);
                const name = formatDisplayName(u);
                const meta = ce("div", {
                    className: "mms-meta",
                    innerHTML: `${escapeHTML(name)} • ${escapeHTML(fmtDateTime(m.create_at))}`,
                });
                const text = ce("div", { className: "mms-text", innerHTML: escapeHTML(m.message) });
                const item = ce("div", { className: "mms-msg" }, [meta, text]);
                secThread.append(item);
            }
        }

        function renderRaw() {
            secRaw.textContent = state.rawThread ? JSON.stringify(state.rawThread, null, 2) : "{}";
        }

        function renderAI() {
            const ai = toAIJSON(state.messages, state.usersById);
            secAI.textContent = JSON.stringify(ai, null, 2);
        }

        function setActiveTab(name) {
            state.activeTab = name;
            for (const el of [tabThread, tabRaw, tabAI]) el.classList.remove(TAB_ACTIVE_CLASS);
            for (const el of [secThread, secRaw, secAI]) el.classList.remove(ACTIVE_CLASS);

            if (name === "thread") {
                tabThread.classList.add(TAB_ACTIVE_CLASS);
                secThread.classList.add(ACTIVE_CLASS);
                renderThread();
            } else if (name === "raw") {
                tabRaw.classList.add(TAB_ACTIVE_CLASS);
                secRaw.classList.add(ACTIVE_CLASS);
                renderRaw();
            } else {
                tabAI.classList.add(TAB_ACTIVE_CLASS);
                secAI.classList.add(ACTIVE_CLASS);
                renderAI();
            }
        }

        // --- утилиты UI ---
        let flashTimer = null;
        function flashTitle(msg) {
            const prev = title.textContent;
            title.textContent = msg;
            clearTimeout(flashTimer);
            flashTimer = setTimeout(() => (title.textContent = "Thread Tools"), 1500);
        }

        function getCurrentPayloadAndName() {
            // Пытаемся взять rootId (если его нет, используем "thread" для имени файла)
            const rootId = getRootPostId() || "thread";
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            if (state.activeTab === "thread") {
                const lines = state.messages.map((m) => {
                    const u = state.usersById.get(m.user_id);
                    const name = formatDisplayName(u);
                    return `### ${name} — ${fmtDateTime(m.create_at)}\n${m.message || ""}\n`;
                });
                return {
                    filename: `mm-thread_${rootId}_${ts}.md`,
                    mime: "text/markdown",
                    content: lines.join("\n"),
                };
            }
            if (state.activeTab === "raw") {
                return {
                    filename: `mm-thread_${rootId}_${ts}_raw.json`,
                    mime: "application/json",
                    content: JSON.stringify(state.rawThread || {}, null, 2),
                };
            }
            const ai = toAIJSON(state.messages, state.usersById);
            return {
                filename: `mm-thread_${rootId}_${ts}_ai.json`,
                mime: "application/json",
                content: JSON.stringify(ai, null, 2),
            };
        }

        async function copyCurrent() {
            const { content } = getCurrentPayloadAndName();
            try {
                await navigator.clipboard.writeText(content);
                flashTitle("Скопировано");
            } catch (e) {
                console.warn("Clipboard failed:", e);
                flashTitle("Не удалось скопировать");
            }
        }

        function downloadCurrent() {
            const { filename, mime, content } = getCurrentPayloadAndName();
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = ce("a", { href: url, download: filename });
            document.body.append(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

        // --- Новое: режим ручного ввода ID треда ---
        function showNoRootUi() {
            title.textContent = "RootId не найден";
            secRaw.textContent = "{}";
            secAI.textContent = "[]";

            // Секция Thread: подсказка + поле ввода и кнопка загрузки
            secThread.innerHTML = "";

            const p = ce("div", {
                className: "mms-text",
                textContent:
                    "Мы не смогли определить тред из URL. Введите ID корневого поста (26 символов) и нажмите «Загрузить».",
            });

            const field = ce("div", { className: "mms-field" });
            const input = ce("input", {
                className: "mms-input",
                placeholder: "Например: 1234567890abcdefghijklmnop",
                maxLength: 64,
                spellcheck: false,
            });
            const loadBtn = ce("button", { className: "mms-btn", textContent: "Загрузить", title: "Загрузить тред по ID" });

            field.append(input, loadBtn);
            secThread.append(p, field);

            // отметим активной вкладкой Thread, не дергая setActiveTab (чтобы не перерисовать секцию)
            state.activeTab = "thread";
            tabThread.classList.add(TAB_ACTIVE_CLASS);
            tabRaw.classList.remove(TAB_ACTIVE_CLASS);
            tabAI.classList.remove(TAB_ACTIVE_CLASS);
            secThread.classList.add(ACTIVE_CLASS);
            secRaw.classList.remove(ACTIVE_CLASS);
            secAI.classList.remove(ACTIVE_CLASS);

            async function tryLoadByManualId() {
                const rawVal = (input.value || "").trim();
                const maybeId = extractPostIdFromString(rawVal);
                if (!maybeId || !/^[a-z0-9]{26}$/i.test(maybeId)) {
                    alert("Некорректный ID. Должно быть 26 латинских букв/цифр.");
                    input.focus();
                    return;
                }

                btnRefresh.disabled = true;
                title.textContent = "Загрузка…";
                try {
                    const raw = await apiGetThread(maybeId);
                    state.rawThread = raw;

                    const { messages, userIds } = normalizeThread(raw);
                    state.messages = messages;

                    const users = await fetchUsers(userIds, { concurrency: 6 });
                    state.usersById = users;

                    title.textContent = "Thread Tools";
                    // перерисуем текущую вкладку (сейчас это thread)
                    setActiveTab(state.activeTab);
                    flashTitle("Готово");
                } catch (err) {
                    console.error(err);
                    alert(`Ошибка загрузки треда: ${err.status ? `HTTP ${err.status}` : ""} ${err.message || err}`);
                    title.textContent = "Thread Tools";
                    flashTitle("Ошибка");
                } finally {
                    btnRefresh.disabled = false;
                }
            }

            loadBtn.addEventListener("click", tryLoadByManualId);
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") tryLoadByManualId();
            });
            input.focus();
        }

        // --- загрузка треда по авто-детекту ---
        async function refresh() {
            const rootId = getRootPostId();
            if (!rootId) {
                showNoRootUi();
                return;
            }

            btnRefresh.disabled = true;
            title.textContent = "Загрузка…";
            try {
                const raw = await apiGetThread(rootId);
                state.rawThread = raw;

                const { messages, userIds } = normalizeThread(raw);
                state.messages = messages;

                const users = await fetchUsers(userIds, { concurrency: 6 });
                state.usersById = users;

                if (state.activeTab === "thread") renderThread();
                else if (state.activeTab === "raw") renderRaw();
                else renderAI();

                title.textContent = "Thread Tools";
                flashTitle("Готово");
            } catch (e) {
                console.error("Thread load error:", e);
                const msg = `Ошибка загрузки: ${e.status ? `HTTP ${e.status}` : ""} ${e.message || e}`;
                if (state.activeTab === "thread") secThread.textContent = msg;
                if (state.activeTab === "raw") secRaw.textContent = msg;
                if (state.activeTab === "ai") secAI.textContent = msg;
                title.textContent = "Thread Tools";
                flashTitle("Ошибка");
            } finally {
                btnRefresh.disabled = false;
            }
        }

        // --- обработчики кнопок/табов ---
        tabThread.addEventListener("click", () => setActiveTab("thread"));
        tabRaw.addEventListener("click", () => setActiveTab("raw"));
        tabAI.addEventListener("click", () => setActiveTab("ai"));

        btnRefresh.addEventListener("click", () => refresh());
        btnCopy.addEventListener("click", () => copyCurrent());
        btnDownload.addEventListener("click", () => downloadCurrent());

        // --- первичный рендер/загрузка ---
        setActiveTab("thread");
        refresh();

        panel.__mms__ = { refresh, setActiveTab, state, title, secThread, secRaw, secAI };
        return panel;
    }

    window.MMS = window.MMS || {};
    window.MMS.ui = { createPanel };
})();
