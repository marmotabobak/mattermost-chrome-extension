// bootstrap.js — подключение стилей и создание плавающей кнопки.
// Логика не меняется: по клику кнопки вызываем window.MMS.app.togglePanel().

(() => {
    const SHEET_ID = "mms-stylesheet";
    const BTN_ID = "mms-fab";

    function ensureStylesheetLink() {
        if (document.getElementById(SHEET_ID)) return;
        const link = document.createElement("link");
        link.id = SHEET_ID;
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("panel.css");
        document.head.appendChild(link);
    }

    function ensureFabButton() {
        if (document.getElementById(BTN_ID)) return;
        const btn = document.createElement("button");
        btn.id = BTN_ID;
        btn.title = "Показать/скрыть панель треда";
        btn.textContent = "Thread Tools";

        // Обработчик клика вызывает togglePanel из content.js (экспортируется в window.MMS.app)
        btn.addEventListener("click", () => {
            const fn = window.MMS && window.MMS.app && window.MMS.app.togglePanel;
            if (typeof fn === "function") fn();
        });

        document.body.appendChild(btn);
    }

    // Автоинициализация
    ensureStylesheetLink();
    ensureFabButton();
})();
