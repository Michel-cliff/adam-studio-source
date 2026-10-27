import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseUsage, recordUsage, usageSummary } from "../../server/usage";

// Lines as Claude Code prints them with --output-format stream-json (trimmed to the fields that matter).
const LIMITS = JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", resetsAt: 1792524600, rateLimitType: "five_hour", utilization: 0.93,
  unifiedWindows: { five_hour: { utilization: 0.93, resetsAt: 1792524600 }, seven_day: { utilization: 0.12, resetsAt: 1793095200 } } } });
const RESULT = JSON.stringify({ type: "result", subtype: "success", total_cost_usd: 0.42, duration_ms: 61000, num_turns: 9,
  usage: { input_tokens: 10, cache_creation_input_tokens: 37413, cache_read_input_tokens: 120000, output_tokens: 2100 },
  modelUsage: { "claude-sonnet-5-5": { costUSD: 0.42 } } });
const OUTPUT = ["{\"type\":\"system\",\"subtype\":\"init\",\"model\":\"claude-sonnet-5-5\"}", LIMITS, "{\"type\":\"assistant\"}", RESULT, ""].join("\n");

describe("Claude usage", () => {
  it("reads cost, tokens, model and the subscription windows from a job's stream", () => {
    const u = parseUsage(OUTPUT)!;
    expect(u.costUsd).toBe(0.42);
    expect(u.tokens).toEqual({ input: 157423, output: 2100 });
    expect(u.model).toBe("claude-sonnet-5-5");
    expect(u.limits).toEqual({ fiveHour: { used: 0.93, resetsAt: 1792524600000 }, sevenDay: { used: 0.12, resetsAt: 1793095200000 } });
  });

  it("returns nothing for a stream with no result (a stopped or failed start)", () => {
    expect(parseUsage("{\"type\":\"system\"}\n")).toBeNull();
  });

  it("adds every ask to today's total and keeps the latest windows", () => {
    const dir = mkdtempSync(join(tmpdir(), "usage-"));
    const now = Date.UTC(2026, 9, 20, 18, 0);
    recordUsage(dir, { project: "demo", step: "hook", ...parseUsage(OUTPUT)! }, now - 26 * 3600_000); // yesterday
    recordUsage(dir, { project: "demo", step: "hook", ...parseUsage(OUTPUT)! }, now - 60_000);
    recordUsage(dir, { project: "other", step: "cuts", ...parseUsage(OUTPUT)!, costUsd: 0.1 }, now);
    const s = usageSummary(dir, now);
    expect(s.today.asks).toBe(2);
    expect(s.today.costUsd).toBeCloseTo(0.52);
    expect(s.last?.project).toBe("other");
    expect(s.limits?.fiveHour.used).toBe(0.93);
  });

  it("works before the first ask", () => {
    const s = usageSummary(mkdtempSync(join(tmpdir(), "usage-")), Date.now());
    expect(s).toEqual({ today: { asks: 0, costUsd: 0, tokens: 0 }, last: null, limits: null });
  });
});
