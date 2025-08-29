// constants.js — общие константы приложения (без изменения логики)
/* global window */

(() => {
    const consts = {
        ALLOWED_HOSTS: ["chatzone.o3t.ru"],
        BTN_ID: "mms-fab",
        PANEL_ID: "mms-side-panel",
        ACTIVE_CLASS: "mms-active",
        TAB_ACTIVE_CLASS: "mms-tab-active"
    };

    window.MMS = window.MMS || {};
    window.MMS.consts = consts;
})();
