import { describe, expect, it } from "vitest";
import { bloomLayer, grainLayer, insertFilter } from "../../src/lib/inserts";

const off = { bw: 0, grain: 0, bloom: 0 };

describe("the inserts' archival treatment", () => {
  it("changes nothing when off", () => {
    expect(insertFilter(off)).toBe("none");
    expect(bloomLayer(off, 1920)).toBeNull();
    expect(grainLayer(off, 12)).toBeNull();
  });

  it("grades to a soft neutral black and white: milky blacks, open mids, no tint", () => {
    expect(insertFilter({ ...off, bw: 1 })).toBe("grayscale(1) contrast(0.92) brightness(1.06)");
    expect(insertFilter({ ...off, bw: 0.5 })).toBe("grayscale(0.5) contrast(0.96) brightness(1.03)");
  });

  it("blooms only the highlights, scaled to the frame, in black and white when the insert is", () => {
    const b = bloomLayer({ ...off, bw: 1, bloom: 0.5 }, 1920)!;
    expect(b.mixBlendMode).toBe("screen");
    expect(b.opacity).toBeCloseTo(0.25, 6);
    expect(b.filter).toBe("grayscale(1) brightness(1.15) contrast(1.8) blur(14px)");
    expect(bloomLayer({ ...off, bloom: 1 }, 960)!.filter).toBe("brightness(1.15) contrast(1.8) blur(7px)");
  });

  it("draws a new grain every frame, quiet even at full strength", () => {
    const a = grainLayer({ ...off, grain: 1 }, 12)!, b = grainLayer({ ...off, grain: 1 }, 13)!;
    expect(a.seed).not.toBe(b.seed);
    expect(a.opacity).toBeCloseTo(0.18, 6);
    expect(grainLayer({ ...off, grain: 0.5 }, 12)!.opacity).toBeCloseTo(0.115, 6);
  });
});
