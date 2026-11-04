import { describe, expect, it } from "vitest";
import { presetStyle } from "../../src/lib/presets";
import { captionLines, colorOf, exitOpacity, editorialEntrance, fitFontSize, glitchAmount, keySegments, lineReveal } from "../../src/lib/text";

describe("captionLines", () => {
  it("splits lines and highlighted spans, accents included", () => {
    expect(captionLines("on a créé\nma boîte", [[5, 9], [13, 18]])).toEqual([
      [{ text: "on a ", highlight: false }, { text: "créé", highlight: true }],
      [{ text: "ma ", highlight: false }, { text: "boîte", highlight: true }],
    ]);
  });
  it("returns one plain line without highlights", () => {
    expect(captionLines("red blue", [])).toEqual([[{ text: "red blue", highlight: false }]]);
  });
});

describe("fitFontSize", () => {
  it("caps at the max size for short text and shrinks long text to the width", () => {
    expect(fitFontSize("VEUT", 972, 151)).toBe(151);
    expect(fitFontSize("M'EMBAUCHER ?", 972, 151)).toBe(124);
  });
});

describe("title timing", () => {
  it("reveals lines one after the other", () => {
    expect(lineReveal(0, 0)).toBe(0);
    expect(lineReveal(320, 0)).toBe(1);
    expect(lineReveal(320, 1)).toBeCloseTo(1 - (1 - 80 / 240) ** 3, 6);
  });
  it("glitches as each line lands and at the exit", () => {
    expect(glitchAmount(80, 1800, 3)).toBe(1);
    expect(glitchAmount(130, 1800, 3)).toBeCloseTo(0.5, 6);
    expect(glitchAmount(1000, 1800, 3)).toBe(0);
    expect(glitchAmount(1760, 1800, 3)).toBeCloseTo(0.75, 6);
  });
  it("fades out over the last 160 ms", () => {
    expect(exitOpacity(1000, 1800)).toBe(1);
    expect(exitOpacity(1720, 1800)).toBeCloseTo(0.5, 6);
  });
});

describe("colorOf", () => {
  const style = { colors: { text: "#FFFFFF", highlight: "#FFD100", accent: "#FF6B35", ink: "#0E0C0A" } };
  it("maps a style color name, and passes a literal color through", () => {
    expect(colorOf("accent", style)).toBe("#FF6B35");
    expect(colorOf("#00FF00", style)).toBe("#00FF00");
  });
});

describe("presetStyle", () => {
  it("fades in over 250 ms", () => {
    expect(presetStyle("fade", 125, 0)).toEqual({ opacity: 0.5 });
  });
  it("pops from 90% scale", () => {
    expect(presetStyle("pop", 0, 0)).toEqual({ opacity: 0, transform: "scale(0.9)" });
    expect(presetStyle("pop", 400, 0)).toEqual({ opacity: 1, transform: "scale(1)" });
  });
  it("glitches for 200 ms then settles", () => {
    expect(presetStyle("glitch", 0, 3).filter).toContain("drop-shadow");
    expect(presetStyle("glitch", 250, 3)).toEqual({});
  });
  it("ignores unknown or missing presets", () => {
    expect(presetStyle(undefined, 0, 0)).toEqual({});
    expect(presetStyle("laser", 0, 0)).toEqual({});
  });
});

describe("the key word of a title", () => {
  it("splits a line around its key word, whatever its case", () => {
    expect(keySegments("we are only human", "Human")).toEqual([{ text: "we are only ", key: false }, { text: "human", key: true }]);
    expect(keySegments("no key here", "robot")).toEqual([{ text: "no key here", key: false }]);
    expect(keySegments("plain", undefined)).toEqual([{ text: "plain", key: false }]);
  });
});

describe("stable editorial entrances", () => {
  it("zooms monotonically into focus without horizontal displacement or flicker", () => {
    const frames = Array.from({ length: 20 }, (_, i) => editorialEntrance(i * 1000 / 30));
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.scale).toBeGreaterThanOrEqual(frames[i-1]!.scale);
      expect(frames[i]!.opacity).toBeGreaterThanOrEqual(frames[i-1]!.opacity);
      expect(frames[i]!.blur).toBeLessThanOrEqual(frames[i-1]!.blur);
    }
    expect(frames.at(-1)).toEqual({ scale: 1, blur: 0, opacity: 1 });
    const stable = presetStyle("glitch", 60, 3, true);
    expect(stable.transform).toMatch(/^scale/); expect(stable.filter).not.toContain("drop-shadow");
    expect(stable.transform).not.toContain("translate");
  });
});
