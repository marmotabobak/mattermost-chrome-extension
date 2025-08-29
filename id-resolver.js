// id-resolver.js — извлечение postId (rootId) из URL/DOM без изменения логики.
/* global window, document, location */

(() => {
    function isValidPostId(id) {
        return typeof id === "string" && /^[a-z0-9]{26}$/i.test(id);
    }

    function extractPostIdFromString(s) {
        if (!s) return null;
        const m = String(s).match(/([a-z0-9]{26})/i);
        return m ? m[1] : null;
    }

    // Пытаемся вытащить id корневого поста из DOM (RHS и центр)
    function getRootPostIdFromDOM() {
        const selectors = [
            // RHS (правая панель)
            '[id^="rhsPostMessageText_"]',
            '[id^="rhsRootPost_"]',
            '.SidebarRight [id^="post_"]',
            // Центр
            '[id^="postMessageText_"]',
            '[id^="postContent_"]',
            '[id^="post_"]',
        ];

        for (const s of selectors) {
            const el = document.querySelector(s);
            if (!el) continue;
            const fromId = extractPostIdFromString(el.id);
            if (fromId) return fromId;

            const fromTestId = extractPostIdFromString(el.getAttribute("data-testid") || "");
            if (fromTestId) return fromTestId;
        }

        // Иногда id есть в ссылке "Скопировать ссылку"
        const link = document.querySelector('a[href*="/pl/"]');
        if (link) {
            const m = link.getAttribute("href").match(/\/pl\/([a-z0-9]{26})/i);
            if (m) return m[1];
        }

        return null;
    }

    // Комбинированный резолвер: сначала URL, затем DOM
    function getRootPostId() {
        const url = new URL(location.href);
        const parts = url.pathname.split("/").filter(Boolean);

        const nextAfter = (arr, key) => {
            const i = arr.indexOf(key);
            return i >= 0 && arr[i + 1] ? arr[i + 1] : null;
        };

        // Популярные паттерны Mattermost
        const fromUrl =
            nextAfter(parts, "pl") ||
            (parts[0] === "_redirect" && nextAfter(parts.slice(1), "pl")) ||
            nextAfter(parts, "thread") ||
            nextAfter(parts, "posts") ||
            url.searchParams.get("postId");

        if (isValidPostId(fromUrl)) return fromUrl;

        const fromDom = getRootPostIdFromDOM();
        if (isValidPostId(fromDom)) return fromDom;

        return null;
    }

    // Экспорт в неймспейс MMS
    window.MMS = window.MMS || {};
    window.MMS.idResolver = {
        isValidPostId,
        extractPostIdFromString,
        getRootPostIdFromDOM,
        getRootPostId,
    };
})();
