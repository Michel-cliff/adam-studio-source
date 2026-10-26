import { describe, expect, it } from "vitest";
import { parseProject, parseStyle } from "../src/parse";
import { resolve } from "../src/resolve";
import { makeStyle, projectInput, styleInput } from "./helpers";

describe("effects in the model", () => {
  it("accepts the new transitions and keeps their timing like a cut", () => {
    for (const kind of ["flash", "whip", "zoom"]) {
      const p = parseProject(projectInput({ story: [{ id: "c1", asset: "a", inMs: 0, outMs: 4000, transitionOut: { kind, durationMs: 300 } as never }, { id: "c2", asset: "a", inMs: 5000, outMs: 9000 }] }));
      expect(p.ok, kind).toBe(true);
      if (p.ok) expect(resolve(p.value, makeStyle()).durationFrames).toBe(240);
    }
  });

  it("validates the new kinds", () => {
    const el = (kind: string, props: object) => ({ id: "e", kind, anchor: { atMs: 0 }, durationMs: 1000, props });
    const ok = (kind: string, props: object) => parseProject(projectInput({ elements: [el(kind, props)] as never })).ok;
    expect(ok("hud.panel", { title: "SCAN", lines: ["target: found"] })).toBe(true);
    expect(ok("hud.panel", { lines: "nope" })).toBe(false);
    expect(ok("hud.stat", { label: "jobs refused", value: 42 })).toBe(true);
    expect(ok("hud.stat", { label: "x" })).toBe(false);
    expect(ok("camera.zoom", { scale: 1.4, x: 0.5, y: 0.35 })).toBe(true);
    expect(ok("camera.zoom", { scale: 0.5 })).toBe(false);
    expect(ok("lottie", { asset: "nope" })).toBe(false);
  });

  it("validates the 4:3 window move", () => {
    const el = (props: object) => ({ id: "w", kind: "camera.window", anchor: { atMs: 0 }, durationMs: 2000, props });
    const ok = (props: object) => parseProject(projectInput({ elements: [el(props)] as never })).ok;
    expect(ok({})).toBe(true);
    expect(ok({ color: "#2B6FD4", width: 0.75, y: 0.4, focusY: 0.35, easeMs: 300 })).toBe(true);
    expect(ok({ color: "blue" })).toBe(false);
    expect(ok({ width: 1.2 })).toBe(false);
  });

  it("has screen effects in the style (grain, scanlines, zoom blur), all off by default", () => {
    expect(makeStyle().fx).toEqual({ grain: 0, scanlines: { window: 0, burst: 0, burstFrames: 3 }, zoomBlur: 0 });
    expect(parseStyle({ ...styleInput, fx: { grain: 0.15, scanlines: { burst: 0.3 }, zoomBlur: 12 } }).ok).toBe(true);
    expect(parseStyle({ ...styleInput, fx: { grain: 2 } }).ok).toBe(false);
    const parsed = parseStyle({ ...styleInput, fx: { scanlines: { window: 0.08 } } });
    expect(parsed.ok && parsed.value.fx.scanlines).toEqual({ window: 0.08, burst: 0, burstFrames: 3 });
    expect(parseStyle({ ...styleInput, fx: { scanlines: { base: 0.08 } } }).ok).toBe(false);
  });

  it("has a motion speed in the style, 1 by default", () => {
    expect(makeStyle().motion.speed).toBe(1);
    expect(parseStyle({ ...styleInput, motion: { speed: 0.7 } }).ok).toBe(true);
    expect(parseStyle({ ...styleInput, motion: { speed: 0 } }).ok).toBe(false);
  });
});
