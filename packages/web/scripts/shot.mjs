// Usage: node packages/web/scripts/shot.mjs <url> <out.png> [waitMs] [js-to-run-after-load]   (W, H env: window size)
// Needs a headless Chrome with CDP on 9223 (see CLAUDE.md). Prefer measuring with the js argument over reading screenshots.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const WebSocket = require("ws");
const [url, out, wait = "6000", js = ""] = process.argv.slice(2);
const t = await (await fetch("http://127.0.0.1:9223/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.on("open", r));
let id = 0; const pending = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: Number(process.env.W || 1440), height: Number(process.env.H || 900), deviceScaleFactor: 1, mobile: false });
await send("Runtime.enable");
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, Number(wait)));
if (js) { const r = await send("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true }); console.log(JSON.stringify(r.result?.result?.value ?? r.result)); await new Promise((r) => setTimeout(r, 2500)); }
const errs = await send("Runtime.evaluate", { expression: "JSON.stringify(window.__errs||[])", returnByValue: true });
const s = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(s.result.data, "base64"));
await fetch(`http://127.0.0.1:9223/json/close/${t.id}`);
ws.close(); console.log("saved", out);
