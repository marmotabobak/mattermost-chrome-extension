chrome.action.onClicked.addListener(async (tab) => {
    try {
        const url = tab?.url || "";
        // Разрешаем только обычные http/https страницы
        if (!/^https?:\/\//i.test(url)) {
            console.warn("[MMS] Action ignored on non-web page:", url);
            return;
        }

        // Шлём команду контент-скрипту; при ошибке — принудительно инжектим и пробуем снова
        await chrome.tabs.sendMessage(tab.id, { cmd: "summarize" })
            .catch(async () => {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content.js"]
                });
                await chrome.tabs.sendMessage(tab.id, { cmd: "summarize" });
            });

    } catch (e) {
        console.error("[MMS] action click error:", e);
    }
});
