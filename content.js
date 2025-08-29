(function () {
    const BTN_ID = 'mm-summarize-btn';
    const PANEL_ID = 'mm-summarize-panel';

    // --- URL helpers ----------------------------------------------------------
    function getPostIdFromURL() {
        const p = location.pathname;
        let m = p.match(/\/pl\/([a-z0-9]+)/i);
        if (m) return m[1];
        m = p.match(/\/threads\/([a-z0-9]+)/i);
        if (m) return m[1];
        m = p.match(/\/posts\/([a-z0-9]+)/i);
        if (m) return m[1];
        const u = new URL(location.href);
        return u.searchParams.get('postId') || null;
    }

    // --- API base -------------------------------------------------------------
    async function getConfig() {
        return await chrome.storage.sync.get(['MM_TOKEN', 'SUMM_API', 'MM_HOST']);
    }

    function currentBase() {
        return location.origin;
    }

    function headersWithAuth(MM_TOKEN) {
        const h = { 'Content-Type': 'application/json' };
        if (MM_TOKEN) h['Authorization'] = 'Bearer ' + MM_TOKEN;
        return h;
    }

    // --- Fetch thread ---------------------------------------------------------
    async function fetchThread(rootId) {
        const { MM_TOKEN, MM_HOST } = await getConfig();
        const base = (MM_HOST && MM_HOST.trim()) ? MM_HOST.replace(/\/$/, '') : currentBase();
        const isSameOrigin = base === location.origin;

        if (!MM_TOKEN && !isSameOrigin) {
            throw new Error('Для запроса к другому домену требуется MM Token (Options).');
        }

        const url = `${base}/api/v4/posts/${rootId}/thread?per_page=200`;
        const r = await fetch(url, { headers: headersWithAuth(MM_TOKEN), credentials: 'include' });
        if (!r.ok) throw new Error('Не удалось загрузить тред: ' + r.status);
        const data = await r.json(); // {order:[], posts:{}, ...}

        // Построим мапу userId -> username, используя /users/{id}
        const userMap = await buildUserMap(Object.values(data.posts || {}), { base, MM_TOKEN });
        data.__userMap = userMap;

        return data;
    }

    // --- Users: GET /api/v4/users/{id} with concurrency limit -----------------
    async function fetchUser(id, { base, MM_TOKEN }) {
        const url = `${base}/api/v4/users/${encodeURIComponent(id)}`;
        const r = await fetch(url, { headers: headersWithAuth(MM_TOKEN), credentials: 'include' });
        if (!r.ok) throw new Error(`user ${id} http ${r.status}`);
        return r.json(); // {id, username, first_name, last_name, nickname, ...}
    }

    async function buildUserMap(posts, ctx) {
        const ids = Array.from(new Set(posts.map(p => p?.user_id).filter(Boolean)));
        if (!ids.length) return {};

        // ограничим параллелизм
        const CONCURRENCY = 8;
        const map = {};
        let i = 0;

        async function worker() {
            while (i < ids.length) {
                const idx = i++;
                const uid = ids[idx];
                try {
                    const u = await fetchUser(uid, ctx);
                    map[uid] = formatUser(u);
                } catch {
                    map[uid] = (uid || '').slice(0, 8); // fallback
                }
            }
        }

        const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker());
        await Promise.all(workers);

        return map;
    }

    function formatUser(u) {
        // Приоритет: nickname > username > "First Last" > короткий id
        const nick = (u.nickname || '').trim();
        if (nick) return nick;
        const uname = (u.username || '').trim();
        if (uname) return uname;
        const first = (u.first_name || '').trim();
        const last = (u.last_name || '').trim();
        const full = `${first} ${last}`.trim();
        if (full) return full;
        return (u.id || '').slice(0, 8);
    }

    // --- API: Summarizer ------------------------------------------------------
    async function callSummarizer(text) {
        const { SUMM_API } = await chrome.storage.sync.get(['SUMM_API']);
        if (!SUMM_API) throw new Error('Не задан SUMM_API (Options).');

        const r = await fetch(SUMM_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!r.ok) throw new Error('Summarizer API error: ' + r.status);
        const data = await r.json();
        return data.summary || JSON.stringify(data);
    }

    // --- UI: floating button --------------------------------------------------
    function ensureButton() {
        let btn = document.getElementById(BTN_ID);
        if (btn) return btn;
        btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.textContent = 'Summarize';
        Object.assign(btn.style, {
            position: 'fixed', right: '16px', bottom: '16px', zIndex: 999999,
            padding: '8px 12px', border: '1px solid #dadce0', borderRadius: '8px',
            background: '#fff', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.08)'
        });
        btn.addEventListener('mouseenter', () => btn.style.background = '#f7f8f9');
        btn.addEventListener('mouseleave', () => btn.style.background = '#fff');
        btn.addEventListener('click', () => onClick(btn));
        document.documentElement.appendChild(btn);
        return btn;
    }

    // --- UI helpers -----------------------------------------------------------
    function escapeHTML(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fmtTime(ts) {
        try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
    }

    function ensurePanel() {
        let panel = document.getElementById(PANEL_ID);
        if (panel) return panel;

        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
      <div id="mms-header">
        <strong>Thread preview</strong>
        <div style="flex:1"></div>
        <button id="mms-copy" title="Скопировать JSON">Copy JSON</button>
        <button id="mms-close" title="Закрыть">✕</button>
      </div>
      <div id="mms-body"><em>Пусто</em></div>
    `;
        Object.assign(panel.style, {
            position: 'fixed', top: '64px', right: '16px', width: '420px', height: '60vh',
            background: '#fff', color: '#1f2937', zIndex: 1000000, borderRadius: '10px',
            border: '1px solid #e5e7eb', boxShadow: '0 10px 30px rgba(0,0,0,.12)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
        });
        const header = panel.querySelector('#mms-header');
        Object.assign(header.style, {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fafafa'
        });
        const body = panel.querySelector('#mms-body');
        Object.assign(body.style, { padding: '10px', overflow: 'auto', lineHeight: '1.35' });

        panel.querySelector('#mms-close').onclick = () => panel.remove();
        panel.querySelector('#mms-copy').onclick = () => {
            const pre = panel.querySelector('pre[data-json]');
            if (pre) navigator.clipboard.writeText(pre.textContent || '');
        };

        document.documentElement.appendChild(panel);
        return panel;
    }

    function renderThread(data) {
        const panel = ensurePanel();
        const body = panel.querySelector('#mms-body');
        const order = Array.isArray(data.order) ? data.order : Object.keys(data.posts || {});
        const posts = data.posts || {};
        const userMap = data.__userMap || {};

        const items = order.map(id => {
            const p = posts[id];
            if (!p) return '';
            const text = escapeHTML(p.message || '');
            const user = escapeHTML(userMap[p.user_id] || (p.user_id || '').slice(0, 8));
            const time = fmtTime(p.create_at);
            return `
        <div class="mms-msg">
          <div class="mms-meta">
            <span class="mms-user">${user}</span>
            <span class="mms-time">${time}</span>
          </div>
          <div class="mms-text">${text.replace(/\n/g, '<br/>')}</div>
        </div>`;
        }).join('');

        const fullText = order.map(id => posts[id]?.message || '').join('\n\n');

        body.innerHTML = `
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <button id="mms-show-json">Raw JSON</button>
        <button id="mms-hide-json" style="display:none;">Hide JSON</button>
        <button id="mms-run-summarizer">Summarize Thread</button>
      </div>
      <div id="mms-list">${items || '<em>Нет сообщений</em>'}</div>
      <div id="mms-summary" style="margin-top:12px; padding:10px; border:1px solid #e5e7eb; border-radius:8px; display:none;"></div>
      <pre data-json style="display:none; margin-top:10px; padding:8px; background:#f6f8fa; border:1px solid #e5e7eb; border-radius:8px; max-height:30vh; overflow:auto;">${escapeHTML(JSON.stringify(data, null, 2))}</pre>
      <style>
        #${PANEL_ID} .mms-msg{padding:8px 6px;border-bottom:1px dashed #eee;}
        #${PANEL_ID} .mms-meta{font-size:12px;color:#6b7280;display:flex;gap:8px;margin-bottom:4px;}
        #${PANEL_ID} .mms-text{white-space:normal;word-break:break-word;}
        #${PANEL_ID} button{padding:6px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer}
        #${PANEL_ID} button:hover{background:#f3f4f6}
      </style>
    `;

        body.querySelector('#mms-show-json').onclick = () => {
            body.querySelector('pre[data-json]').style.display = 'block';
            body.querySelector('#mms-show-json').style.display = 'none';
            body.querySelector('#mms-hide-json').style.display = 'inline-block';
        };
        body.querySelector('#mms-hide-json').onclick = () => {
            body.querySelector('pre[data-json]').style.display = 'none';
            body.querySelector('#mms-show-json').style.display = 'inline-block';
            body.querySelector('#mms-hide-json').style.display = 'none';
        };

        body.querySelector('#mms-run-summarizer').onclick = async () => {
            const btn = body.querySelector('#mms-run-summarizer');
            const box = body.querySelector('#mms-summary');
            btn.disabled = true; btn.textContent = 'Summarizing…';
            try {
                const summary = await callSummarizer(fullText);
                box.style.display = 'block';
                box.innerHTML = `<strong>Summary:</strong><br/>${escapeHTML(summary).replace(/\n/g, '<br/>')}`;
            } catch (e) {
                box.style.display = 'block';
                box.innerHTML = `<span style="color:red;">Ошибка summarizer: ${escapeHTML(e.message)}</span>`;
            } finally {
                btn.disabled = false; btn.textContent = 'Summarize Thread';
            }
        };
    }

    // --- Flow -----------------------------------------------------------------
    async function onClick(btn) {
        try {
            btn.disabled = true; btn.textContent = 'Loading…';
            const rootId = getPostIdFromURL();
            if (!rootId) { alert('Открой страницу треда (/pl/<postId> или /threads/<postId>)'); return; }
            const data = await fetchThread(rootId);
            console.log('[MMS] thread', { rootId, count: Object.keys(data.posts || {}).length, data });
            renderThread(data);
        } catch (e) {
            console.error('[MMS] error', e);
            alert('Ошибка: ' + e.message);
        } finally {
            btn.disabled = false; btn.textContent = 'Summarize';
        }
    }

    // кнопка на странице
    ensureButton();

    // реакция на клик по иконке расширения
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg && msg.cmd === 'summarize') {
            const btn = ensureButton();
            onClick(btn).finally(() => sendResponse({ ok: true }));
            return true; // async reply
        }
    });

    // поддержка SPA-навигации
    const origPushState = history.pushState;
    history.pushState = function () {
        origPushState.apply(this, arguments);
        setTimeout(ensureButton, 0);
    };
    window.addEventListener('popstate', ensureButton);
})();
