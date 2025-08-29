// tests/logger.js — простая панель логов для test-runner (НЕ трогаем код расширения)
(() => {
    const PANEL_ID = "mms-test-logs";
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.position = "fixed";
    panel.style.right = "12px";
    panel.style.bottom = "12px";
    panel.style.width = "420px";
    panel.style.maxHeight = "40vh";
    panel.style.background = "#111827";
    panel.style.color = "#e5e7eb";
    panel.style.border = "1px solid rgba(255,255,255,0.15)";
    panel.style.borderRadius = "10px";
    panel.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
    panel.style.zIndex = "999999";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.overflow = "hidden";
    panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#0b1220;border-bottom:1px solid rgba(255,255,255,0.1)">
      <strong style="margin-right:auto">Logs</strong>
      <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="mms-log-capture" checked />
        Capture console
      </label>
      <button id="mms-log-clear" style="border:1px solid rgba(255,255,255,0.2);background:#111827;color:#e5e7eb;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer">Clear</button>
    </div>
    <pre id="mms-log-pre" style="flex:1;margin:0;padding:8px 10px;overflow:auto;white-space:pre-wrap"></pre>
  `;
    document.body.appendChild(panel);

    const pre = panel.querySelector("#mms-log-pre");
    const clearBtn = panel.querySelector("#mms-log-clear");
    const captureCb = panel.querySelector("#mms-log-capture");

    const orig = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    };

    function ts() {
        const d = new Date();
        return d.toISOString().split("T")[1].replace("Z", "Z");
    }

    function append(kind, args) {
        try {
            const text = args.map((a) => {
                if (a instanceof Error) return a.stack || a.message;
                if (typeof a === "object") return JSON.stringify(a, null, 2);
                return String(a);
            }).join(" ");
            pre.textContent += `[${ts()}] ${kind.toUpperCase()}  ${text}\n`;
            pre.scrollTop = pre.scrollHeight;
        } catch { }
    }

    function hook() {
        console.log = (...a) => { append("log", a); orig.log(...a); };
        console.warn = (...a) => { append("warn", a); orig.warn(...a); };
        console.error = (...a) => { append("error", a); orig.error(...a); };
    }
    function unhook() {
        console.log = orig.log;
        console.warn = orig.warn;
        console.error = orig.error;
    }

    captureCb.addEventListener("change", () => captureCb.checked ? hook() : unhook());
    clearBtn.addEventListener("click", () => { pre.textContent = ""; });

    // включено по умолчанию
    hook();

    // Экспорт на всякий
    window.MMS_TEST_LOGGER = { clear: () => (pre.textContent = ""), hook, unhook };
})();
