import { describe, expect, it } from "vitest";
import type { Timeline } from "@adam-studio/model";
import { cameraAt, cameraWindows, windowAt } from "../../src/lib/camera";
import { planCapcut } from "../../src/lib/capcut";
import { scanlinesAt } from "../../src/lib/fx";
import { presetStyle } from "../../src/lib/presets";

const clip = { id: "c1", asset: "a", fromFrame: 0, durationFrames: 300, sourceInMs: 0, sourceOutMs: 10000,
  framing: { mode: "cover" }, zoom: { base: 1, driftPerSec: 0 }, transitionOut: { kind: "cut" }, volume: 1 };
const el = (id: string, kind: string, fromFrame: number, durationFrames: number, props: object) =>
  ({ id, kind, layer: "front", fromFrame, durationFrames, trimStartMs: 0, x: 0.5, y: 0.5, props });
const fx = { grain: 0.15, scanlines: { window: 0.08, burst: 0.3, burstFrames: 3 }, zoomBlur: 12 };
const timeline = (elements: object[]) => ({
  format: "9:16", width: 1080, height: 1920, fps: 30, durationFrames: 300, clips: [clip], elements,
  captions: [], beats: [], audio: [], orphans: [], warnings: [], style: { motion: { speed: 1 }, fx },
}) as unknown as Timeline;

describe("element entrances of the look", () => {
  it("pixel: big blocks that resolve to the full picture while it grows from 0.96", () => {
    expect(presetStyle("pixel", 0, 0).pixel).toBe(24);
    expect(presetStyle("pixel", 200, 6).pixel).toBeLessThan(8);
    expect(presetStyle("pixel", 260, 8).pixel ?? 0).toBe(0);
    expect(presetStyle("pixel", 0, 0).transform).toBe("scale(0.96)");
  });
  it("step: a stop-motion pop on four frames at 12 fps, no smoothing", () => {
    const at = (ms: number) => presetStyle("step", ms, 0);
    expect(at(0).opacity).toBe(0);
    expect(at(100).transform).toBe("scale(0.6)");
    expect(at(200).transform).toBe("scale(1.1)");
    expect(at(300).transform).toBe("scale(1)");
    expect(at(400)).toEqual({});
  });
  it("popOut: springs from nothing past its size, then settles at 1", () => {
    const scale = (ms: number) => Number(/scale\(([\d.]+)\)/.exec(presetStyle("popOut", ms, 0).transform ?? "")?.[1] ?? 1);
    expect(scale(0)).toBe(0);
    expect(Math.max(scale(200), scale(250), scale(300))).toBeGreaterThan(1.05);
    expect(presetStyle("popOut", 450, 0)).toEqual({});
  });
  it("window: opens wide first, then tall", () => {
    expect(presetStyle("window", 50, 0).transform).toMatch(/scaleY\(0\.04\)/);
    expect(presetStyle("window", 240, 0).transform).toMatch(/scaleX\(1\)/);
    expect(presetStyle("window", 300, 0)).toEqual({});
  });
});

describe("zoom blur", () => {
  const tl = timeline([el("z", "camera.zoom", 30, 60, { scale: 1.25, x: 0.5, y: 0.4, easeMs: 180 })]);
  it("blurs the main track while the zoom moves, never while it holds", () => {
    expect(cameraAt(tl, 32).filter).toMatch(/blur/);
    expect(cameraAt(tl, 60).filter).toBeUndefined();
  });
});

describe("opening dezoom", () => {
  const tl = timeline([el("open", "camera.zoom", 0, 45, { scale: 1.3, x: 0.5, y: 0.5, easeMs: 1200, enter: "cut" })]);
  it("blurs a slow move far less than a fast one", () => {
    const fast = timeline([el("f", "camera.zoom", 0, 60, { scale: 1.3, easeMs: 300 })]);
    const blurPx = (t: Timeline, f: number) => Number(/blur\(([\d.]+)px\)/.exec(cameraAt(t, f).filter ?? "")?.[1] ?? 0);
    expect(blurPx(fast, 4)).toBeGreaterThan(8);
    expect(blurPx(tl, 18)).toBeLessThan(4);
  });
  it("starts zoomed in and eases back to the full shot", () => {
    expect(cameraAt(tl, 0).transform).toBe("scale(1.3000)");
    expect(cameraAt(tl, 40).transform).toMatch(/scale\(1\.0\d+\)/);
    expect(cameraAt(tl, 50).transform).toBeUndefined();
  });
});

describe("the 4:3 window", () => {
  const tl = timeline([el("w", "camera.window", 60, 90, { color: "#F3BA20", barColor: "#2B6FD4", width: 0.8, y: 0.42, focusY: 0.4, easeMs: 300 })]);
  it("is off outside its element", () => {
    expect(windowAt(tl, 30)).toBeNull();
  });
  it("lands on a 4:3 box of the given width, on the flat colour", () => {
    const w = windowAt(tl, 100)!;
    expect(w.amount).toBe(1);
    expect(w.color).toBe("#F3BA20");
    expect(w.box.width).toBeCloseTo(864, 0);
    expect(w.box.height).toBeCloseTo(648, 0);
    expect(w.box.top + w.box.height / 2).toBeCloseTo(0.42 * 1920, 0);
    expect(w.clip).toMatch(/^inset\(/);
  });
  it("moves with an acceleration at the end of the course", () => {
    const early = windowAt(tl, 62)!.amount, mid = windowAt(tl, 64)!.amount;
    expect(early).toBeLessThan(0.2);
    expect(mid - early).toBeGreaterThan(early);
  });
  it("can sit on the take itself, blurred, instead of a flat colour", () => {
    const blur = timeline([el("w", "camera.window", 60, 90, { backdrop: "blur", width: 0.8, y: 0.42, focusY: 0.4, easeMs: 300 })]);
    expect(windowAt(blur, 100)!.backdrop).toBe("blur");
    expect(windowAt(tl, 100)!.backdrop).toBe("color");
  });
  it("is baked for CapCut, like the zoom, never an overlay", () => {
    expect(cameraWindows(tl)).toEqual([[60, 150]]);
    const plan = planCapcut(tl);
    expect(plan.overlays.map((o) => o.elementId)).not.toContain("w");
    expect(plan.entries.find((e) => e.id === "w")?.status).toBe("baked");
  });
});

describe("scanlines", () => {
  const tl = timeline([
    el("z", "camera.zoom", 30, 60, { scale: 1.25, easeMs: 180 }),
    el("w", "camera.window", 150, 90, { easeMs: 300 }),
    el("v", "image", 260, 30, { asset: "clip", fit: "contain", intro: "window" }),
  ]);
  it("are off on a plain 9:16 shot", () => {
    expect(scanlinesAt(tl, 10)).toBe(0);
  });
  it("burst at 30 % for three frames when a zoom lands", () => {
    expect(scanlinesAt(tl, 36)).toBe(0.3);
    expect(scanlinesAt(tl, 38)).toBe(0.3);
    expect(scanlinesAt(tl, 40)).toBe(0);
  });
  it("burst when the window lands, then stay at the window level", () => {
    expect(scanlinesAt(tl, 159)).toBe(0.3);
    expect(scanlinesAt(tl, 200)).toBe(0.08);
  });
  it("burst when an inserted video window opens", () => {
    expect(scanlinesAt(tl, 268)).toBe(0.3);
  });
});
