const statusEl = document.getElementById('status');
const btn = document.getElementById('btn');


btn.addEventListener('click', () => {
    const v = chrome.runtime.getManifest().version;
    statusEl.textContent = `Текущая версия: ${v}`;
});


(async function showConfigState() {
    const { MM_TOKEN, SUMM_API } = await chrome.storage.sync.get(['MM_TOKEN', 'SUMM_API']);
    if (MM_TOKEN && SUMM_API) {
        statusEl.textContent = 'Готово к работе ✅ (настройки сохранены)';
    } else {
        statusEl.textContent = 'Не настроено ⚠️ Открой Options и введи токен/API';
    }
})();