const els = {
    token: document.getElementById('mmToken'),
    api: document.getElementById('summApi'),
    host: document.getElementById('mmHost'),
    save: document.getElementById('save'),
    clear: document.getElementById('clear'),
    toggle: document.getElementById('toggleToken'),
    status: document.getElementById('status')
};


function setStatus(msg, ok = true) {
    els.status.textContent = msg;
    els.status.style.color = ok ? '#0a7' : '#c11';
    if (msg) setTimeout(() => els.status.textContent = '', 2000);
}


async function load() {
    const data = await chrome.storage.sync.get(['MM_TOKEN', 'SUMM_API', 'MM_HOST']);
    els.token.value = data.MM_TOKEN || '';
    els.api.value = data.SUMM_API || '';
    els.host.value = data.MM_HOST || '';
}


async function save() {
    const MM_TOKEN = els.token.value.trim();
    const SUMM_API = els.api.value.trim();
    const MM_HOST = els.host.value.trim();


    if (!MM_TOKEN) return setStatus('Укажи MM Token', false);
    if (!SUMM_API) return setStatus('Укажи Summarization API', false);


    await chrome.storage.sync.set({ MM_TOKEN, SUMM_API, MM_HOST });
    setStatus('Сохранено');
}


async function clearAll() {
    await chrome.storage.sync.remove(['MM_TOKEN', 'SUMM_API', 'MM_HOST']);
    els.token.value = els.api.value = els.host.value = '';
    setStatus('Сброшено');
}


function toggleToken() {
    els.token.type = els.token.type === 'password' ? 'text' : 'password';
    els.toggle.textContent = els.token.type === 'password' ? 'Показать' : 'Скрыть';
}


els.save.addEventListener('click', save);
els.clear.addEventListener('click', clearAll);
els.toggle.addEventListener('click', toggleToken);


document.addEventListener('DOMContentLoaded', load);