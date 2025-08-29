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

    (async function run() {
        try {
            assert(window.MMS && MMS.ui, "MMS.ui loaded");

            // Подготовим «сырой» тред, который вернёт наш фейковый API
            const RAW = {
                posts: {
                    r1: { id: "r1", user_id: "u1", message: "Root via click", create_at: 1000 },
                    c1: { id: "c1", user_id: "u2", message: "Reply via click", create_at: 2000, root_id: "r1" }
                },
                order: ["r1", "c1"]
            };

            // 26-символьный фейковый postId, который «кликнем» по оверлею
            const PICK_ID = "1234567890abcdefghijklmn"; // длина 26

            // Заглушки зависимостей, как их ждёт UI.createPanel
            let calledWithId = null;
            const deps = {
                apiGetThread: async (id) => {
                    calledWithId = id;
                    await sleep(10);
                    return RAW;
                },
                fetchUsers: async (_ids) => {
                    return new Map([
                        ["u1", { id: "u1", username: "alice" }],
                        ["u2", { id: "u2", first_name: "Bob", last_name: "Builder" }]
                    ]);
                },
                // Возвращаем null, чтобы UI показал "RootId не найден" + кнопку "Выбрать кликом"
                getRootPostId: () => null,
                formatDisplayName: MMS.formatters.formatDisplayName,
                normalizeThread: MMS.formatters.normalizeThread,
                toAIJSON: MMS.formatters.toAIJSON,
                extractPostIdFromString: MMS.idResolver.extractPostIdFromString
            };

            // Создаём панель
            const panel = MMS.ui.createPanel(deps);
            document.body.appendChild(panel);
            await sleep(20); // дать времени первичному рендеру

            // Находим кнопку "Выбрать кликом" и жмём
            const pickBtn = panel.querySelector(".mms-btn");
            assert(pickBtn && /Выбрать кликом/.test(pickBtn.textContent), "pick button visible");
            pickBtn.click();
            await sleep(10); // дождаться появления оверлея

            // Ищем оверлей по title (как в ui.js)
            const overlays = Array.from(document.getElementsByTagName("div"))
                .filter(el => el.title === "Кликните по сообщению треда… (Esc — отмена)");
            assert(overlays.length === 1, "overlay appeared");
            const overlay = overlays[0];

            // Добавляем внутрь оверлея «подложку» с id, содержащим postId
            // (в реальности клик по оверлею не видит подложку, но для теста
            //  создаём дочерний элемент внутри, чтобы e.target был с нужным id)
            const fakeMsg = document.createElement("div");
            fakeMsg.id = "rhsPostMessageText_" + PICK_ID;
            overlay.appendChild(fakeMsg);

            // Генерируем клик по дочернему элементу — обработчик поднимется и найдёт id
            const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
            fakeMsg.dispatchEvent(evt);

            // Дать UI время сделать apiGetThread + fetchUsers + рендер
            await sleep(40);

            // Проверяем, что вызвали API с нашим PICK_ID
            assert(calledWithId === PICK_ID, "apiGetThread called with chosen id");

            // Проверяем, что отрендерился тред
            const sec = document.getElementById("mms-sec-thread");
            const txt = sec ? sec.textContent : "";
            assert(/Root via click/.test(txt) && /Reply via click/.test(txt), "thread rendered after pick");

            ok("pickRootByClick: OK");
        } catch (e) {
            fail("pickRootByClick", e.message);
        }
    })();
})();
