// The accent of the default art direction: only the hue comes from the rush; lightness and chroma are fixed so the
// contrast holds at every hue: oklch(0.74 0.15 H) on ink, oklch(0.48 0.15 H) on paper.
import { createHash } from "node:crypto";

export const INK = "#121212", PAPER = "#F4F2ED";
const ON = { ink: 0.74, paper: 0.48 } as const;
const CHROMA = 0.15;

const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0").toUpperCase();

/** OkLCh to sRGB hex (clipped to the gamut). */
export function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180, a = c * Math.cos(h), b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return `#${hex(gamma(r))}${hex(gamma(g))}${hex(gamma(bl))}`;
}

/** The accent for a hue, on ink (light text over the video) or on paper. */
export function accentHex(hue: number, on: "ink" | "paper" = "ink"): string {
  return oklchToHex(ON[on], CHROMA, ((hue % 360) + 360) % 360);
}

const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** When the rush gives no hue (no rush, monochrome, too grey): stable for a project, different between projects. */
export function fallbackHue(projectKey: string): number {
  return parseInt(createHash("sha1").update(projectKey).digest("hex").slice(0, 8), 16) % 360;
}

/** The accent is derived only for the untouched default style: a style the creator chose, or colours they set, win. */
export function accentApplies(styleName: string, overrides: Record<string, unknown>): boolean {
  return styleName === "Default" && !("colors" in overrides);
}

/** The edit with one accent: the highlight and the accent both become the derived colour (on ink: over the video). */
export function withAccent<T extends { style: { colors: Record<string, string> } }>(tl: T, hue: number): T {
  const c = accentHex(hue, "ink");
  return { ...tl, style: { ...tl.style, colors: { ...tl.style.colors, highlight: c, accent: c } } };
}
