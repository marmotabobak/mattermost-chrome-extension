// constants.js — общие константы приложения (без изменения логики)
/* global window */

(() => {
    const cfg = (window.MMS && window.MMS.config) || {};
    const consts = {
        ALLOWED_HOSTS: cfg.ALLOWED_HOSTS,
        BTN_ID: "mms-fab",
        PANEL_ID: "mms-side-panel",
        ACTIVE_CLASS: "mms-active",
        TAB_ACTIVE_CLASS: "mms-tab-active"
    };

    window.MMS = window.MMS || {};
    window.MMS.consts = consts;
})();
