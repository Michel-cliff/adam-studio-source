import type { Project } from "./schema/project";

// A cut this far inside a word cuts it (a few milliseconds of transcript imprecision are tolerated).
const INSIDE_MS = 20;
// Room kept outside a word moved back to whole, bounded by the gap to its neighbour.
const MARGIN_MS = 40;

/**
 * No cut inside a word (default art direction): a clip edge that falls inside a word moves out of it. The clip that
 * holds most of the word keeps it whole; the other edge leaves it, so a word split between two clips is never played
 * twice. Returns the repaired project and what was moved.
 */
export function repairCuts(project: Project): { project: Project; moved: string[] } {
  const moved: string[] = [];
  const story = project.story.map((clip) => {
    const words = project.transcript.words[clip.asset] ?? [];
    let { inMs, outMs } = clip;
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      const before = i > 0 ? w.startMs - words[i - 1]!.endMs : Infinity;
      const after = i + 1 < words.length ? words[i + 1]!.startMs - w.endMs : Infinity;
      const start = w.startMs - Math.min(MARGIN_MS, before / 2), end = w.endMs + Math.min(MARGIN_MS, after / 2);
      const half = (w.endMs - w.startMs) / 2;
      if (inMs > w.startMs + INSIDE_MS && inMs < w.endMs - INSIDE_MS) {
        const to = w.endMs - inMs > half ? start : end;
        moved.push(`clip "${clip.id}" started inside the word "${w.text}": moved to ${(to / 1000).toFixed(2)} s`);
        inMs = to;
      }
      if (outMs > w.startMs + INSIDE_MS && outMs < w.endMs - INSIDE_MS) {
        const to = outMs - w.startMs > half ? end : start;
        moved.push(`clip "${clip.id}" ended inside the word "${w.text}": moved to ${(to / 1000).toFixed(2)} s`);
        outMs = to;
      }
    }
    return inMs === clip.inMs && outMs === clip.outMs ? clip : { ...clip, inMs, outMs };
  });
  return { project: moved.length ? { ...project, story } : project, moved };
}
