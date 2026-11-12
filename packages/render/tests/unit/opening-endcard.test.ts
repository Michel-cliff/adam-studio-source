import { describe, expect, it } from "vitest";
import { parseStyle, resolve } from "@adam-studio/model";
import { ARROW, cursorAt, FOLDER, iconBoxes, targetOf } from "../../src/lib/endcard";
import { openingAt } from "../../src/lib/opening";
import { projectInput, styleInput } from "./helpers";
import { parseProject } from "@adam-studio/model";

const crt = { openMs: 400, scanlines: 0.3, scanlineFrames: 3 };

describe("the CRT opening", () => {
  it("stretches the line first, then opens the frame, then bursts the scanlines for a few frames", () => {
    expect(openingAt(0, 30, crt)).toEqual({ line: 0, open: 0, scanlines: 0 });
    const mid = openingAt(4, 30, crt); // a third of the way: the line grows, the frame is still shut
    expect(mid.line).toBeGreaterThan(0); expect(mid.line).toBeLessThan(1); expect(mid.open).toBe(0);
    const opening = openingAt(9, 30, crt);
    expect(opening.line).toBe(1); expect(opening.open).toBeGreaterThan(0); expect(opening.open).toBeLessThan(1);
    expect(openingAt(12, 30, crt)).toEqual({ line: 1, open: 1, scanlines: 0.3 });
    expect(openingAt(14, 30, crt).scanlines).toBe(0.3);
    expect(openingAt(15, 30, crt).scanlines).toBe(0);
  });

  it("is added over the first frames of every edit when the style asks for it", () => {
    const p = parseProject(projectInput());
    const s = parseStyle({ ...styleInput, opening: { line: "#E4E2BF" } });
    if (!p.ok || !s.ok) throw new Error("bad fixture");
    const el = resolve(p.value, s.value).elements[0]!;
    expect(el).toMatchObject({ id: "style.opening", kind: "open.crt", layer: "front", fromFrame: 0, durationFrames: 16 });
    const plain = parseStyle(styleInput);
    if (!plain.ok) throw new Error("bad fixture");
    expect(resolve(p.value, plain.value).elements.some((e) => e.kind === "open.crt")).toBe(false);
  });
});

describe("the desktop end card", () => {
  it("draws even pixel grids", () => {
    for (const grid of [FOLDER, ARROW]) expect(new Set(grid.map((r) => r.length)).size).toBe(1);
  });

  it("lines the folders down the left, 96 px each on a 1080-wide frame", () => {
    expect(iconBoxes(4, 1)).toEqual([0, 1, 2, 3].map((i) => ({ x: 90, y: 300 + i * 190, size: 96 })));
    expect(iconBoxes(1, 2)[0]).toEqual({ x: 180, y: 600, size: 192 });
  });

  it("opens the next episode, the one after this one unless named, inside the list", () => {
    const items = [{ label: "1" }, { label: "2" }, { label: "3" }];
    expect(targetOf({ items, current: 0 })).toBe(1);
    expect(targetOf({ items, current: 2 })).toBe(2);
    expect(targetOf({ items, current: 0, next: 2 })).toBe(2);
  });

  it("waits, crosses to the target, then double-clicks it", () => {
    const from = { x: 800, y: 1500 }, to = { x: 140, y: 340 };
    expect(cursorAt(0.1, from, to)).toEqual({ ...from, pressed: false, selected: false });
    expect(cursorAt(0.66, from, to)).toMatchObject({ ...to, pressed: false, selected: false });
    expect(cursorAt(0.71, from, to)).toMatchObject({ pressed: true, selected: true });
    expect(cursorAt(0.76, from, to).pressed).toBe(false);
    expect(cursorAt(0.81, from, to).pressed).toBe(true);
    expect(cursorAt(1, from, to)).toMatchObject({ ...to, pressed: false, selected: true });
  });
});
