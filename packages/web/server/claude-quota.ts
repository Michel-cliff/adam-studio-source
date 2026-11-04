import { spawn } from "node:child_process";
import { claudeBin } from "./claude";
import { usageSummary } from "./usage";
import type { Quota } from "./codex-quota";

/** /usage is a local built-in command. Zero model turns, no tools or MCP access. */
export function quotaFromClaude(output: string, now = Date.now()): Quota {
  const windows = new Map<string, Quota["windows"][number]>();
  for (const line of output.split("\n")) {
    let e: any; try { e = JSON.parse(line); } catch { continue; }
    const rows = e.usage_report?.rate_limits?.limits;
    if (Array.isArray(rows)) for (const row of rows) {
      const label = row.kind === "session" ? "5 h" : row.kind === "weekly_all" ? "7 d" : null;
      const resetsAt = typeof row.resets_at === "string" ? Date.parse(row.resets_at) : NaN;
      if (label && typeof row.percent === "number" && Number.isFinite(row.percent) && row.percent >= 0 && Number.isFinite(resetsAt) && resetsAt > now) windows.set(label, { label, remainingPercent: Math.max(0, 100 - row.percent), resetsAt });
    }
  }
  return { status: windows.size ? "available" : "unavailable", windows: [...windows.values()], updatedAt: windows.size ? now : null };
}

export class ClaudeQuota {
  private cached: Quota = { status: "unavailable", windows: [], updatedAt: null };
  private next = 0;
  private pending: Promise<Quota> | null = null;
  private child: ReturnType<typeof spawn> | null = null;
  constructor(private dir: string) {}
  async read(): Promise<Quota> {
    if (Date.now() >= this.next && !this.pending) {
      this.pending = this.probe().then(q => { this.cached = q; this.next = Date.now() + (q.status === "available" ? 60_000 : 300_000); return q; }).finally(() => { this.pending = null; });
    }
    if (this.pending) await this.pending;
    const now = Date.now();
    const live = this.cached.windows.filter(w => w.resetsAt && w.resetsAt > now);
    if (live.length) return { ...this.cached, windows: live };
    // Claude's reported windows remain useful only until reset, never fabricate an empty balance.
    const s = usageSummary(this.dir, now).limits;
    const windows: Quota["windows"] = [];
    if (s) for (const [label, w] of [["5 h", s.fiveHour], ["7 d", s.sevenDay]] as const) {
      if (Number.isFinite(w.used) && w.used >= 0 && w.used <= 1 && w.resetsAt > now) windows.push({ label, remainingPercent: (1 - w.used) * 100, resetsAt: w.resetsAt });
    }
    return { status: windows.length ? "available" : "unavailable", windows, updatedAt: windows.length ? s!.at : null };
  }
  private probe(): Promise<Quota> {
    return new Promise(resolve => {
      let output = "", ended = false;
      const finish = () => { if (ended) return; ended = true; clearTimeout(timeout); resolve(quotaFromClaude(output)); };
      const timeout = setTimeout(() => { this.child?.kill(); finish(); }, 12_000);
      try {
        const child = this.child = spawn(claudeBin(), ["-p", "/usage", "--output-format", "stream-json", "--verbose", "--max-turns", "0", "--tools", "", "--strict-mcp-config", "--mcp-config", JSON.stringify({ mcpServers: {} }), "--setting-sources", ""], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        child.stdout?.on("data", d => { output = (output + d).slice(-200_000); });
        child.once("error", finish); child.once("close", finish);
      } catch { finish(); }
    });
  }
  dispose() { this.child?.kill(); }
}
