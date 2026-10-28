import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { usageSummary } from "../../server/usage";

describe("the subscription windows", () => {
  it("show empty once their reset time has passed, even before the next ask", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam usage-"));
    const now = 1_000_000_000_000;
    writeFileSync(join(dir, "usage-limits.json"), JSON.stringify({ fiveHour: { used: 1, resetsAt: now - 1000 }, sevenDay: { used: 0.4, resetsAt: now + 1000 }, at: now - 9000 }));
    const l = usageSummary(dir, now).limits!;
    expect(l.fiveHour.used).toBe(0);
    expect(l.sevenDay.used).toBe(0.4);
  });
});
