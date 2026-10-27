// What Claude costs: each ask's tokens and API-list value, and the subscription windows (five hours, seven days) that
// Claude Code reports in its stream (rate_limit_event). Kept as one JSON line per ask in ~/.adam-studio/usage.jsonl.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Window = { used: number; resetsAt: number };
export type Limits = { fiveHour: Window; sevenDay: Window };
export type Usage = { costUsd: number; tokens: { input: number; output: number }; model: string | null; durationMs: number | null; limits: Limits | null };
export type UsageRecord = Usage & { at: number; project: string; step: string };
export type UsageSummary = { today: { asks: number; costUsd: number; tokens: number }; last: UsageRecord | null; limits: (Limits & { at: number }) | null };

const window = (w: any): Window | null => (w && typeof w.utilization === "number" ? { used: w.utilization, resetsAt: Number(w.resetsAt) * 1000 } : null);

/** The usage of one Claude Code run, from its stream-json output; null when the run produced no result. */
export function parseUsage(output: string): Usage | null {
  let result: any = null, limits: Limits | null = null, model: string | null = null;
  for (const line of output.split("\n")) {
    if (!line.startsWith("{")) continue;
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "system" && e.subtype === "init" && e.model) model = String(e.model);
    if (e.type === "rate_limit_event") {
      const w = e.rate_limit_info?.unifiedWindows ?? {};
      const five = window(w.five_hour), seven = window(w.seven_day);
      if (five && seven) limits = { fiveHour: five, sevenDay: seven };
    }
    if (e.type === "result") result = e;
  }
  if (!result) return null;
  const u = result.usage ?? {};
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return {
    costUsd: Number(result.total_cost_usd ?? 0),
    tokens: { input, output: u.output_tokens ?? 0 },
    model: model ?? Object.keys(result.modelUsage ?? {})[0] ?? null,
    durationMs: typeof result.duration_ms === "number" ? result.duration_ms : null,
    limits,
  };
}

export function recordUsage(dir: string, r: Omit<UsageRecord, "at">, at = Date.now()): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "usage.jsonl"), `${JSON.stringify({ ...r, at })}\n`);
  if (r.limits) writeFileSync(join(dir, "usage-limits.json"), JSON.stringify({ ...r.limits, at }));
}

export function usageSummary(dir: string, now = Date.now()): UsageSummary {
  const file = join(dir, "usage.jsonl");
  const rows: UsageRecord[] = existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
    : [];
  const day = new Date(now).toDateString();
  const today = rows.filter((r) => new Date(r.at).toDateString() === day);
  let limits: UsageSummary["limits"] = null;
  try { limits = JSON.parse(readFileSync(join(dir, "usage-limits.json"), "utf8")); } catch { /* none yet */ }
  return {
    today: { asks: today.length, costUsd: today.reduce((s, r) => s + r.costUsd, 0), tokens: today.reduce((s, r) => s + r.tokens.input + r.tokens.output, 0) },
    last: rows.at(-1) ?? null,
    limits,
  };
}
