import type { Timeline } from "@adam-studio/model";

/** Three moments of what a variant changes: from its first new element or caption, else a quarter, half and three quarters. */
export function keyFrames(variant: Timeline, base: Timeline | null): number[] {
  const last = Math.max(0, variant.durationFrames - 1);
  const known = new Set((base?.elements ?? []).map((e) => e.id));
  const added = base ? variant.elements.filter((e) => !known.has(e.id)).map((e) => e.fromFrame) : [];
  const caps = base && variant.captions.length !== base.captions.length ? [variant.captions[0]?.fromFrame ?? 0] : [];
  const first = [...added, ...caps].sort((a, b) => a - b)[0];
  const at = first === undefined
    ? [0.25, 0.5, 0.75].map((f) => Math.round(variant.durationFrames * f))
    // A little into it: titles and words reveal over their first frames.
    : [0.7, 1.6, 2.8].map((s) => first + Math.round(variant.fps * s));
  return at.map((f) => Math.min(last, Math.max(0, f)));
}
