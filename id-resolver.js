// id-resolver.js — извлечение postId (rootId) из URL/DOM.
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

    // Пытаемся вытащить id корневого поста из DOM (приоритет — RHS)
    function getRootPostIdFromDOM() {
        const selectors = [
            // RHS (правая панель)
            '[id^="rhsPostMessageText_"]',
            '[id^="rhsRootPost_"]',
            '.SidebarRight [id^="post_"]',
            // Центр (оставляем для совместимости со старыми тестами/вызовами этой функции,
            // но getRootPostId() теперь пользуется DOM только если RHS точно открыт)
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

    // Утилиты для проверки контекста
    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        const cs = getComputedStyle(el);
        return cs && cs.display !== "none" && cs.visibility !== "hidden" && parseFloat(cs.opacity || "1") > 0;
    }

    // Понимаем, что открыта правая панель (RHS)
    function isRHSOpen() {
        // типичный контейнер RHS
        const rhs = document.querySelector(".SidebarRight, [class*='SidebarRight']");
        if (isVisible(rhs)) return true;

        // либо есть явно RHS-элементы (идентификаторы сообщений в правой панели)
        if (document.querySelector('[id^="rhsPostMessageText_"], [id^="rhsRootPost_"]')) return true;

        return false;
    }

    // Комбинированный резолвер: сначала URL, затем DOM (только если RHS действительно открыт)
    function getRootPostId() {
        const url = new URL(location.href);
        const parts = url.pathname.split("/").filter(Boolean);

        const nextAfter = (arr, key) => {
            const i = arr.indexOf(key);
            return i >= 0 && arr[i + 1] ? arr[i + 1] : null;
        };

        // Популярные паттерны Mattermost (permalink/thread/posts)
        const fromUrl =
            nextAfter(parts, "pl") ||
            (parts[0] === "_redirect" && nextAfter(parts.slice(1), "pl")) ||
            nextAfter(parts, "thread") ||
            nextAfter(parts, "posts") ||
            url.searchParams.get("postId");

        if (isValidPostId(fromUrl)) return fromUrl;

        // Если открыта правая панель — можно доверять DOM RHS
        if (isRHSOpen()) {
            const fromDom = getRootPostIdFromDOM();
            if (isValidPostId(fromDom)) return fromDom;
        }

        // В обычной ленте канала/личке — не подхватываем произвольный пост
        return null;
    }

    // Экспорт
    window.MMS = window.MMS || {};
    window.MMS.idResolver = {
        isValidPostId,
        extractPostIdFromString,
        getRootPostIdFromDOM,
        getRootPostId,
    };
})();
