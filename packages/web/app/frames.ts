import type { Timeline } from "@adam-studio/model";

// Steps that change the opening: their variants are seen at the start of the video, never in its middle.
const OPENING = new Set(["hook", "structure", "cuts"]);

/**
 * The one moment that shows what a variant changes: a little into its first new element or caption, else the middle.
 * Hook, story and cuts: at the start, at their change when it is in the first five seconds, else one second in.
 */
export function keyFrame(variant: Timeline, base: Timeline | null, step?: string): number {
  const last = Math.max(0, variant.durationFrames - 1);
  const known = new Set((base?.elements ?? []).map((e) => e.id));
  const added = base ? variant.elements.filter((e) => !known.has(e.id)).map((e) => e.fromFrame) : [];
  // Nothing new: an element the variant changes (another title text, another place or timing) shows it.
  if (base && !added.length) {
    const before = new Map(base.elements.map((e) => [e.id, JSON.stringify(e)]));
    added.push(...variant.elements.filter((e) => before.has(e.id) && before.get(e.id) !== JSON.stringify(e)).map((e) => e.fromFrame));
  }
  // Sounds live in the audio track, not among the elements.
  if (base && !added.length) {
    const heard = new Set((base.audio ?? []).map((a) => a.id));
    added.push(...(variant.audio ?? []).filter((a) => !heard.has(a.id)).map((a) => a.fromFrame));
  }
  const caps = base && variant.captions.length !== base.captions.length ? [variant.captions[0]?.fromFrame ?? 0] : [];
  const first = [...added, ...caps].sort((a, b) => a - b)[0];
  // A little into it: titles and words reveal over their first frames.
  const into = (f: number) => f + Math.round(variant.fps * 0.7);
  const at = step && OPENING.has(step)
    ? (first !== undefined && first < variant.fps * 5 ? into(first) : variant.fps)
    : first === undefined ? Math.round(variant.durationFrames / 2) : into(first);
  return Math.min(last, Math.max(0, at));
}
