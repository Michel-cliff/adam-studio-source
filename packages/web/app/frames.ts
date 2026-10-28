import type { Timeline } from "@adam-studio/model";

/** The one moment that shows what a variant changes: a little into its first new element or caption, else the middle. */
export function keyFrame(variant: Timeline, base: Timeline | null): number {
  const last = Math.max(0, variant.durationFrames - 1);
  const known = new Set((base?.elements ?? []).map((e) => e.id));
  const added = base ? variant.elements.filter((e) => !known.has(e.id)).map((e) => e.fromFrame) : [];
  // Nothing new: an element the variant changes (another title text, another place or timing) shows it.
  if (base && !added.length) {
    const before = new Map(base.elements.map((e) => [e.id, JSON.stringify(e)]));
    added.push(...variant.elements.filter((e) => before.has(e.id) && before.get(e.id) !== JSON.stringify(e)).map((e) => e.fromFrame));
  }
  const caps = base && variant.captions.length !== base.captions.length ? [variant.captions[0]?.fromFrame ?? 0] : [];
  const first = [...added, ...caps].sort((a, b) => a - b)[0];
  // A little into it: titles and words reveal over their first frames.
  const at = first === undefined ? Math.round(variant.durationFrames / 2) : first + Math.round(variant.fps * 0.7);
  return Math.min(last, Math.max(0, at));
}
