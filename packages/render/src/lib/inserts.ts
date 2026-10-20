import type { Style } from "@adam-studio/model";

// The archival treatment of inserts (image elements), separate from the presenter's grade: a soft neutral black and
// white, a glow of the highlights, and a film grain drawn anew every frame. All of it a pure function of the frame,
// so a render and a scrub show the same picture.
type Inserts = Style["inserts"];

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Light, fresh black and white: milky but not muddy blacks, open mids, no tint. */
export function insertFilter(ins: Inserts): string {
  if (ins.bw <= 0) return "none";
  return `grayscale(${round(ins.bw)}) contrast(${round(1 - 0.08 * ins.bw)}) brightness(${round(1 + 0.06 * ins.bw)})`;
}

/** A blurred copy of the highlights laid over the insert in screen mode; the blur follows the frame size. */
export function bloomLayer(ins: Inserts, frameHeight: number): { filter: string; opacity: number; mixBlendMode: "screen" } | null {
  if (ins.bloom <= 0) return null;
  const blur = Math.round((14 * frameHeight) / 1920);
  const parts = [ins.bw > 0 ? `grayscale(${round(ins.bw)})` : "", "brightness(1.15)", "contrast(1.8)", `blur(${blur}px)`].filter(Boolean);
  return { filter: parts.join(" "), opacity: round(0.5 * ins.bloom), mixBlendMode: "screen" };
}

/** Fine organic grain: a new noise seed every frame, kept quiet (at most 0.18 in overlay). */
export function grainLayer(ins: Inserts, frame: number): { seed: number; opacity: number } | null {
  if (ins.grain <= 0) return null;
  return { seed: frame * 7 + 3, opacity: round(0.05 + 0.13 * ins.grain) };
}
