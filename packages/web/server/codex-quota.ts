// Official app-server account/rateLimits/read. No inference, account changes or credentials exposed.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { codexBin } from "./codex";

export type QuotaWindow = { label: string; remainingPercent: number; resetsAt: number | null };
export type Quota = { status: "available" | "unavailable"; windows: QuotaWindow[]; updatedAt: number | null };
export function quotaFromSnapshot(result: any, now = Date.now()): Quota {
  const snapshot = result?.rateLimits ?? result?.rateLimitsByLimitId?.codex;
  const windows: QuotaWindow[] = [];
  for (const key of ["primary", "secondary"]) {
    const w = snapshot?.[key];
    if (!w || typeof w.usedPercent !== "number" || !Number.isFinite(w.usedPercent)) continue;
    const minutes = w.windowDurationMins;
    const label = typeof minutes === "number" && minutes > 0 ? minutes % 1440 === 0 ? `${minutes / 1440} d` : minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min` : key;
    windows.push({ label, remainingPercent: Math.max(0, Math.min(100, 100 - w.usedPercent)), resetsAt: typeof w.resetsAt === "number" ? w.resetsAt * 1000 : null });
  }
  return { status: windows.length ? "available" : "unavailable", windows, updatedAt: windows.length ? now : null };
}

/** One lazy stdio connection; notifications plus a 15 s refresh while the UI polls. */
export class CodexQuota {
  private process: ChildProcessWithoutNullStreams | null = null;
  private connecting: Promise<void> | null = null;
  private pending = new Map<number, { done: (v: any) => void; fail: (e: Error) => void }>();
  private seq = 0;
  private cache: Quota = { status: "unavailable", windows: [], updatedAt: null };
  private checkedAt = 0;
  private inFlight: Promise<Quota> | null = null;
  constructor(private command = codexBin(), private args = ["app-server", "--listen", "stdio://"]) {}
  private rpc(method: string, params?: unknown): Promise<any> {
    return new Promise((done, fail) => {
      const id = ++this.seq;
      const timeout = setTimeout(() => { this.pending.delete(id); fail(new Error("Quota request timed out")); }, 12000);
      this.pending.set(id, { done: v => { clearTimeout(timeout); done(v); }, fail: e => { clearTimeout(timeout); fail(e); } });
      this.process!.stdin.write(JSON.stringify({ id, method, ...(params ? { params } : {}) }) + "\n");
    });
  }
  private connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const p = spawn(this.command, this.args, { windowsHide: true, stdio: "pipe" }); this.process = p;
      let buffer = "";
      p.stdout.setEncoding("utf8");
      p.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let event: any; try { event = JSON.parse(line); } catch { continue; }
          if (event.method === "account/rateLimits/updated") { this.cache = quotaFromSnapshot(event.params); this.checkedAt = Date.now(); }
          const request = this.pending.get(event.id);
          if (request) { this.pending.delete(event.id); event.error ? request.fail(new Error("Codex quota unavailable")) : request.done(event.result); }
          else if (event.id !== undefined && event.method) p.stdin.write(JSON.stringify({ id: event.id, error: { code: -32601, message: "Unsupported method" } }) + "\n");
        }
        if (buffer.length > 1_000_000) buffer = "";
      });
      p.stdin.on("error", () => {}); p.stderr.resume();
      const failed = () => { for (const request of this.pending.values()) request.fail(new Error("Codex connection closed")); this.pending.clear(); if (this.process === p) { this.process = null; this.connecting = null; } };
      p.on("error", failed); p.on("close", failed);
      await this.rpc("initialize", { clientInfo: { name: "adam_studio", title: "Adam Studio", version: "0.1.0" } });
      p.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    })();
    return this.connecting;
  }
  read(): Promise<Quota> {
    if (this.inFlight) return this.inFlight;
    if (Date.now() - this.checkedAt < 15000) return Promise.resolve(this.cache);
    this.inFlight = (async () => {
      try { await this.connect(); this.cache = quotaFromSnapshot(await this.rpc("account/rateLimits/read")); }
      catch { this.dispose(); this.cache = { status: "unavailable", windows: [], updatedAt: null }; }
      this.checkedAt = Date.now(); return this.cache;
    })().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  dispose(): void { const p = this.process; this.process = null; this.connecting = null; p?.kill(); }
}
