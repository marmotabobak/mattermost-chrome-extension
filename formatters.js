// formatters.js — нормализация треда и форматирование структур без изменения логики.
/* global window */

(() => {
  const U = (window.MMS && window.MMS.utils) || {};
  const { toISOUTC } = U;

  function normalizeThread(raw) {
    const postsById = raw && raw.posts ? raw.posts : {};
    const order = Array.isArray(raw && raw.order) ? raw.order : Object.keys(postsById);

    const messages = order
      .map((id) => postsById[id])
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        user_id: p.user_id,
        message: p.message || "",
        create_at: p.create_at || 0,
        root_id: p.root_id || p.id,
        type: p.type || "",
      }))
      .sort((a, b) => a.create_at - b.create_at);

    const userIds = messages.map((m) => m.user_id).filter(Boolean);
    return { messages, userIds };
  }

  function formatDisplayName(u) {
    if (!u) return "Unknown";
    if (u.nickname) return u.nickname;
    if (u.username) return u.username;
    const first = (u.first_name || "").trim();
    const last = (u.last_name || "").trim();
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (u.id) return u.id.slice(0, 8);
    return "Unknown";
  }

  function toAIJSON(messages, usersById) {
    return messages.map((m) => ({
      username: formatDisplayName(usersById.get(m.user_id)),
      ts: toISOUTC(m.create_at),
      message: m.message || "",
      post_id: m.id,
    }));
  }

  // Экспорт
  window.MMS = window.MMS || {};
  window.MMS.formatters = { normalizeThread, formatDisplayName, toAIJSON };
})();
