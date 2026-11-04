import { describe, expect, it } from "vitest";
import type { Timeline } from "@adam-studio/model";
import { exportChecks } from "../../src/lib/checks";

const base = (over: Partial<Record<string, unknown>> = {}) => ({
  format: "9:16", width: 1080, height: 1920, fps: 30, durationFrames: 600,
  clips: [
    { id: "c1", asset: "a", fromFrame: 0, durationFrames: 45, sourceInMs: 0, sourceOutMs: 1500 },
    { id: "c2", asset: "a", fromFrame: 45, durationFrames: 555, sourceInMs: 3000, sourceOutMs: 21500 },
  ],
  elements: [], audio: [{ id: "bed", asset: "m", fromFrame: 60, durationFrames: 500, sourceInMs: 0, volume: 1, fadeInMs: 0, fadeOutMs: 0 }],
  captions: [{ id: "cap0", fromFrame: 10, durationFrames: 30, text: "un deux\ntrois", highlightRanges: [], x: 0.5, y: 0.6 }],
  style: { caption: { size: 0.052 }, fonts: { caption: { family: "Manrope" }, title: { family: "Anton" } }, colors: { highlight: "#FFD100", accent: "#FFD100" } },
  ...over,
}) as unknown as Timeline;
const words = { a: [{ id: "a.w0", text: "un", startMs: 200, endMs: 600 }, { id: "a.w1", text: "deux", startMs: 3050, endMs: 3500 }] };

describe("the export checks of the default art direction", () => {
  it("passes a clean edit", () => {
    expect(exportChecks(base(), words)).toEqual({ blocking: [], warnings: [] });
  });
  it("blocks a caption over two lines or outside the safe zone, and names a caption under 0.8 s", () => {
    const r = exportChecks(base({ captions: [
      { id: "cap0", fromFrame: 10, durationFrames: 30, text: "un\ndeux\ntrois", highlightRanges: [], x: 0.5, y: 0.6 },
      { id: "cap1", fromFrame: 50, durationFrames: 12, text: "quatre", highlightRanges: [], x: 0.5, y: 0.6 },
      { id: "cap2", fromFrame: 80, durationFrames: 30, text: "cinq", highlightRanges: [], x: 0.5, y: 0.75 },
    ] }), words);
    expect(r.blocking.join("\n")).toMatch(/cap0.*3 lines/);
    expect(r.warnings.join("\n")).toMatch(/cap1.*0.4 s/);
    expect(r.blocking.join("\n")).toMatch(/cap2.*safe zone/);
  });
  it("blocks a cut inside a word", () => {
    // c2 now starts at 3100 ms, inside "deux" (3050-3500).
    const tl = base();
    (tl.clips[1] as { sourceInMs: number }).sourceInMs = 3100;
    expect(exportChecks(tl, words).blocking.join()).toMatch(/inside the word "deux"/);
  });
  it("blocks a third font family", () => {
    const tl = base({ elements: [{ id: "t1", kind: "title", fromFrame: 0, durationFrames: 30, x: 0.5, y: 0.2, props: { font: "Inter" } }] });
    expect(exportChecks(tl, words).blocking.join()).toMatch(/3 font families/);
  });
  it("warns about a slow start, two accent colours and no music", () => {
    const tl = base({ clips: [{ id: "c1", asset: "a", fromFrame: 0, durationFrames: 600, sourceInMs: 0, sourceOutMs: 20000 }], audio: [],
      style: { caption: { size: 0.052 }, fonts: { caption: { family: "Manrope" }, title: { family: "Anton" } }, colors: { highlight: "#FFD100", accent: "#FF6B35" } } });
    const w = exportChecks(tl, words).warnings.join("\n");
    expect(w).toMatch(/first visual change/);
    expect(w).toMatch(/two accent colours/);
    expect(w).toMatch(/no music/);
  });
  it("runs the text-only rules on the cards, in their order", () => {
    const card = (id: string, fromFrame: number, props: Record<string, unknown>) => ({ id, kind: "card", layer: "front", fromFrame, durationFrames: 50, trimStartMs: 0, x: 0.5, y: 0.5, props });
    const r = exportChecks(base({ elements: [
      card("k2", 50, { archetype: "statement", text: "deux" }),
      card("k1", 0, { archetype: "number", text: "1 234 567 890 123 456", label: "a long label" }),
      card("k3", 100, { archetype: "statement", text: "trois" }),
    ] }), words);
    expect(r.blocking.join(" | ")).toMatch(/card 1 .*2\.5:1/);
    expect(r.warnings.join(" | ")).toMatch(/cards 2 and 3/);
  });
});

it("allows a default lower-third caption after an explicit manual transform switches the project to free layout", () => {
  const tl = base(); tl.style.textLayout = "free"; tl.captions[0]!.y = .76;
  expect(exportChecks(tl, words).blocking).toEqual([]);
});
