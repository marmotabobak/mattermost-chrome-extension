// ui.js — построение и управление панелью UI (без изменения логики).
(() => {
    const U = (window.MMS && window.MMS.utils) || {};
    const { qs, ce, escapeHTML, fmtDateTime, toISOUTC } = U;

    function createPanel(deps) {
        const {
            // зависимости из content.js (пробрасываем, чтобы не дублировать логику)
            apiGetThread,
            fetchUsers,
            getRootPostId,
            formatDisplayName,
            normalizeThread,
            toAIJSON,
            extractPostIdFromString,
            // константы
            consts: { PANEL_ID, ACTIVE_CLASS, TAB_ACTIVE_CLASS },
        } = deps;

        // если уже создана — вернём существующий
        let existing = qs(`#${PANEL_ID}`);
        if (existing) return existing;

        // --- DOM каркас (как было в content.js) ---
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

        // --- состояние панели (без изменения структуры) ---
        const state = {
            activeTab: "thread",  // thread | raw | ai
            rawThread: null,
            messages: [],
            usersById: new Map(),
        };

        // --- рендеры (ровно как были) ---
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

        // --- утилиты UI (как было) ---
        let flashTimer = null;
        function flashTitle(msg) {
            const prev = title.textContent;
            title.textContent = msg;
            clearTimeout(flashTimer);
            flashTimer = setTimeout(() => (title.textContent = prev), 1500);
        }

        function getCurrentPayloadAndName() {
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

        function showNoRootUi() {
            title.textContent = "RootId не найден";
            secRaw.textContent = "{}";
            secAI.textContent = "[]";

            const p = document.createElement("div");
            p.className = "mms-text";
            p.style.marginTop = "8px";
            p.textContent = "Мы не смогли определить тред из URL. Откройте тред в правой панели или выберите сообщение вручную.";

            const pickBtn = document.createElement("button");
            pickBtn.className = "mms-btn";
            pickBtn.textContent = "Выбрать кликом";
            pickBtn.title = "Кликните по любому сообщению треда";
            pickBtn.addEventListener("click", () => pickRootByClick());

            secThread.innerHTML = "";
            secThread.append(p, document.createElement("br"), pickBtn);
            setActiveTab("thread");
        }

        function pickRootByClick() {
            const overlay = document.createElement("div");
            overlay.style.position = "fixed";
            overlay.style.inset = "0";
            overlay.style.background = "rgba(0,0,0,0.05)";
            overlay.style.zIndex = "1000000";
            overlay.style.cursor = "crosshair";
            overlay.title = "Кликните по сообщению треда… (Esc — отмена)";
            document.body.appendChild(overlay);

            const cleanup = () => overlay.remove();

            const onKey = (e) => {
                if (e.key === "Escape") {
                    window.removeEventListener("keydown", onKey, true);
                    overlay.removeEventListener("click", onClick, true);
                    cleanup();
                }
            };

            const onClick = async (e) => {
                e.preventDefault(); e.stopPropagation();
                window.removeEventListener("keydown", onKey, true);
                overlay.removeEventListener("click", onClick, true);
                cleanup();

                let node = e.target;
                let found = null;
                for (let i = 0; i < 10 && node; i++, node = node.parentElement) {
                    const tryId = extractPostIdFromString(node.id);
                    if (tryId) { found = tryId; break; }
                    for (const attr of ["data-testid", "aria-labelledby"]) {
                        const v = node.getAttribute && node.getAttribute(attr);
                        const fromAttr = extractPostIdFromString(v || "");
                        if (fromAttr) { found = fromAttr; break; }
                    }
                    if (found) break;
                }
                if (!found) {
                    alert("Не удалось определить postId. Попробуйте кликнуть по тексту сообщения или аватару.");
                    return;
                }

                try {
                    const raw = await apiGetThread(found);
                    state.rawThread = raw;
                    const { messages, userIds } = normalizeThread(raw);
                    state.messages = messages;
                    state.usersById = await fetchUsers(userIds, { concurrency: 6 });
                    setActiveTab(state.activeTab);
                    flashTitle("Готово");
                } catch (err) {
                    console.error(err);
                    alert(`Ошибка загрузки треда: ${err.status ? `HTTP ${err.status}` : ""} ${err.message || err}`);
                }
            };

            window.addEventListener("keydown", onKey, true);
            overlay.addEventListener("click", onClick, true);
        }

        // --- загрузка треда (как было в content.js внутри панели) ---
        async function refresh() {
            const rootId = getRootPostId();
            if (!rootId) {
                showNoRootUi();
                return;
            }

            btnRefresh.disabled = true;
            flashTitle("Загрузка…");
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

                flashTitle("Готово");
            } catch (e) {
                console.error("Thread load error:", e);
                const msg = `Ошибка загрузки: ${e.status ? `HTTP ${e.status}` : ""} ${e.message || e}`;
                if (state.activeTab === "thread") secThread.textContent = msg;
                if (state.activeTab === "raw") secRaw.textContent = msg;
                if (state.activeTab === "ai") secAI.textContent = msg;
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

        // --- совместимость с существующим content.js ---
        panel.__mms__ = { refresh, setActiveTab, state, title, secThread, secRaw, secAI };

        return panel;
    }

    window.MMS = window.MMS || {};
    window.MMS.ui = { createPanel };
})();
