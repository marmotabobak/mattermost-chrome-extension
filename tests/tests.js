(function () {
    const out = document.getElementById("results");

    function line(kind, msg) {
        const el = document.createElement("div");
        el.className = kind;
        el.textContent = (kind === "ok" ? "✔ " : "✘ ") + msg;
        out.appendChild(el);
    }
    function ok(msg) { line("ok", msg); }
    function fail(msg, err) { line("fail", msg + (err ? " — " + err : "")); }
    function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

    // --- Sanity ---
    try {
        assert(window.MMS, "MMS namespace exists");
        assert(MMS.utils && MMS.idResolver && MMS.formatters && MMS.ui, "core modules loaded");
        ok("Namespaces loaded");
    } catch (e) { fail("Bootstrap", e.message); }

    // -----------------------------
    // id-resolver tests
    // -----------------------------
    try {
        const { isValidPostId, extractPostIdFromString, getRootPostIdFromDOM } = MMS.idResolver;

        // 26-символьный валидный id
        const VALID_ID_26 = "1234567890abcdefghijklmnop"; // 10 + 16 = 26

        // validate
        assert(isValidPostId(VALID_ID_26) === true, "isValidPostId(true)");
        assert(isValidPostId("short") === false, "isValidPostId(false)");

        // extract
        assert(
            extractPostIdFromString("rhsPostMessageText_" + VALID_ID_26) === VALID_ID_26,
            "extractPostIdFromString from id",
        );
        assert(extractPostIdFromString("no_id_here") === null, "extractPostIdFromString null");

        // DOM path (эмулируем RHS/центр)
        const domPid = "abcdefghijklmnopqrstuvwxyz12".slice(0, 26); // 26 символов
        const el = document.createElement("div");
        el.id = "rhsPostMessageText_" + domPid;
        document.body.appendChild(el);
        assert(getRootPostIdFromDOM() === domPid, "getRootPostIdFromDOM finds RHS element");
        el.remove();

        ok("id-resolver: OK");
    } catch (e) { fail("id-resolver", e.message); }

    // -----------------------------
    // formatters tests
    // -----------------------------
    try {
        const { normalizeThread, formatDisplayName, toAIJSON } = MMS.formatters;

        const raw = {
            posts: {
                p2: { id: "p2", user_id: "u2", message: "Second", create_at: 2000 },
                p1: { id: "p1", user_id: "u1", message: "First", create_at: 1000 }
            },
            order: ["p2", "p1"]
        };

        const { messages, userIds } = normalizeThread(raw);
        assert(messages.length === 2, "normalizeThread: messages length");
        assert(messages[0].id === "p1" && messages[1].id === "p2", "normalizeThread: sorted by time asc");
        assert(userIds.includes("u1") && userIds.includes("u2"), "normalizeThread: userIds");

        assert(formatDisplayName({ username: "alice" }) === "alice", "formatDisplayName username");
        assert(formatDisplayName({ first_name: "Bob", last_name: "Builder" }) === "Bob Builder",
            "formatDisplayName first+last");
        assert(formatDisplayName({ id: "xyz" }).length > 0, "formatDisplayName fallback");

        const users = new Map([
            ["u1", { id: "u1", username: "alice" }],
            ["u2", { id: "u2", first_name: "Bob", last_name: "Builder" }]
        ]);
        const ai = toAIJSON(messages, users);
        assert(ai.length === 2 && ai[0].username && ai[0].ts && ai[0].message && ai[0].post_id,
            "toAIJSON: shape");
        assert(typeof ai[0].ts === "string" && /UTC$/.test(ai[0].ts), "toAIJSON: ts is UTC string");

        ok("formatters: OK");
    } catch (e) { fail("formatters", e.message); }

    // -----------------------------
    // UI smoke test (с заглушками API)
    // -----------------------------
    (async function () {
        try {
            const rawThread = {
                posts: {
                    r1: { id: "r1", user_id: "u1", message: "Root msg", create_at: 1000 },
                    c1: { id: "c1", user_id: "u2", message: "Reply 1", create_at: 2000, root_id: "r1" }
                },
                order: ["r1", "c1"]
            };

            const deps = {
                apiGetThread: async (rootId) => {
                    assert(rootId === "r1", "ui: rootId passed to apiGetThread");
                    await new Promise(r => setTimeout(r, 10));
                    return rawThread;
                },
                fetchUsers: async (ids) => {
                    assert(Array.isArray(ids), "ui: fetchUsers gets ids");
                    return new Map([
                        ["u1", { id: "u1", username: "alice" }],
                        ["u2", { id: "u2", first_name: "Bob", last_name: "Builder" }]
                    ]);
                },
                getRootPostId: () => "r1",
                formatDisplayName: MMS.formatters.formatDisplayName,
                normalizeThread: MMS.formatters.normalizeThread,
                toAIJSON: MMS.formatters.toAIJSON,
                extractPostIdFromString: MMS.idResolver.extractPostIdFromString
            };

            const panel = MMS.ui.createPanel(deps);
            document.body.appendChild(panel);

            await new Promise(r => setTimeout(r, 30));

            const sec = document.getElementById("mms-sec-thread");
            const txt = sec ? sec.textContent : "";
            assert(/Root msg/.test(txt) && /Reply 1/.test(txt), "ui: thread renders messages");

            ok("ui (smoke): OK");
        } catch (e) {
            fail("ui (smoke)", e.message);
        }

        const done = document.createElement("pre");
        done.textContent = "Готово. Запущено: " + new Date().toLocaleString();
        out.appendChild(done);
    })();
})();
