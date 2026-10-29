// Transcript confidence (default art direction): a wrong caption costs more than a missing one, it credits the creator
// with a word they did not say. Whisper's confidence per word is kept in cache/<take>/transcript.json; the words of a
// take have the ids <take>.w<index> in the same order.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline } from "@adam-studio/model";

/** Each word's confidence and start (ms in its take), and each take's language confidence. */
export type Confidence = { words: Record<string, number>; starts: Record<string, number>; lang: Record<string, number> };

const LOW = 0.6, MAX_LOW = 3, LANG_SURE = 0.7;

export function wordConfidence(dir: string, takes: string[]): Confidence {
  const out: Confidence = { words: {}, starts: {}, lang: {} };
  for (const take of takes) {
    try {
      const t = JSON.parse(readFileSync(join(dir, "cache", take, "transcript.json"), "utf8")) as { langProbability?: number; words: { p?: number; startMs: number }[] };
      t.words.forEach((w, n) => {
        if (typeof w.p !== "number") return;
        out.words[`${take}.w${n}`] = w.p;
        out.starts[`${take}.w${n}`] = w.startMs;
      });
      if (typeof t.langProbability === "number") out.lang[take] = t.langProbability;
    } catch { /* no transcript for this take */ }
  }
  return out;
}

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(1).padStart(4, "0")}`;

/** More than 3 kept words under 0.60, named by where they are in the edit; a take whose language is unsure. */
export function confidenceWarnings(tl: Timeline, c: Confidence): string[] {
  const out: string[] = [];
  const low: number[] = [];
  for (const clip of tl.clips) {
    for (const [id, p] of Object.entries(c.words)) {
      const start = c.starts[id]!;
      if (p >= LOW || !id.startsWith(`${clip.asset}.w`) || start < clip.sourceInMs || start >= clip.sourceOutMs) continue;
      low.push((clip.fromFrame * 1000) / tl.fps + start - clip.sourceInMs);
    }
  }
  if (low.length > MAX_LOW) out.push(`${low.length} words heard with little confidence, check them: ${low.sort((a, b) => a - b).map(clock).join(", ")}`);
  for (const [take, p] of Object.entries(c.lang)) if (p < LANG_SURE) out.push(`the language of ${take} is unsure (${Math.round(p * 100)} %): check the transcript's language`);
  return out;
}
