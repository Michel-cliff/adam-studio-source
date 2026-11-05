import type { TimelineAudio } from "@adam-studio/model";

// Music under the voice, as the default art direction sets it: -12 dB, an 80 ms attack timed to end as the word starts
// (the moment is known), a 200 ms hold after it and a 400 ms release, so the music never pumps between two words.
const DUCK = 10 ** (-12 / 20);
const ATTACK_MS = 80, HOLD_MS = 200, RELEASE_MS = 400;
// Breaths on the take, between words, are lowered by 6 dB rather than cut: a voice with no breath sounds edited.
const BREATH = 10 ** (-6 / 20);
const WORD_MARGIN_MS = 80;
// A sound longer than this is a music bed (ducked); shorter, an effect placed on purpose (left alone).
const BED_MS = 4000;

/** How much the music is ducked at `ms` (0: not at all, 1: fully), given the speech spans of the edit in ms. */
export function duckAmount(ms: number, speech: [number, number][]): number {
  let a = 0;
  for (const [from, to] of speech) {
    if (ms >= from && ms <= to + HOLD_MS) return 1;
    if (ms < from && ms > from - ATTACK_MS) a = Math.max(a, 1 - (from - ms) / ATTACK_MS);
    if (ms > to + HOLD_MS && ms < to + HOLD_MS + RELEASE_MS) a = Math.max(a, 1 - (ms - to - HOLD_MS) / RELEASE_MS);
  }
  return a;
}

const speaking = (ms: number, speech: [number, number][]) => speech.some(([from, to]) => ms >= from - WORD_MARGIN_MS && ms <= to + WORD_MARGIN_MS);

/**
 * Volume at `frame` (relative to the item start), with linear fades, capped at 1 for HTML5 audio. With the speech
 * spans of the edit (ms, from its start): music beds duck under the voice, the take's breaths go down 6 dB.
 */
export function audioVolume(item: TimelineAudio, frame: number, fps: number, speech: [number, number][] = []): number {
  const ms = (frame * 1000) / fps;
  const totalMs = (item.durationFrames * 1000) / fps;
  const at = ((item.fromFrame + frame) * 1000) / fps;
  let v = item.volume;
  if (speech.length) {
    if (item.id.startsWith("clip:")) { if (!speaking(at, speech)) v *= BREATH; }
    else if (totalMs > BED_MS) v *= 1 - duckAmount(at, speech) * (1 - DUCK);
  }
  if (item.fadeInMs > 0) v *= Math.min(1, ms / item.fadeInMs);
  if (item.fadeOutMs > 0) v *= Math.min(1, Math.max(0, totalMs - ms) / item.fadeOutMs);
  return Math.min(1, Math.max(0, v));
}
