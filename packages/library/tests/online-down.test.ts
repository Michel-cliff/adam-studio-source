import { afterEach, describe, expect, it, vi } from "vitest";
import { searchOnline } from "../src/online";

const dead = async () => { throw new Error("The operation was aborted due to timeout"); };

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("online sources", () => {
  it("asks only Pixabay and Freesound, and names only their keys when missing", async () => {
    const hosts = new Set<string>();
    vi.stubGlobal("fetch", async (url: string) => {
      hosts.add(new URL(url).host);
      return new Response(JSON.stringify({ hits: [], results: [] }), { status: 200 });
    });
    vi.stubEnv("PIXABAY_API_KEY", "k");
    vi.stubEnv("FREESOUND_API_KEY", "k");
    for (const kind of ["image", "video", "audio"] as const) await searchOnline("x", kind, 3);
    expect([...hosts].sort()).toEqual(["freesound.org", "pixabay.com"]);
  });
});

describe("online search when a library is down", () => {
  it("skips a library that just timed out instead of waiting on it again", async () => {
    let calls = 0;
    const flaky = { pixabay: async () => { calls++; return dead(); } };
    const t0 = 1_000_000;
    const first = await searchOnline("job ad", "image", 8, flaky, t0);
    expect(first.notes.join(" ")).toMatch(/pixabay: The operation was aborted/);
    const again = await searchOnline("rejected stamp", "image", 8, flaky, t0 + 60_000);
    expect(calls).toBe(1);
    expect(again.notes.join(" ")).toMatch(/pixabay: not answering, skipped until/);
    await searchOnline("later", "image", 8, flaky, t0 + 11 * 60_000);
    expect(calls).toBe(2);
  });

  it("tells Claude plainly to stop searching online when no library answers", async () => {
    const r = await searchOnline("anything", "image", 8, { pixabay: dead }, 5_000_000);
    expect(r.items).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/No online library answers right now: stop searching online/);
  });
});
