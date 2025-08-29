// utils.js — общие утилиты для контент-скрипта и UI
(() => {
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

    const toISOUTC = (ms) =>
        new Date(ms).toISOString().replace("T", " ").replace("Z", " UTC");

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Экспорт в неймспейс расширения (в изолированном мире контент-скрипта)
    window.MMS = window.MMS || {};
    window.MMS.utils = { qs, ce, escapeHTML, fmtDateTime, toISOUTC, sleep };
})();
