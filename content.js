// content.js — MV3 content script
// Работает на страницах Mattermost (например, chatzone.o3t.ru/*).
// Делает запросы ТОЛЬКО на текущий origin, с credentials: 'include'.
// Никаких PAT, настроек и внешнего Summarizer.

(() => {
  "use strict";

  /*************************************************************************
   * Константы и утилиты
   *************************************************************************/
  const ALLOWED_HOSTS = ["chatzone.o3t.ru"]; // при необходимости добавь домены
  if (!ALLOWED_HOSTS.includes(location.hostname)) return;

  const BTN_ID = "mms-fab";
  const PANEL_ID = "mms-side-panel";
  const PANEL_ROOT_CLASS = "mms-panel";
  const ACTIVE_CLASS = "mms-active";
  const TAB_ACTIVE_CLASS = "mms-tab-active";

  const BASE = location.origin;

  const qs = (sel, root = document) => root.querySelector(sel);
  const ce = (tag, props = {}, children = []) => {
    const el = document.createElement(tag);
    Object.assign(el, props);
    for (const c of children) el.append(c);
    return el;
  };
  const escapeHTML = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const fmtDateTime = (ms) => {
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return String(ms);
    }
  };
  const toISOUTC = (ms) => new Date(ms).toISOString().replace("T", " ").replace("Z", " UTC");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /*************************************************************************
   * Сеть (same-origin)
   *************************************************************************/
  async function fetchJSON(path, init = {}) {
    const url = path.startsWith("http") ? path : BASE + (path.startsWith("/") ? path : "/" + path);
    const res = await fetch(url, {
      credentials: "include", // кука сессии приедет автоматически
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { }

    if (!res.ok) {
      const msg =
        (json && (json.message || json.error)) ||
        text ||
        `HTTP ${res.status} ${res.statusText}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    return json;
  }

  async function apiGetThread(rootId, perPage = 200) {
    return fetchJSON(`/api/v4/posts/${encodeURIComponent(rootId)}/thread?per_page=${perPage}`);
  }

  async function apiGetUser(id) {
    return fetchJSON(`/api/v4/users/${encodeURIComponent(id)}`);
  }

  async function fetchUsers(ids, { concurrency = 6 } = {}) {
    const uniq = Array.from(new Set(ids)).filter(Boolean);
    const results = new Map();
    let i = 0;
    async function worker() {
      while (i < uniq.length) {
        const id = uniq[i++];
        try {
          const u = await apiGetUser(id);
          results.set(id, u);
        } catch (e) {
          console.warn("User fetch failed:", id, e);
          results.set(id, { id, username: id.slice(0, 8) });
        }
      }
    }
    const workers = Array.from({ length: Math.min(concurrency, uniq.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  /*************************************************************************
   * Извлечение rootId (URL + DOM + fallback-клик)
   *************************************************************************/
  function isValidPostId(id) {
    return typeof id === "string" && /^[a-z0-9]{26}$/i.test(id);
  }

  function extractPostIdFromString(s) {
    if (!s) return null;
    const m = s.match(/([a-z0-9]{26})/i);
    return m ? m[1] : null;
  }

  function getRootPostIdFromDOM() {
    const sel = [
      // RHS (правая панель)
      '[id^="rhsPostMessageText_"]',
      '[id^="rhsRootPost_"]',
      '.SidebarRight [id^="post_"]',
      // Центр
      '[id^="postMessageText_"]',
      '[id^="postContent_"]',
      '[id^="post_"]',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (!el) continue;
      const id =
        extractPostIdFromString(el.id) ||
        extractPostIdFromString(el.getAttribute("data-testid") || "");
      if (id) return id;
    }
    // Иногда id есть в ссылке "Скопировать ссылку"
    const link = document.querySelector('a[href*="/pl/"]');
    if (link) {
      const m = link.getAttribute("href").match(/\/pl\/([a-z0-9]{26})/i);
      if (m) return m[1];
    }
    return null;
  }

  function getRootPostId() {
    const url = new URL(location.href);
    const parts = url.pathname.split("/").filter(Boolean);
    const grabNext = (arr, key) => {
      const i = arr.indexOf(key);
      return i >= 0 && arr[i + 1] ? arr[i + 1] : null;
    };
    const fromUrl =
      grabNext(parts, "pl") ||
      (parts[0] === "_redirect" && grabNext(parts.slice(1), "pl")) ||
      grabNext(parts, "thread") ||
      grabNext(parts, "posts") ||
      url.searchParams.get("postId");

    if (isValidPostId(fromUrl)) return fromUrl;

    const domId = getRootPostIdFromDOM();
    if (isValidPostId(domId)) return domId;

    return null;
  }

  /*************************************************************************
   * Нормализация
   *************************************************************************/
  function normalizeThread(raw) {
    const postsById = raw && raw.posts ? raw.posts : {};
    const order = Array.isArray(raw && raw.order) ? raw.order : Object.keys(postsById);

    const messages = order
      .map((id) => postsById[id])
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        user_id: p.user_id,
        message: p.message || "",
        create_at: p.create_at || 0,
        root_id: p.root_id || p.id,
        type: p.type || "",
      }))
      .sort((a, b) => a.create_at - b.create_at);

    const userIds = messages.map((m) => m.user_id).filter(Boolean);
    return { messages, userIds };
  }

  function formatDisplayName(u) {
    if (!u) return "Unknown";
    if (u.nickname) return u.nickname;
    if (u.username) return u.username;
    const first = (u.first_name || "").trim();
    const last = (u.last_name || "").trim();
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (u.id) return u.id.slice(0, 8);
    return "Unknown";
  }

  function toAIJSON(messages, usersById) {
    return messages.map((m) => ({
      username: formatDisplayName(usersById.get(m.user_id)),
      ts: toISOUTC(m.create_at),
      message: m.message || "",
      post_id: m.id,
    }));
  }

  function ensureStylesheetLink() {
    const id = "mms-stylesheet";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("panel.css");
    document.head.appendChild(link);
  }

  /*************************************************************************
   * Панель, табы, кнопки (Refresh / Copy / Download)
   *************************************************************************/
  function ensureButton() {
    if (qs(`#${BTN_ID}`)) return;
    const btn = ce("button", { id: BTN_ID, title: "Показать/скрыть панель треда" });
    btn.textContent = "Thread Tools";
    btn.addEventListener("click", togglePanel);
    document.body.append(btn);
  }

  function buildPanel() {
    let panel = qs(`#${PANEL_ID}`);
    if (panel) return panel;

    panel = ce("div", { id: PANEL_ID, className: `${PANEL_ROOT_CLASS}` });

    // header
    const title = ce("div", { className: "mms-title", textContent: "Thread Tools" });
    const btnRefresh = ce("button", { className: "mms-btn", textContent: "Refresh", title: "Обновить" });
    const btnCopy = ce("button", { className: "mms-btn", textContent: "Copy", title: "Скопировать текущий вид" });
    const btnDownload = ce("button", { className: "mms-btn", textContent: "Download", title: "Скачать текущий вид" });

    const tabs = ce("div", { className: "mms-tabs", role: "tablist", "aria-label": "Thread views" });
    const tabThread = ce("button", { className: "mms-tab", textContent: "Thread", role: "tab", "aria-selected": "true" });
    const tabRaw = ce("button", { className: "mms-tab", textContent: "Raw JSON", role: "tab" });
    const tabAI = ce("button", { className: "mms-tab", textContent: "JSON для AI", role: "tab" });

    const header = ce("div", { className: "mms-header" }, [title, btnRefresh, btnCopy, btnDownload, tabs, tabThread, tabRaw, tabAI]);

    // body
    const body = ce("div", { className: "mms-body" });
    const secThread = ce("div", { className: `mms-section ${ACTIVE_CLASS}`, id: "mms-sec-thread" });
    const secRaw = ce("pre", { className: "mms-section", id: "mms-sec-raw" });
    const secAI = ce("pre", { className: "mms-section", id: "mms-sec-ai" });

    body.append(secThread, secRaw, secAI);
    panel.append(header, body);
    document.body.append(panel);

    // Состояние панели
    const state = {
      activeTab: "thread",  // thread | raw | ai
      rawThread: null,
      messages: [],
      usersById: new Map(),
    };

    // Переключение табов
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

    tabThread.addEventListener("click", () => setActiveTab("thread"));
    tabRaw.addEventListener("click", () => setActiveTab("raw"));
    tabAI.addEventListener("click", () => setActiveTab("ai"));

    // Кнопки действий
    btnRefresh.addEventListener("click", () => refresh());
    btnCopy.addEventListener("click", () => copyCurrent());
    btnDownload.addEventListener("click", () => downloadCurrent());

    // Рендеры
    function renderThread() {
      secThread.innerHTML = "";
      if (!state.messages.length) {
        secThread.textContent = "Нет данных. Нажмите Refresh.";
        return;
      }
      for (const m of state.messages) {
        const u = state.usersById.get(m.user_id);
        const name = formatDisplayName(u);
        const meta = ce("div", { className: "mms-meta", innerHTML: `${escapeHTML(name)} • ${escapeHTML(fmtDateTime(m.create_at))}` });
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

    // Копирование/скачивание текущего вида
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
          content: lines.join("\n")
        };
      }
      if (state.activeTab === "raw") {
        return {
          filename: `mm-thread_${rootId}_${ts}_raw.json`,
          mime: "application/json",
          content: JSON.stringify(state.rawThread || {}, null, 2)
        };
      }
      // ai
      const ai = toAIJSON(state.messages, state.usersById);
      return {
        filename: `mm-thread_${rootId}_${ts}_ai.json`,
        mime: "application/json",
        content: JSON.stringify(ai, null, 2)
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

    // Flash-всплывашка в заголовке
    let flashTimer = null;
    function flashTitle(msg) {
      const prev = title.textContent;
      title.textContent = msg;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => (title.textContent = prev), 1500);
    }

    // UI, когда не нашли rootId
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

    // Выбор корневого сообщения кликом по DOM
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
          // Перерисуем активную вкладку
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

    // Загрузка треда
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

    // Первичная отрисовка + автозагрузка
    setActiveTab("thread");
    refresh();

    // Экспорт полезного в __mms__ (для отладки в консоли)
    panel.__mms__ = { refresh, setActiveTab, state, title, secThread, secRaw, secAI };
    return panel;
  }

  function togglePanel() {
    const panel = buildPanel();
    panel.classList.toggle(ACTIVE_CLASS);
  }

  /*************************************************************************
   * Интеграция с background.js (клик по иконке)
   *************************************************************************/
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.cmd === "summarize" || msg.cmd === "toggle") {
      togglePanel();
    }
  });

  /*************************************************************************
   * Автоинициализация и слежение за изменением URL (SPA)
   *************************************************************************/
  ensureStylesheetLink();
  ensureButton();

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      const panel = qs(`#${PANEL_ID}`);
      if (panel && panel.classList.contains(ACTIVE_CLASS) && panel.__mms__) {
        panel.__mms__.title.textContent = "Thread Tools";
        panel.__mms__.refresh();
      }
    }
  }, 1000);
})();
