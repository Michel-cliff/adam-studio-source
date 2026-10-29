import { describe, expect, it } from "vitest";
import { accentApplies, accentHex, contrast, fallbackHue, withAccent } from "../../src/lib/color";

// The default art direction's table: the accent rebuilt at fixed lightness and chroma, on ink and on paper.
const TABLE: [number, string, string][] = [
  [25, "#FB817A", "#A12F2F"], [65, "#EA942F", "#944500"], [105, "#B9AF1E", "#6C6000"], [150, "#5AC576", "#007329"],
  [200, "#00C6D0", "#00747F"], [255, "#65ADFF", "#0E5CAF"], [300, "#BA93FB", "#6C44A4"], [340, "#E882C8", "#913378"],
];
const near = (a: string, b: string) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);

describe("the accent colour", () => {
  it.each(TABLE)("rebuilds hue %i as the table says, on ink and on paper", (h, ink, paper) => {
    expect(near(accentHex(h, "ink"), ink)).toBe(true);
    expect(near(accentHex(h, "paper"), paper)).toBe(true);
  });
  it("keeps 4.5:1 on its background at every hue", () => {
    for (let h = 0; h < 360; h += 5) {
      expect(contrast(accentHex(h, "ink"), "#121212")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accentHex(h, "paper"), "#F4F2ED")).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("falls back to a hue stable for a project and different between projects", () => {
    expect(fallbackHue("c01|WAMI.mov|25200")).toBe(fallbackHue("c01|WAMI.mov|25200"));
    expect(fallbackHue("a")).not.toBe(fallbackHue("b"));
  });
});

describe("the accent in the edit", () => {
  const tl = { style: { name: "Default", colors: { text: "#FFFFFF", highlight: "#FFD100", accent: "#FF6B35", ink: "#0E0C0A" } } } as never;
  it("replaces both colours of the untouched default style by the one accent", () => {
    const out = withAccent(tl, 35) as { style: { colors: Record<string, string> } };
    expect(out.style.colors.highlight).toBe(accentHex(35, "ink"));
    expect(out.style.colors.accent).toBe(accentHex(35, "ink"));
  });
  it("leaves a style the creator chose, or colours they set, alone", () => {
    expect(accentApplies("Default", {})).toBe(true);
    expect(accentApplies("Tech creative", {})).toBe(false);
    expect(accentApplies("Default", { colors: { highlight: "#00FF00" } })).toBe(false);
  });
});
