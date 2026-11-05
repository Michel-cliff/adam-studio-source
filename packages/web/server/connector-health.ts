// Whether a connector turned on really works, by asking it: "on" in the settings says nothing about a server that wants a
// sign-in, or one that starts but whose own service is not running.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Health = { state: "ok" | "sign-in" | "down"; detail?: string };
type Server = { type?: string; url?: string; command?: string; args?: string[]; env?: Record<string, string>; headers?: Record<string, string> };

// A server can start and list its tools while the service behind it is off. These tools only read, and answer for it.
const READ_ONLY_PROBES = ["capcut_list_projects"];
const INITIALIZE = { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "adam-studio", version: "1" } };
const short = (text: string) => text.trim().split(/\r?\n/)[0]!.slice(0, 160);

/** Whether Claude Code holds a sign-in for this server. Only that: the token itself is neither kept nor passed on. */
function signedIn(name: string, home: string): boolean {
  try {
    const all = JSON.parse(readFileSync(join(home, ".claude", ".credentials.json"), "utf8")).mcpOAuth ?? {};
    return Object.entries(all).some(([key, value]) => key.split("|")[0] === name && Boolean((value as { accessToken?: string }).accessToken));
  } catch { return false; }
}

async function checkHttp(name: string, server: Server, home: string, timeoutMs: number): Promise<Health> {
  try {
    const r = await fetch(server.url!, {
      method: "POST", signal: AbortSignal.timeout(timeoutMs),
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...server.headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: INITIALIZE }),
    });
    await r.body?.cancel();
    if (r.status === 401 || r.status === 403) return signedIn(name, home) ? { state: "ok" } : { state: "sign-in" };
    return r.status >= 500 ? { state: "down", detail: `HTTP ${r.status}` } : { state: "ok" };
  } catch (e) { return { state: "down", detail: short((e as Error).message) }; }
}

function checkStdio(server: Server, timeoutMs: number): Promise<Health> {
  return new Promise((resolve) => {
    // npx and the like are .cmd files on Windows: only a shell can start those.
    const shell = process.platform === "win32" && /(^|[\\/])(npx|npm|pnpm|yarn)$|\.(cmd|bat)$/i.test(server.command!);
    const args = (server.args ?? []).map((a) => (shell && /\s/.test(a) ? `"${a}"` : a));
    const child = spawn(server.command!, args, { env: { ...process.env, ...server.env }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell });
    let settled = false, buffer = "", stderr = "";
    const finish = (h: Health) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      else child.kill();
      resolve(h);
    };
    const timer = setTimeout(() => finish({ state: "down", detail: "no answer" }), timeoutMs);
    const send = (m: object) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...m })}\n`);
    child.on("error", (e) => finish({ state: "down", detail: short(e.message) }));
    child.on("exit", (code) => finish({ state: "down", detail: short(stderr) || `stopped (${code})` }));
    child.stdin.on("error", () => {});
    child.stderr.on("data", (d) => { stderr += d; });
    child.stdout.on("data", (d) => {
      buffer += d;
      let i: number;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        let m: { id?: number; result?: { tools?: { name: string }[]; isError?: boolean; content?: { text?: string }[] }; error?: { message?: string } };
        try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) { send({ method: "notifications/initialized" }); send({ id: 2, method: "tools/list", params: {} }); }
        else if (m.id === 2) {
          const probe = (m.result?.tools ?? []).find((t) => READ_ONLY_PROBES.includes(t.name));
          if (!probe) return finish({ state: "ok" });
          send({ id: 3, method: "tools/call", params: { name: probe.name, arguments: {} } });
        } else if (m.id === 3) {
          const text = m.result?.content?.map((c) => c.text ?? "").join(" ") ?? m.error?.message ?? "";
          const failed = Boolean(m.error || m.result?.isError) || /^\s*error|ECONNREFUSED|fetch failed|not running|not responding|unreachable/i.test(text);
          finish(failed ? { state: "down", detail: short(text) } : { state: "ok" });
        }
      }
    });
    send({ id: 1, method: "initialize", params: INITIALIZE });
  });
}

export function checkConnector(name: string, server: Server, home: string, timeoutMs = 25_000): Promise<Health> {
  if (server.url) return checkHttp(name, server, home, timeoutMs);
  if (server.command) return checkStdio(server, timeoutMs);
  return Promise.resolve({ state: "down", detail: "no command or address" });
}
