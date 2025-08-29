// spa-watcher.js — отслеживание смены URL в SPA и "подпинывание" обновления панели.
/* global window, document, location */

(() => {
    function start(getPanel, onChange) {
        let lastHref = location.href;

        const loop = setInterval(() => {
            if (location.href !== lastHref) {
                lastHref = location.href;
                try { onChange(getPanel()); } catch { /* no-op */ }
            }
        }, 1000);

        // Когда вкладка снова активна, тоже попробуем обновиться
        const onVis = () => {
            if (!document.hidden) {
                try { onChange(getPanel()); } catch { /* no-op */ }
            }
        };
        document.addEventListener("visibilitychange", onVis);

        // Возвращаем stop-функцию (на будущее)
        return () => {
            clearInterval(loop);
            document.removeEventListener("visibilitychange", onVis);
        };
    }

    window.MMS = window.MMS || {};
    window.MMS.spaWatcher = { start };
})();
