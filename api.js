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

    // --- Threads & posts ---

    // GET /api/v4/posts/{postId}/thread?per_page=...
    async function apiGetThread(postId, perPage = 200) {
        return fetchJSON(`/api/v4/posts/${encodeURIComponent(postId)}/thread?per_page=${perPage}`);
    }

    // GET /api/v4/posts/{postId}
    async function apiGetPost(postId) {
        return fetchJSON(`/api/v4/posts/${encodeURIComponent(postId)}`);
    }

    /**
     * Возвращает id корневого поста (root id) для любого поста.
     * Если у поста есть root_id — вернём его; иначе — сам id.
     */
    async function ensureRootId(postId) {
        if (!postId) return postId;
        try {
            const p = await apiGetPost(postId);
            return (p && p.root_id) ? p.root_id : (p && p.id) ? p.id : postId;
        } catch (e) {
            // В худшем случае не рушим UX и пробуем как есть
            console.warn("ensureRootId: fallback to provided id due to error:", e);
            return postId;
        }
    }

    // --- Users ---

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
    window.MMS.api = { fetchJSON, apiGetThread, apiGetPost, ensureRootId, apiGetUser, fetchUsers };
})();
