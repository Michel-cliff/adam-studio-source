import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { defaultStyle } from "../../src/takes";
import { daFirstPass, daStatus, daStyle, fontsDir, listDAs, newDA, PALETTE, readDA, setStep, useDA, videoColor, withDA, withVideoDA } from "../../src/lib/da";

const FONTS = "C:/Fonts";

describe("the creator's art direction", () => {
  it("is saved after each step, and a step can be undone back to the derived default", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam da-"));
    expect(readDA(dir)).toEqual({});
    setStep(dir, "accent", "#5AC576");
    setStep(dir, "motion", "light");
    expect(readDA(dir)).toMatchObject({ accent: "#5AC576", motion: "light" });
    setStep(dir, "motion", null);
    expect(readDA(dir).motion).toBeUndefined();
    expect(() => setStep(dir, "motion", "wild")).toThrow(/motion/);
    expect(() => setStep(dir, "accent", "green")).toThrow(/accent/);
  });

  it("says, for each of the five lines, whether it is derived or set by the creator", () => {
    expect(daStatus({ accent: "#5AC576", typography: "anton" })).toEqual([
      { step: "accent", set: true }, { step: "captions", set: false },
      { step: "motion", set: false }, { step: "typography", set: true }, { step: "donts", set: false },
    ]);
  });

  it("turns into a style layer: one accent, caption size and highlight, push, fonts", () => {
    expect(daStyle({ accent: "#5AC576" }, FONTS)).toEqual({ colors: { highlight: "#5AC576", accent: "#5AC576" } });
    expect(daStyle({ captions: "minimal", accent: "#5AC576" }, FONTS)).toMatchObject({ caption: { size: 0.046 }, colors: { highlight: "#FFFFFF", accent: "#5AC576" } });
    expect(daStyle({ motion: "none" }, FONTS)).toEqual({ motion: { push: 0 } });
    expect(daStyle({ typography: "serif" }, FONTS)).toEqual({ fonts: {
      title: { family: "DM Serif Display", file: join(FONTS, "DMSerifDisplay-Regular.ttf") },
      caption: { family: "Manrope", file: join(FONTS, "Manrope-Variable.ttf") },
    } });
  });

  it("gives the captions the creator's own font, over the pair of the typography step", () => {
    const font = { family: "Pixelify Sans", file: join(FONTS, "PixelifySans-Variable.ttf") };
    expect(daStyle({ captionFont: font }, FONTS)).toEqual({ fonts: { caption: font } });
    expect(daStyle({ typography: "anton", captionFont: font }, FONTS)).toEqual({ fonts: { title: { family: "Anton", file: join(FONTS, "Anton-Regular.ttf") }, caption: font } });
  });

  it("sits under the project's own settings: what the creator set in a video wins", () => {
    const p = { styleOverrides: { motion: { push: 0.02 } } } as never;
    const out = withDA(p, { motion: "none", accent: "#5AC576" }, FONTS) as { styleOverrides: Record<string, Record<string, unknown>> };
    expect(out.styleOverrides.motion!.push).toBe(0.02);
    expect(out.styleOverrides.colors!.accent).toBe("#5AC576");
  });

  it("sets the first pass: the caption density of its style", () => {
    expect(daFirstPass({})).toEqual({ maxWords: 5, maxChars: 32 });
    expect(daFirstPass({ captions: "bold" })).toEqual({ maxWords: 3, maxChars: 24 });
  });
});

describe("one colour per video", () => {
  const fresh = (da: object) => { const dir = mkdtempSync(join(tmpdir(), "adam da-")); writeFileSync(join(dir, "da.json"), JSON.stringify(da)); return dir; };
  it("is drawn from the set, kept for the video, never the one of the video before", () => {
    const dir = fresh({ rotate: true });
    const colors = ["A", "B", "C", "D", "E", "F", "G", "H"].map((n) => videoColor(dir, n));
    for (const c of colors) expect(PALETTE).toContain(c);
    for (let i = 1; i < colors.length; i++) expect(colors[i]).not.toBe(colors[i - 1]);
    expect(videoColor(dir, "C")).toBe(colors[2]);
    expect(readDA(dir).colors?.C).toBe(colors[2]);
  });
  it("colours the blocks only when the creator chose rotation and set no accent of their own", () => {
    const p = { name: "V", styleOverrides: {} } as never;
    const on = withVideoDA(p, fresh({ rotate: true }), FONTS) as { styleOverrides: { colors?: { highlight: string } } };
    expect(PALETTE).toContain(on.styleOverrides.colors!.highlight);
    expect((withVideoDA(p, fresh({}), FONTS) as { styleOverrides: { colors?: unknown } }).styleOverrides.colors).toBeUndefined();
    expect((withVideoDA(p, fresh({ rotate: true, accent: "#5AC576" }), FONTS) as unknown as { styleOverrides: { colors: { highlight: string } } }).styleOverrides.colors.highlight).toBe("#5AC576");
  });
});

describe("several art directions", () => {
  it("keeps the first one as default, makes others blank or copied, and switches between them", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam da-"));
    setStep(dir, "accent", "#5AC576");
    expect(listDAs(dir)).toEqual({ active: "default", names: ["default"] });
    newDA(dir, "Podcast", false);
    expect(listDAs(dir)).toEqual({ active: "Podcast", names: ["default", "Podcast"] });
    expect(readDA(dir).accent).toBeUndefined();
    setStep(dir, "motion", "none");
    newDA(dir, "Shorts", true);
    expect(readDA(dir)).toMatchObject({ motion: "none" });
    useDA(dir, "default");
    expect(readDA(dir)).toMatchObject({ accent: "#5AC576" });
    expect(readDA(dir).motion).toBeUndefined();
  });
  it("refuses an unknown or badly named one", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam da-"));
    expect(() => useDA(dir, "nope")).toThrow(/no art direction/);
    expect(() => newDA(dir, "../x", false)).toThrow(/name/);
    newDA(dir, "A", false);
    expect(() => newDA(dir, "A", false)).toThrow(/exists/);
  });
});

describe("from-scratch reference skeleton", () => {
  it("starts with stable motion and zoom blur but does not copy the reference palette or icons", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam-skeleton-")); newDA(dir, "From scratch", false);
    const da = readDA(dir); expect(da.foundation).toBe("editorial");
    expect(da.accent).toBeUndefined(); expect(da.reference).toBeUndefined();
    expect(daStyle(da, FONTS)).toMatchObject({ motion: { stable: true }, fx: { zoomBlur: 8 }, caption: { intro: "none" } });
    setStep(dir, "motion", "light");
    expect(daStyle(readDA(dir), FONTS)).toMatchObject({ motion: { stable: true, push: 0.006 } });
  });
});

describe("the house fonts in the installed app", () => {
  it("come from the folder the app gave them, and make the default style", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam fonts-"));
    writeFileSync(join(dir, "Anton-Regular.ttf"), "x"); writeFileSync(join(dir, "Manrope-Variable.ttf"), "x");
    process.env.ADAM_FONTS = dir;
    try {
      expect(fontsDir()).toBe(dir);
      const style = defaultStyle("C:/Windows/Fonts/arialbd.ttf");
      expect(style.fonts.title).toEqual({ family: "Anton", file: join(dir, "Anton-Regular.ttf") });
      expect(style.fonts.caption).toEqual({ family: "Manrope", file: join(dir, "Manrope-Variable.ttf") });
    } finally { delete process.env.ADAM_FONTS; }
  });
});
