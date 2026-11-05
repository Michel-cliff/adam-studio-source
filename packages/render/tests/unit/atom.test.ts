import { describe, expect, it } from "vitest";
import { atomOrbit, atomPixels, seedAngle } from "../../src/lib/atom";

describe("the atoms around an important passage", () => {
  const box = { cx: 540, cy: 900, rx: 400, ry: 600 };
  it("loop around the block and come back where they started", () => {
    const a = atomOrbit(0, 0, 2, 0, box), b = atomOrbit(3600, 0, 2, 0, box);
    expect(b.x).toBeCloseTo(a.x, 3);
    expect(b.y).toBeCloseTo(a.y, 3);
  });
  it("stay on opposite sides of the block", () => {
    const a = atomOrbit(1000, 0, 2, 0, box), b = atomOrbit(1000, 1, 2, 0, box);
    expect(a.x + b.x).toBeCloseTo(2 * box.cx, 5);
    expect(a.y + b.y).toBeCloseTo(2 * box.cy, 5);
  });
  it("spin on themselves", () => {
    expect(atomOrbit(500, 0, 2, 0, box).spin).not.toBe(atomOrbit(0, 0, 2, 0, box).spin);
  });
  it("start somewhere else at each appearance", () => {
    expect(seedAngle("stack-1")).not.toBe(seedAngle("stack-2"));
    expect(seedAngle("stack-1")).toBe(seedAngle("stack-1"));
  });
});

describe("the pixel atom", () => {
  it("is drawn in whole cells inside its grid, with its nucleus in the middle", () => {
    const cells = atomPixels(0, 32);
    expect(cells.length).toBeGreaterThan(60);
    for (const [x, y] of cells) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(x >= 0 && x < 32 && y >= 0 && y < 32).toBe(true);
    }
    expect(cells.some(([x, y]) => x === 16 && y === 16)).toBe(true);
    expect(new Set(cells.map((c) => c.join())).size).toBe(cells.length);
  });
  it("turns: its pixels move from one moment to the next", () => {
    expect(atomPixels(400, 32).map((c) => c.join()).sort()).not.toEqual(atomPixels(0, 32).map((c) => c.join()).sort());
  });
});
