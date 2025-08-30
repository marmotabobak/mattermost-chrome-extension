// content.js — интеграция модулей и управление панелью.
/* global window, document, chrome */

(() => {
  // utils
  const U = (window.MMS && window.MMS.utils);
  if (!U) { console.error("MMS.utils not loaded"); return; }

  // ui
  const UI = (window.MMS && window.MMS.ui);
  if (!UI) { console.error("MMS.ui not loaded"); return; }

  // api
  const API = (window.MMS && window.MMS.api);
  if (!API) { console.error("MMS.api not loaded"); return; }
  const { apiGetThread, fetchUsers, ensureRootId } = API;

  // id-resolver
  const IDR = (window.MMS && window.MMS.idResolver);
  if (!IDR) { console.error("MMS.idResolver not loaded"); return; }
  const { getRootPostId, extractPostIdFromString } = IDR;

  // formatters
  const FMT = (window.MMS && window.MMS.formatters);
  if (!FMT) { console.error("MMS.formatters not loaded"); return; }
  const { normalizeThread, formatDisplayName, toAIJSON } = FMT;

  // constants
  const C = (window.MMS && window.MMS.consts);
  if (!C) { console.error("MMS.consts not loaded"); return; }
  const { PANEL_ID, ACTIVE_CLASS, ALLOWED_HOSTS } = C;

  if (!ALLOWED_HOSTS.includes(location.hostname)) return;

  let panel = null;

  function buildPanel() {
    if (panel && document.body.contains(panel)) return panel;

    panel = UI.createPanel({
      apiGetThread,
      fetchUsers,
      getRootPostId,
      ensureRootId,           // ← прокидываем новый хелпер
      formatDisplayName,
      normalizeThread,
      toAIJSON,
      extractPostIdFromString,
    });

    document.body.appendChild(panel);
    return panel;
  }

  function togglePanel() {
    const p = buildPanel();
    p.classList.toggle(ACTIVE_CLASS);
  }

  // экспорт для bootstrap.js
  window.MMS = window.MMS || {};
  window.MMS.app = window.MMS.app || {};
  window.MMS.app.togglePanel = togglePanel;

  // сообщения из background (горячая клавиша/кнопка)
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.cmd === "summarize" || msg.cmd === "toggle") {
        togglePanel();
      }
    });
  }

  // отслеживание смены URL в SPA
  const SW = (window.MMS && window.MMS.spaWatcher);
  if (SW && typeof SW.start === "function") {
    SW.start(
      () => document.getElementById(PANEL_ID),
      (p) => {
        if (p && p.classList.contains(ACTIVE_CLASS) && p.__mms__) {
          p.__mms__.title.textContent = "Thread Tools";
          p.__mms__.refresh();
        }
      }
    );
  }
})();
