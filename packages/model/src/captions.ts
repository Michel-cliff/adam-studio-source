import { ResolveError, type ResolveContext } from "./context";
import type { TimelineBeat, TimelineCaption } from "./schema/timeline";
import { findHighlights, wrapCaption, tidyText } from "./text";

/** Pieces shorter than this after a cut are dropped. */
const MIN_PIECE_MS = 50;

// Caption timing (default art direction): on screen 60 ms before the first word (a strictly synchronous caption reads
// late), off 120 ms after the last, at least 0.8 s (readable) and at most 3.5 s (not stuck), never over the next one.
const LEAD_MS = 60, TAIL_MS = 120, MIN_MS = 800, MAX_MS = 3500;

export function resolveCaptions(ctx: ResolveContext): TimelineCaption[] {
  const out: TimelineCaption[] = [];
  const pos = ctx.place("caption");
  ctx.project.captions.forEach((c, i) => {
    const first = ctx.words.get(c.words[0]);
    const last = ctx.words.get(c.words[1]);
    if (!first || !last) throw new ResolveError(`caption ${i} references unknown words`);
    const pieces: [number, number][] = [];
    for (const l of ctx.clips) {
      if (l.clip.asset !== first.asset) continue;
      const s = Math.max(first.startMs, l.clip.inMs);
      const e = Math.min(last.endMs, l.clip.outMs);
      if (e - s > MIN_PIECE_MS) pieces.push([l.outStartMs + s - l.clip.inMs, l.outStartMs + e - l.clip.inMs]);
    }
    if (pieces.length === 0) {
      ctx.orphans.push(`caption:${i}`);
      return;
    }
    // Captions written before joinWords carry the transcript's split pieces ("n 'ai", "jobless .fr"): tidied here.
    // The final period goes (a caption is not a sentence on a page); question and exclamation marks stay.
    const text = wrapCaption(tidyText(c.text).replace(/(?<!\.)\.\s*$/, ""), ctx.style.caption.maxCharsPerLine);
    if (text.split("\n").some((line) => line.length > ctx.style.caption.maxCharsPerLine * 1.25)) {
      ctx.warnings.push(`caption ${i}: too long for two lines of ${ctx.style.caption.maxCharsPerLine} characters ("${c.text.slice(0, 40)}..."): split it`);
    }
    const { ranges, missing } = findHighlights(text, c.highlight);
    for (const m of missing) ctx.warnings.push(`caption ${i}: highlight "${m}" not found in "${c.text}"`);
    pieces.forEach(([s, e], k) => {
      // A caption split by a cut: the lead before its first piece, the tail after its last, nothing at the cut.
      const fromFrame = ctx.frame(Math.max(0, s - (k === 0 ? LEAD_MS : 0)));
      out.push({
        id: pieces.length > 1 ? `cap${i}.${k}` : `cap${i}`,
        fromFrame,
        durationFrames: Math.max(1, ctx.frame(e + (k === pieces.length - 1 ? TAIL_MS : 0)) - fromFrame),
        text,
        highlightRanges: ranges,
        x: pos.x,
        y: pos.y,
      });
    });
  });
  out.sort((a, b) => a.fromFrame - b.fromFrame);
  const total = ctx.frame(ctx.totalMs);
  out.forEach((c, i) => {
    // Whole captions only: the pieces of a split caption keep their cut.
    let end = c.id.includes(".") ? c.fromFrame + c.durationFrames : c.fromFrame + Math.min(Math.max(c.durationFrames, ctx.frame(MIN_MS)), ctx.frame(MAX_MS));
    const next = out[i + 1];
    if (next) end = Math.min(end, next.fromFrame);
    c.durationFrames = Math.max(1, Math.min(end, total) - c.fromFrame);
  });
  return out;
}

export function resolveBeats(ctx: ResolveContext): TimelineBeat[] {
  const beats: TimelineBeat[] = [];
  for (const b of ctx.project.structure?.beats ?? []) {
    const from = ctx.wordOut(b.from);
    const to = ctx.wordOut(b.to);
    if (from === null || to === null) {
      ctx.orphans.push(`beat:${b.role}`);
      continue;
    }
    beats.push({ role: b.role, fromFrame: ctx.frame(from.startMs), toFrame: ctx.frame(to.endMs) });
  }
  return beats;
}
