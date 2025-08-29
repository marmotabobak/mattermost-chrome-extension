// tests-pick-click.js — интеграционный тест pickRootByClick (ручной выбор кликом)
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
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function waitFor(pred, timeout = 3000, step = 25) {
        const t0 = performance.now();
        while (performance.now() - t0 < timeout) {
            try { if (pred()) return; } catch { }
            await sleep(step);
        }
        throw new Error("Timeout waiting for condition");
    }

    (async function run() {
        try {
            // Ждём, когда smoke-тест завершится, чтобы не пересекаться
            await waitFor(() => window.__mms_smoke_done === true, 5000, 25);

            // Снести панель, если осталась от smoke
            const OLD = document.getElementById("mms-side-panel");
            if (OLD) {
                console.log("[pick] removing panel before start");
                OLD.remove();
            }

            const RAW = {
                posts: {
                    r1: { id: "r1", user_id: "u1", message: "Root via click", create_at: 1000 },
                    c1: { id: "c1", user_id: "u2", message: "Reply via click", create_at: 2000, root_id: "r1" }
                },
                order: ["r1", "c1"]
            };

            const PICK_ID = "1234567890abcdefghijklmnop"; // 26

            let calledWithId = null;
            const deps = {
                apiGetThread: async (id) => {
                    calledWithId = id;
                    console.log("[pick] apiGetThread called with", id);
                    await sleep(10);
                    return RAW;
                },
                fetchUsers: async (_ids) => {
                    console.log("[pick] fetchUsers");
                    return new Map([
                        ["u1", { id: "u1", username: "alice" }],
                        ["u2", { id: "u2", first_name: "Bob", last_name: "Builder" }]
                    ]);
                },
                // Возвращаем null — чтобы показать кнопку "Выбрать кликом"
                getRootPostId: () => null,
                formatDisplayName: MMS.formatters.formatDisplayName,
                normalizeThread: MMS.formatters.normalizeThread,
                toAIJSON: MMS.formatters.toAIJSON,
                extractPostIdFromString: MMS.idResolver.extractPostIdFromString
            };

            console.log("[pick] createPanel");
            const panel = MMS.ui.createPanel(deps);
            document.body.appendChild(panel);
            await sleep(50);

            // Находим кнопку "Выбрать кликом"
            const pickBtn = Array.from(panel.querySelectorAll(".mms-btn"))
                .find(b => /Выбрать кликом/.test(b.textContent || ""));
            assert(pickBtn, "pick button visible");
            console.log("[pick] click pick button");
            pickBtn.click();
            await sleep(20);

            // Ищем оверлей
            const overlays = Array.from(document.getElementsByTagName("div"))
                .filter(el => el.title === "Кликните по сообщению треда… (Esc — отмена)");
            assert(overlays.length === 1, "overlay appeared");
            const overlay = overlays[0];

            // Добавляем подложку и кликаем
            const fakeMsg = document.createElement("div");
            fakeMsg.id = "rhsPostMessageText_" + PICK_ID;
            overlay.appendChild(fakeMsg);

            const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
            console.log("[pick] dispatch click on fakeMsg");
            fakeMsg.dispatchEvent(evt);

            // Ждём загрузки и рендера
            await waitFor(() => {
                const p = document.getElementById("mms-side-panel");
                return p && p.__mms__ && p.__mms__.state && p.__mms__.state.messages.length >= 2;
            }, 2000, 50);

            assert(calledWithId === PICK_ID, "apiGetThread called with chosen id");

            const sec = document.getElementById("mms-sec-thread");
            const txt = sec ? sec.textContent : "";
            assert(/Root via click/.test(txt) && /Reply via click/.test(txt), "thread rendered after pick");

            ok("pickRootByClick: OK");
        } catch (e) {
            fail("pickRootByClick", e.message);
        }
    })();
})();
