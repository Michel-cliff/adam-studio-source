import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { daFirstPass, daStatus, daStyle, readDA, setStep, withDA } from "../../src/lib/da";

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

  it("says, for each of the six lines, whether it is derived or set by the creator", () => {
    expect(daStatus({ accent: "#5AC576", typography: "anton" })).toEqual([
      { step: "accent", set: true }, { step: "captions", set: false }, { step: "rhythm", set: false },
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

  it("sits under the project's own settings: what the creator set in a video wins", () => {
    const p = { styleOverrides: { motion: { push: 0.02 } } } as never;
    const out = withDA(p, { motion: "none", accent: "#5AC576" }, FONTS) as { styleOverrides: Record<string, Record<string, unknown>> };
    expect(out.styleOverrides.motion!.push).toBe(0.02);
    expect(out.styleOverrides.colors!.accent).toBe("#5AC576");
  });

  it("sets the first pass: pauses by rhythm, caption density by style", () => {
    expect(daFirstPass({})).toEqual({ pauseOverMs: 600, pauseKeepMs: 250, maxWords: 5, maxChars: 32 });
    expect(daFirstPass({ rhythm: "calm", captions: "bold" })).toEqual({ pauseOverMs: 900, pauseKeepMs: 400, maxWords: 3, maxChars: 24 });
  });
});
