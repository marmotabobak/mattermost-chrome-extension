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

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function waitFor(pred, timeout = 2500, step = 25, onTick) {
        const t0 = performance.now();
        while (performance.now() - t0 < timeout) {
            try { if (pred()) return; } catch { }
            if (onTick) onTick(performance.now() - t0);
            await sleep(step);
        }
        throw new Error("Timeout waiting for condition");
    }

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

        const VALID_ID_26 = "1234567890abcdefghijklmnop"; // 26 символов

        assert(isValidPostId(VALID_ID_26) === true, "isValidPostId(true)");
        assert(isValidPostId("short") === false, "isValidPostId(false)");

        assert(
            extractPostIdFromString("rhsPostMessageText_" + VALID_ID_26) === VALID_ID_26,
            "extractPostIdFromString from id",
        );
        assert(extractPostIdFromString("no_id_here") === null, "extractPostIdFromString null");

        const domPid = "abcdefghijklmnopqrstuvwxyz12".slice(0, 26);
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

    // Отметим, что unit-пакет завершён (для последовательности с pick-click)
    window.__mms_unit_done = true;

    // -----------------------------
    // UI smoke test (с заглушками API)
    // -----------------------------
    (async function () {
        try {
            // Ждём, чтобы unit-часть точно отметилась (на всякий случай)
            await waitFor(() => window.__mms_unit_done === true, 1000, 25);

            // Снести старую панель (если оставалась от прежнего теста/запуска)
            const OLD = document.getElementById("mms-side-panel");
            if (OLD) {
                console.log("[smoke] removing existing panel before start");
                OLD.remove();
            }

            const rawThread = {
                posts: {
                    r1: { id: "r1", user_id: "u1", message: "Root msg", create_at: 1000 },
                    c1: { id: "c1", user_id: "u2", message: "Reply 1", create_at: 2000, root_id: "r1" }
                },
                order: ["r1", "c1"]
            };

            const deps = {
                apiGetThread: async (rootId) => {
                    console.log("[smoke] apiGetThread called with", rootId);
                    if (rootId !== "r1") throw new Error("unexpected rootId " + rootId);
                    await sleep(10);
                    return rawThread;
                },
                fetchUsers: async (ids) => {
                    console.log("[smoke] fetchUsers ids:", ids);
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

            // (A) ждём готовности состояния (>=2 сообщения), с прогресс-логом
            await waitFor(() => {
                const p = document.getElementById("mms-side-panel");
                const len = p && p.__mms__ && p.__mms__.state && p.__mms__.state.messages.length;
                return len >= 2;
            }, 3000, 50, (ms) => {
                const p = document.getElementById("mms-side-panel");
                const len = p && p.__mms__ && p.__mms__.state ? p.__mms__.state.messages.length : 0;
                if (ms % 200 < 50) console.log(`[smoke] waiting state messages… ${len}`);
            });

            // (B) форсируем таб Thread (на случай, если вкладка не активна)
            if (panel.__mms__ && typeof panel.__mms__.setActiveTab === "function") {
                console.log("[smoke] setActiveTab('thread')");
                panel.__mms__.setActiveTab("thread");
            }

            // (C) ждём появления текста в DOM
            await waitFor(() => {
                const sec = document.getElementById("mms-sec-thread");
                const txt = sec ? (sec.textContent || "") : "";
                return /Root msg/.test(txt) && /Reply 1/.test(txt);
            }, 1200, 50, (ms) => {
                if (ms % 200 < 50) {
                    const sec = document.getElementById("mms-sec-thread");
                    const txt = sec ? (sec.textContent || "") : "";
                    console.log("[smoke] waiting DOM… seen=", JSON.stringify(txt.slice(0, 60)));
                }
            });

            ok("ui (smoke): OK");
        } catch (e) {
            fail("ui (smoke)", e.message);
        } finally {
            // Сигнал для pick-click: smoke завершился (успех/ошибка не важно)
            window.__mms_smoke_done = true;
        }

        const done = document.createElement("pre");
        done.textContent = "Готово. Запущено: " + new Date().toLocaleString();
        out.appendChild(done);
    })();
})();
