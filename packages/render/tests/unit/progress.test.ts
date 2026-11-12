import { describe, expect, it } from "vitest";
import { progressFill } from "../../src/lib/progress";

const blocks = { block: 24, gap: 2 };

describe("the progress bar", () => {
  it("is empty on the first frame and full on the last", () => {
    expect(progressFill(0, 301, 1080, blocks)).toEqual([]);
    const full = progressFill(300, 301, 1080, blocks);
    expect(full).toHaveLength(45);
    expect(full.at(-1)).toEqual({ x: 1056, w: 22 });
  });

  it("lights whole blocks only, each one once the edit has passed its end", () => {
    // Half way: 540 px, so 22 whole blocks of 24 px (528 px), not 22.5.
    const half = progressFill(150, 301, 1080, blocks);
    expect(half).toHaveLength(22);
    expect(half[1]).toEqual({ x: 24, w: 22 });
  });

  it("scales with the frame and fills continuously when blocks are off", () => {
    expect(progressFill(300, 301, 2160, blocks)[1]).toEqual({ x: 48, w: 44 });
    expect(progressFill(150, 301, 1080, { block: 0, gap: 2 })).toEqual([{ x: 0, w: 540 }]);
  });
});
