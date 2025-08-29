// api.js — сетевой слой Mattermost (same-origin, куки сессии)
/* global window */

(() => {
    const BASE = location.origin;

    async function fetchJSON(path, init = {}) {
        const url = path.startsWith("http") ? path : BASE + (path.startsWith("/") ? path : "/" + path);
        const res = await fetch(url, {
            credentials: "include", // важное: отправляем куки сессии
            ...init,
            headers: {
                Accept: "application/json",
                ...(init.headers || {}),
            },
        });

        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { }

        if (!res.ok) {
            const msg =
                (json && (json.message || json.error)) ||
                text ||
                `HTTP ${res.status} ${res.statusText}`;
            const err = new Error(msg);
            err.status = res.status;
            err.body = text;
            throw err;
        }
        return json;
    }

    // GET /api/v4/posts/{rootId}/thread?per_page=...
    async function apiGetThread(rootId, perPage = 200) {
        return fetchJSON(`/api/v4/posts/${encodeURIComponent(rootId)}/thread?per_page=${perPage}`);
    }

    // GET /api/v4/users/{id}
    async function apiGetUser(id) {
        return fetchJSON(`/api/v4/users/${encodeURIComponent(id)}`);
    }

    // Загрузка профилей пользователей с ограничением параллелизма
    async function fetchUsers(ids, { concurrency = 6 } = {}) {
        const uniq = Array.from(new Set(ids)).filter(Boolean);
        const results = new Map();
        let i = 0;

        async function worker() {
            while (i < uniq.length) {
                const id = uniq[i++];
                try {
                    const u = await apiGetUser(id);
                    results.set(id, u);
                } catch (e) {
                    console.warn("User fetch failed:", id, e);
                    results.set(id, { id, username: id.slice(0, 8) });
                }
            }
        }

        const workers = Array.from({ length: Math.min(concurrency, uniq.length) }, () => worker());
        await Promise.all(workers);
        return results;
    }

    // Экспорт в неймспейс MMS
    window.MMS = window.MMS || {};
    window.MMS.api = { fetchJSON, apiGetThread, apiGetUser, fetchUsers };
})();
