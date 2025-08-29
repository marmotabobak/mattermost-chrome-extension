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

  const FMT = (window.MMS && window.MMS.formatters);
  if (!FMT) { console.error("MMS.formatters not loaded"); return; }
  const { normalizeThread, formatDisplayName, toAIJSON } = FMT;

  const C = (window.MMS && window.MMS.consts);
  if (!C) { console.error("MMS.consts not loaded"); return; }
  const { BTN_ID, PANEL_ID, ACTIVE_CLASS, TAB_ACTIVE_CLASS, ALLOWED_HOSTS } = C;
  
  if (!ALLOWED_HOSTS.includes(location.hostname)) return;


  const BASE = location.origin;

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
    extractPostIdFromString
  });
    document.body.append(panel);
    return panel;
  }

  function togglePanel() {
    const panel = buildPanel();
    panel.classList.toggle(ACTIVE_CLASS);
  }

  window.MMS = window.MMS || {};
  window.MMS.app = window.MMS.app || {};
  window.MMS.app.togglePanel = togglePanel;

  /*************************************************************************
   * Интеграция с background.js (клик по иконке)
   *************************************************************************/
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.cmd === "summarize" || msg.cmd === "toggle") {
      togglePanel();
    }
  });

  const SW = (window.MMS && window.MMS.spaWatcher);
  if (SW && typeof SW.start === "function") {
    SW.start(
      () => document.getElementById(PANEL_ID),
      (panel) => {
        if (panel && panel.classList.contains(ACTIVE_CLASS) && panel.__mms__) {
          panel.__mms__.title.textContent = "Thread Tools";
          panel.__mms__.refresh();
        }
      }
    );
  }

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
