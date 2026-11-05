import { describe, expect, it } from "vitest";
import type { Timeline } from "@adam-studio/model";
import { legibilitySpec, mergeLegibility } from "../../src/lib/legibility";

const tl = {
  format: "9:16", width: 1080, height: 1920, fps: 30, durationFrames: 300,
  clips: [
    { id: "c1", asset: "c01", fromFrame: 0, durationFrames: 150, sourceInMs: 2000, sourceOutMs: 7000 },
    { id: "c2", asset: "c01", fromFrame: 150, durationFrames: 150, sourceInMs: 10000, sourceOutMs: 15000 },
  ],
  captions: [
    { id: "k1", fromFrame: 30, durationFrames: 30, text: "un deux", highlightRanges: [], x: 0.5, y: 0.6 },
    { id: "k2", fromFrame: 135, durationFrames: 30, text: "trois", highlightRanges: [], x: 0.5, y: 0.6 },
  ],
  style: { caption: { size: 0.052 } },
} as unknown as Timeline;

describe("what the legibility pass is asked", () => {
  const spec = legibilitySpec(tl, { c01: "C:/p/cache/c01/edit.mp4" });

  it("gives each caption a box 720 px wide, centred, two lines high, and the 9:16 caption band", () => {
    expect(spec.band).toEqual([950, 1248]);
    const [x0, y0, x1, y1] = spec.items[0]!.box;
    expect([x0, x1]).toEqual([180, 900]);
    expect(Math.abs((y0 + y1) / 2 - 1152)).toBeLessThanOrEqual(1);
    expect(y1 - y0).toBe(Math.round(2 * 0.052 * 1080 * 1.15));
  });

  it("finds the moments of the take under each caption, across a cut", () => {
    expect(spec.items[0]!.samples).toEqual([{ take: "c01", ms: 3200 }, { take: "c01", ms: 3500 }, { take: "c01", ms: 3800 }]);
    // k2 straddles the cut at frame 150: its first moment is in c1, its last in c2.
    expect(spec.items[1]!.samples.map((s) => s.ms)).toEqual([6700, 10000, 10300]);
  });

  it("merges the answer: the treatment, and the height back as a share of the frame", () => {
    const out = mergeLegibility(tl, { k1: { treatment: 2, y: 1000, burnt: 0 } });
    expect(out.captions[0]).toMatchObject({ treatment: 2, y: 1000 / 1920 });
    expect(out.captions[1]!.treatment).toBeUndefined();
  });
});

describe("default placement after cached analysis", () => {
  it("ignores stale caption heights in the face or above the head", () => {
    const defaultTl = { ...tl, style: { ...tl.style, name: "Default" }, elements: [], warnings: [] };
    const out = mergeLegibility(defaultTl, { k1: { treatment: 2, y: 700, burnt: 0 } });
    expect(out.captions[0]!.y).toBeGreaterThan(2 / 3);
    expect(legibilitySpec(defaultTl, {}).keepBand).toBe(true);
  });
});
