import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createApp } from "./app";
import { JobManager } from "./jobs";
import { WEB } from "./paths";
import { projectsRoot, SETTINGS_FILE } from "./settings";
import { welcome } from "./welcome";
import { browserSession, launcherKey, launchProof } from "./browser-session";

const port = Number(process.env.ADAM_UI_PORT ?? 4317);
const url = `http://127.0.0.1:${port}`;

function newest(dir: string): number {
  return Math.max(...readdirSync(dir, { withFileTypes: true }).map((e) => e.isDirectory() ? newest(join(dir, e.name)) : statSync(join(dir, e.name)).mtimeMs));
}

function ensureBuilt(): void {
  const index = join(WEB, "dist", "index.html");
  if (existsSync(index) && statSync(index).mtimeMs >= newest(join(WEB, "app"))) return;
  console.log("Building the page...");
  const vite = join(dirname(createRequire(import.meta.url).resolve("vite/package.json")), "bin", "vite.js");
  execFileSync(process.execPath, [vite, "build"], { cwd: WEB, stdio: "inherit" });
}

function openBrowser(ticket: string): void {
  const launchUrl = `${url}/__adam/open/${ticket}`;
  if (process.env.ADAM_UI_NO_OPEN) { console.log(`Open ${launchUrl} to start a session`); return; }
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", launchUrl]] : process.platform === "darwin" ? ["open", [launchUrl]] : ["xdg-open", [launchUrl]];
  spawn(cmd as string, args as string[], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

async function existingTicket(key: string): Promise<string | undefined> {
  try {
    const challenge = Date.now() + "." + randomBytes(32).toString("hex");
    const res = await fetch(`${url}/__adam/launch`, { method: "POST", headers: { "x-adam-launcher": launchProof(key, challenge), "x-adam-challenge": challenge }, signal: AbortSignal.timeout(1500), redirect: "error" });
    if (!res.ok) return;
    const ticket = await res.text();
    if (/^[a-f0-9]{64}$/.test(ticket)) return ticket;
  } catch { /* The port belongs to another service or an older Studio. */ }
}

ensureBuilt();
const jobs = new JobManager();
const key = launcherKey(dirname(SETTINGS_FILE), port);
const session = browserSession(key, port, launcherKey(dirname(SETTINGS_FILE), port, "mcp"));
const server = createApp({ jobs, browserSession: session });
server.on("error", async (e: NodeJS.ErrnoException) => {
  if (e.code !== "EADDRINUSE") throw e;
  const ticket = await existingTicket(key);
  if (ticket) { openBrowser(ticket); process.exit(0); }
  console.error(`Port ${port} is taken by another program. Set ADAM_UI_PORT to a free port.`);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Adam Studio: ${url} (Ctrl+C to stop)`);
  // First launch: the welcome project, made from the tutorial video (once, on an empty projects folder).
  try { welcome(projectsRoot(), join(dirname(SETTINGS_FILE), "welcomed"), jobs); } catch (e) { console.error(`welcome project: ${(e as Error).message}`); }
  openBrowser(session.issue());
});
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { jobs.stopAll(); process.exit(0); });
