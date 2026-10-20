import { describe, expect, it } from "vitest";
import { searchOnline } from "../src/online";

const dead = async () => { throw new Error("The operation was aborted due to timeout"); };

describe("online search when a library is down", () => {
  it("skips a library that just timed out instead of waiting on it again", async () => {
    let calls = 0;
    const flaky = { openverse: async () => { calls++; return dead(); } };
    const t0 = 1_000_000;
    const first = await searchOnline("job ad", "image", 8, flaky, t0);
    expect(first.notes.join(" ")).toMatch(/openverse: The operation was aborted/);
    const again = await searchOnline("rejected stamp", "image", 8, flaky, t0 + 60_000);
    expect(calls).toBe(1);
    expect(again.notes.join(" ")).toMatch(/openverse: not answering, skipped until/);
    await searchOnline("later", "image", 8, flaky, t0 + 11 * 60_000);
    expect(calls).toBe(2);
  });

  it("tells Claude plainly to stop searching online when no library answers", async () => {
    const r = await searchOnline("anything", "image", 8, { openverse: dead }, 5_000_000);
    expect(r.items).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/No online library answers right now: stop searching online/);
  });
});
