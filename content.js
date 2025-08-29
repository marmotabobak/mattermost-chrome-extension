// content.js — MV3 content script
// Работает на страницах Mattermost (например, chatzone.o3t.ru/*).
// Делает запросы ТОЛЬКО на текущий origin, с credentials: 'include'.
// Никаких PAT, настроек и внешнего Summarizer.

(() => {
  "use strict";

  const U = (window.MMS && window.MMS.utils);
  if (!U) { console.error("MMS.utils not loaded"); return; }
  const { qs, ce, escapeHTML, fmtDateTime, toISOUTC, sleep } = U;

  const UI = (window.MMS && window.MMS.ui);
  if (!UI) { console.error("MMS.ui not loaded"); return; }

  const API = (window.MMS && window.MMS.api);
  if (!API) { console.error("MMS.api not loaded"); return; }
  const { apiGetThread, apiGetUser, fetchUsers } = API;

  const IDR = (window.MMS && window.MMS.idResolver);
  if (!IDR) { console.error("MMS.idResolver not loaded"); return; }
  const { getRootPostId, extractPostIdFromString } = IDR;

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

    panel = UI.createPanel({
      apiGetThread,
      fetchUsers,
      getRootPostId,
      formatDisplayName,
      normalizeThread,
      toAIJSON,
      extractPostIdFromString,
      consts: { PANEL_ID, ACTIVE_CLASS, TAB_ACTIVE_CLASS },
    });

    document.body.append(panel);
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
