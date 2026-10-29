// The export checks of the default art direction that read the edit itself (the sound has its own, in loudness.ts):
// blocking ones refuse the export, warnings let it through and say what to look at.
import type { Timeline } from "@adam-studio/model";

type Word = { id: string; text: string; startMs: number; endMs: number };
export type Checks = { blocking: string[]; warnings: string[] };

const SAFE = { x0: 72, x1: 900, y0: 269, y1: 1248, margin: 24 };
const MIN_CAPTION_MS = 800;
const FIRST_CHANGE_MS = 2000;
// A cut this far inside a word cuts it (a few milliseconds of transcript imprecision are tolerated).
const INSIDE_MS = 20;

export function exportChecks(tl: Timeline, words: Record<string, Word[]>): Checks {
  const blocking: string[] = [], warnings: string[] = [];
  const ms = (f: number) => (f * 1000) / tl.fps;
  const ky = tl.height / 1920;

  // Captions: two lines at most, 0.8 s at least (whole captions: the pieces of one split by a cut keep their cut),
  // inside the safe zone with its breathing room (9:16; 16:9 has no zone defined yet).
  const lineH = tl.style.caption.size * tl.width * 1.15;
  for (const c of tl.captions) {
    const lines = c.text.split("\n").length;
    if (lines > 2) blocking.push(`caption ${c.id} has ${lines} lines (2 at most)`);
    // A warning, not a refusal: a caption this short is held back by the next one (fast speech); the first pass now
    // merges such chunks, captions made before it are named so they can be merged by hand.
    if (!c.id.includes(".") && ms(c.durationFrames) < MIN_CAPTION_MS - 1) warnings.push(`caption ${c.id} stays ${(ms(c.durationFrames) / 1000).toFixed(1)} s (0.8 s reads better): merge it with its neighbour`);
    if (tl.format === "9:16") {
      const cy = c.y * tl.height, half = (lines * lineH) / 2;
      if (cy - half < (SAFE.y0 + SAFE.margin) * ky - 1 || cy + half > (SAFE.y1 - SAFE.margin) * ky + 1) blocking.push(`caption ${c.id} is outside the safe zone (y ${Math.round(cy - half)} to ${Math.round(cy + half)})`);
    }
  }

  // No cut inside a word: each clip's in and out points against the words of its take.
  for (const c of tl.clips) {
    for (const edge of [c.sourceInMs, c.sourceOutMs]) {
      const w = (words[c.asset] ?? []).find((x) => edge > x.startMs + INSIDE_MS && edge < x.endMs - INSIDE_MS);
      if (w) blocking.push(`clip ${c.id} cuts inside the word "${w.text}" at ${(edge / 1000).toFixed(2)} s of its take`);
    }
  }

  // Two font families at most: the style's, and any an element sets.
  const families = new Set([tl.style.fonts.caption.family, tl.style.fonts.title.family, ...tl.elements.flatMap((e) => {
    const f = (e as { props?: { font?: unknown } }).props?.font;
    return typeof f === "string" ? [f] : [];
  })]);
  if (families.size > 2) blocking.push(`${families.size} font families (${[...families].join(", ")}): 2 at most`);

  // Warnings.
  const firstChange = Math.min(...tl.clips.slice(1).map((c) => c.fromFrame), ...tl.elements.map((e) => e.fromFrame), tl.durationFrames);
  if (ms(firstChange) > FIRST_CHANGE_MS) warnings.push(`the first visual change comes at ${(ms(firstChange) / 1000).toFixed(1)} s (before 2 s holds the viewer)`);
  if (tl.style.colors.highlight.toLowerCase() !== tl.style.colors.accent.toLowerCase()) warnings.push("two accent colours in the style (highlight and accent): one is enough");
  if (!tl.audio.some((a) => !a.id.startsWith("clip:") && ms(a.durationFrames) > 4000)) warnings.push("no music: fine if wanted, the video goes out on the voice alone");
  return { blocking, warnings };
}
