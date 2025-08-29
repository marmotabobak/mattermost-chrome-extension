(function () {
    const BTN_ID = 'mm-summarize-btn';
    const PANEL_ID = 'mm-summarize-panel';

    // ---------------- URL helpers ----------------
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

    // ---------------- Config ----------------
    async function getConfig() {
        const data = await chrome.storage.sync.get(['MM_TOKEN', 'MM_HOST', 'SUMM_API']);
        return {
            MM_TOKEN: data.MM_TOKEN || '',
            MM_HOST: data.MM_HOST || '',
            SUMM_API: data.SUMM_API || ''
        };
    }
    const currentBase = () => location.origin;
    function headersWithAuth(MM_TOKEN) {
        const h = { 'Content-Type': 'application/json' };
        if (MM_TOKEN) h['Authorization'] = 'Bearer ' + MM_TOKEN;
        return h;
    }

    // ---------------- Fetch thread ----------------
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
        const data = await r.json();

        data.__userMap = await buildUserMap(Object.values(data.posts || {}), { base, MM_TOKEN });
        return data;
    }

    // ---------------- Users batching ----------------
    async function buildUserMap(postList, { base, MM_TOKEN }) {
        const ids = Array.from(new Set(postList.map(p => p.user_id).filter(Boolean)));
        const map = {};
        const CONCURRENCY = 4;
        let idx = 0;

        async function worker() {
            while (idx < ids.length) {
                const uid = ids[idx++];
                try {
                    const ru = await fetch(`${base}/api/v4/users/${uid}`, {
                        headers: headersWithAuth(MM_TOKEN),
                        credentials: 'include'
                    });
                    if (!ru.ok) throw new Error('user ' + ru.status);
                    const u = await ru.json();
                    map[uid] = formatUser(u);
                } catch {
                    map[uid] = (uid || '').slice(0, 8);
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
        return map;
    }

    function formatUser(u) {
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

    // ---------------- Summarizer ----------------
    async function callSummarizer(text) {
        const { SUMM_API } = await chrome.storage.sync.get(['SUMM_API']);
        if (!SUMM_API) throw new Error('Не задан SUMM_API (Options).');

        const r = await fetch(SUMM_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!r.ok) throw new Error('Summarizer HTTP ' + r.status);
        const j = await r.json();
        return j.summary || j.result || JSON.stringify(j);
    }

    // ---------------- Utils ----------------
    const escapeHTML = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    function fmtTime(ms) {
        const d = new Date(ms || 0);
        return d.toLocaleString();
    }
    function fmtTsForAi(ms) {
        const d = new Date(ms || 0);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // ---------------- Panel (idempotent) ----------------
    function buildPanelHTML() {
        return `
      <div id="mms-header">
        <strong style="font-weight:600;">Thread preview</strong>
        <div style="flex:1"></div>
        <div id="mms-modes" role="tablist" aria-label="Режим вывода">
          <button class="mms-tab mms-active" data-mode="thread" role="tab" aria-selected="true">Thread</button>
          <button class="mms-tab" data-mode="raw" role="tab" aria-selected="false">Raw JSON</button>
          <button class="mms-tab" data-mode="ai" role="tab" aria-selected="false">JSON для AI</button>
        </div>
        <div id="mms-actions" style="margin-left:8px; display:flex; gap:6px;">
          <button id="mms-copy-current" title="Скопировать текущее представление">Копировать</button>
          <button id="mms-download-current" title="Скачать текущее представление">Скачать</button>
          <button id="mms-copy-prompt" title="Скопировать промпт для нейронки">Скопировать промпт</button>
          <button id="mms-close" title="Закрыть">✕</button>
        </div>
      </div>
      <div id="mms-body"><em>Пусто</em></div>
      <style id="mms-style">
        #${PANEL_ID} { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif }
        #${PANEL_ID} button{padding:6px 10px;border:1px solid #374151;border-radius:8px;background:#111827;color:#e5e7eb;cursor:pointer}
        #${PANEL_ID} button:hover{background:#1f2937}
        #${PANEL_ID} .mms-tab{border-radius:16px;padding:6px 10px;font-size:12px;}
        #${PANEL_ID} .mms-tab.mms-active{background:#2563eb;border-color:#2563eb;color:white}
        #${PANEL_ID} pre{background:#0f172a;color:#e5e7eb;border:1px solid #1f2937;border-radius:10px;padding:10px}
        #${PANEL_ID} .mms-msg{padding:8px 6px;border-bottom:1px dashed #30363d;}
        #${PANEL_ID} .mms-meta{font-size:12px;color:#9ca3af;display:flex;gap:8px;margin-bottom:4px;}
        #${PANEL_ID} .mms-user{font-weight:600;color:#e5e7eb}
        #${PANEL_ID} .mms-text{white-space:normal;word-break:break-word;}
      </style>
    `;
    }

    function ensurePanel() {
        let panel = document.getElementById(PANEL_ID);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            Object.assign(panel.style, {
                position: 'fixed', top: '64px', right: '16px', width: '520px', height: '60vh',
                background: '#111827', color: '#e5e7eb', zIndex: 1000000, borderRadius: '12px',
                border: '1px solid #1f2937', boxShadow: '0 12px 32px rgba(0,0,0,.35)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
            });
            document.documentElement.appendChild(panel);
        }
        // (Re)build structure if missing expected nodes (handles old versions)
        if (!panel.querySelector('#mms-header') || !panel.querySelector('#mms-body')) {
            panel.innerHTML = buildPanelHTML();
            const header = panel.querySelector('#mms-header');
            Object.assign(header.style, {
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 12px', borderBottom: '1px solid #1f2937', background: '#0b1220', position: 'sticky', top: '0'
            });
            const body = panel.querySelector('#mms-body');
            Object.assign(body.style, { padding: '10px', overflow: 'auto', lineHeight: '1.35', background: '#0b1220' });
        }
        attachDelegatedHandlers(panel);
        return panel;
    }

    function attachDelegatedHandlers(panel) {
        if (panel.__handlersAttached) return;
        panel.__handlersAttached = true;

        panel.addEventListener('click', async (ev) => {
            const t = ev.target;
            if (!(t instanceof HTMLElement)) return;

            // Close
            if (t.id === 'mms-close') {
                panel.remove();
                return;
            }

            // Tabs
            if (t.classList.contains('mms-tab')) {
                const mode = t.getAttribute('data-mode') || 'thread';
                setMode(panel, mode);
                return;
            }

            // Copy prompt
            if (t.id === 'mms-copy-prompt') {
                try {
                    const url = chrome.runtime.getURL('ai_prompt.txt');
                    const r = await fetch(url);
                    if (!r.ok) throw new Error('Файл ai_prompt.txt не найден');
                    const text = await r.text();
                    await navigator.clipboard.writeText(text);
                    t.textContent = 'Скопировано';
                    setTimeout(() => (t.textContent = 'Скопировать промпт'), 1200);
                } catch (e) {
                    alert('Не удалось скопировать промпт: ' + (e.message || e));
                }
                return;
            }

            // Copy current
            if (t.id === 'mms-copy-current') {
                const { text } = getCurrentViewPayload(panel);
                try {
                    await navigator.clipboard.writeText(text);
                    t.textContent = 'Скопировано';
                    setTimeout(() => (t.textContent = 'Копировать'), 1200);
                } catch (e) {
                    alert('Не удалось скопировать: ' + (e.message || e));
                }
                return;
            }

            // Download current
            if (t.id === 'mms-download-current') {
                const { text, filename, mime } = getCurrentViewPayload(panel);
                const blob = new Blob([text], { type: mime });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1500);
                return;
            }

            // Run summarizer
            if (t.id === 'mms-run-summarizer') {
                const btn = t;
                const box = panel.querySelector('#mms-summary');
                const { threadText } = getCurrentThreadTexts(panel);
                btn.disabled = true; btn.textContent = 'Summarizing…';
                try {
                    const summary = await callSummarizer(threadText);
                    if (box) {
                        box.style.display = 'block';
                        box.innerHTML = `<strong>Summary:</strong><br/>${escapeHTML(summary).replace(/\n/g, '<br/>')}`;
                    }
                } catch (e) {
                    if (box) {
                        box.style.display = 'block';
                        box.innerHTML = `<span style="color:#f87171;">Ошибка summarizer: ${escapeHTML(e.message || String(e))}</span>`;
                    }
                } finally {
                    btn.disabled = false; btn.textContent = 'Summarize Thread';
                }
                return;
            }
        });
    }

    function setMode(panel, mode) {
        panel.dataset.mode = mode;
        panel.querySelectorAll('.mms-tab').forEach(btn => {
            const active = btn.getAttribute('data-mode') === mode;
            btn.classList.toggle('mms-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        const body = panel.querySelector('#mms-body');
        if (!body) return;
        const viewThread = body.querySelector('#mms-view-thread');
        const viewRaw = body.querySelector('#mms-view-raw');
        const viewAi = body.querySelector('#mms-view-ai');
        if (viewThread) viewThread.style.display = (mode === 'thread') ? 'block' : 'none';
        if (viewRaw) viewRaw.style.display = (mode === 'raw') ? 'block' : 'none';
        if (viewAi) viewAi.style.display = (mode === 'ai') ? 'block' : 'none';
    }

    function getCurrentThreadTexts(panel) {
        const body = panel.querySelector('#mms-body');
        const threadText = body?.querySelector('#mms-view-thread')?.getAttribute('data-plain') || '';
        const rawText = body?.querySelector('#mms-view-raw')?.textContent || '';
        const aiText = body?.querySelector('#mms-view-ai')?.textContent || '';
        return { threadText, rawText, aiText };
    }

    function getCurrentViewPayload(panel) {
        const mode = panel.dataset.mode || 'thread';
        const { threadText, rawText, aiText } = getCurrentThreadTexts(panel);
        if (mode === 'thread') return { text: threadText, filename: 'thread.txt', mime: 'text/plain' };
        if (mode === 'raw') return { text: rawText, filename: 'thread.raw.json', mime: 'application/json' };
        return { text: aiText, filename: 'thread.ai.json', mime: 'application/json' };
    }

    // ---------------- Render thread ----------------
    function renderThread(data) {
        const panel = ensurePanel();
        const body = panel.querySelector('#mms-body');
        if (!body) return;

        const order = Array.isArray(data.order) ? data.order : Object.keys(data.posts || {});
        const posts = data.posts || {};
        const userMap = data.__userMap || {};

        // Build HTML items
        const items = order.map(id => {
            const p = posts[id]; if (!p) return '';
            const text = escapeHTML(p.message || '');
            const user = escapeHTML(userMap[p.user_id] || (p.user_id || '').slice(0, 8));
            const time = fmtTime(p.create_at);
            return `
        <div class="mms-msg">
          <div class="mms-meta">
            <span class="mms-user">${user}</span>
            <span>·</span>
            <span class="mms-time">${time}</span>
          </div>
          <div class="mms-text">${text.replace(/\n/g, '<br/>')}</div>
        </div>`;
        }).join('');

        // Build plain text for Thread mode (and store в data-attr)
        const threadText = order.map(id => {
            const p = posts[id]; if (!p) return '';
            const uname = (userMap[p.user_id] || (p.user_id || '').slice(0, 8));
            const ts = fmtTime(p.create_at);
            const msg = (p.message || '').replace(/\r?\n/g, '\n');
            return `[${ts}] ${uname}: ${msg}`;
        }).join('\n');

        // AI JSON
        const aiJson = order.map(id => {
            const p = posts[id]; if (!p) return null;
            return {
                username: userMap[p.user_id] || (p.user_id || '').slice(0, 8),
                ts: fmtTsForAi(p.create_at),
                message: p.message || ''
            };
        }).filter(Boolean);

        // Fill body
        body.innerHTML = `
      <div id="mms-toolbar" style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
        <button id="mms-run-summarizer">Summarize Thread</button>
      </div>
      <div id="mms-view-thread" data-plain="${escapeHTML(threadText)}">${items || '<em>Нет сообщений</em>'}</div>
      <pre id="mms-view-raw" data-json style="display:none; margin-top:10px; max-height:40vh; overflow:auto;"></pre>
      <pre id="mms-view-ai" style="display:none; margin-top:10px; max-height:40vh; overflow:auto;"></pre>
      <div id="mms-summary" style="margin-top:12px; padding:10px; border:1px solid #1f2937; border-radius:8px; display:none;"></div>
    `;
        const rawPre = body.querySelector('#mms-view-raw');
        const aiPre = body.querySelector('#mms-view-ai');
        if (rawPre) rawPre.textContent = JSON.stringify(data, null, 2);
        if (aiPre) aiPre.textContent = JSON.stringify(aiJson, null, 2);

        // Default mode
        setMode(panel, panel.dataset.mode || 'thread');
    }

    // ---------------- Floating button ----------------
    function ensureButton() {
        if (document.getElementById(BTN_ID)) return document.getElementById(BTN_ID);
        const postId = getPostIdFromURL();
        if (!postId) return null;

        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.textContent = 'Summarize';
        Object.assign(btn.style, {
            position: 'fixed',
            right: '16px',
            bottom: '16px',
            zIndex: 1000000,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '10px 14px',
            borderRadius: '999px',
            boxShadow: '0 8px 24px rgba(37,99,235,0.5)',
            cursor: 'pointer'
        });
        btn.addEventListener('click', () => onClick(btn));
        document.documentElement.appendChild(btn);
        return btn;
    }

    // ---------------- Flow ----------------
    async function onClick(btn) {
        try {
            if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
            const rootId = getPostIdFromURL();
            if (!rootId) throw new Error('Не удалось определить postId из URL');
            const data = await fetchThread(rootId);
            renderThread(data);
        } catch (e) {
            console.error('[MMS] onClick error', e);
            alert(e.message || String(e));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Summarize'; }
        }
    }

    // Messages from background
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.cmd === 'summarize') {
            const btn = ensureButton();
            onClick(btn).finally(() => sendResponse({ ok: true }));
            return true;
        }
    });

    // SPA navigation support
    const origPushState = history.pushState;
    history.pushState = function () {
        origPushState.apply(this, arguments);
        setTimeout(ensureButton, 0);
    };
    window.addEventListener('popstate', ensureButton);
})();
