import { describe, expect, it } from "vitest";
import { BOARD_FRAMES, boardFrame, ICONS, pickIcons } from "../../src/lib/pixelicons";

describe("the board dress of the 4:3 window", () => {
  it("draws its frame among five, never the viewfinder, always the same for one element", () => {
    expect(BOARD_FRAMES).toEqual(["sticker", "fig", "notch", "loading", "folder"]);
    const ids = Array.from({ length: 40 }, (_, i) => `window-${i}`);
    for (const id of ids) expect(boardFrame(id)).toBe(boardFrame(id));
    expect(new Set(ids.map((id) => boardFrame(id))).size).toBe(5);
  });
  it("keeps a frame asked for", () => {
    expect(boardFrame("x", "notch")).toBe("notch");
  });
  it("has pixel icons of 12 x 12 cells, and scatters a stable few of them", () => {
    for (const [name, rows] of Object.entries(ICONS)) {
      expect(rows, name).toHaveLength(12);
      for (const r of rows) expect(r, name).toHaveLength(12);
    }
    expect(pickIcons("window-1", 4)).toEqual(pickIcons("window-1", 4));
    expect(new Set(pickIcons("window-1", 4)).size).toBe(4);
  });
});
