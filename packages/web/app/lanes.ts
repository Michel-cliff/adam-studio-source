import type { Timeline } from "@adam-studio/model";

/** Overlapping blocks go on separate lanes; a lane is reused once its last block has ended. */
export function pack<T extends { fromFrame: number; durationFrames: number }>(items: T[]): (T & { lane: number })[] {
  const ends: number[] = [];
  return [...items].sort((a, b) => a.fromFrame - b.fromFrame).map((it) => {
    let lane = ends.findIndex((e) => e <= it.fromFrame);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = it.fromFrame + it.durationFrames;
    return { ...it, lane };
  });
}

/** The frames of the story filmstrip: the middle of each of `n` slots, as a moment of the take playing there. */
export function stripSlots(t: Timeline, n: number): ({ asset: string; ms: number } | null)[] {
  return Array.from({ length: n }, (_, i) => {
    const f = ((i + 0.5) * t.durationFrames) / n;
    const c = t.clips.find((x) => f >= x.fromFrame && f < x.fromFrame + x.durationFrames);
    return c ? { asset: c.asset, ms: Math.round(c.sourceInMs + ((f - c.fromFrame) * 1000) / t.fps) } : null;
  });
}

/** `n` bars between 0 and 1: the loudest sample of each bucket, relative to the loudest of all. */
export function peaks(samples: Float32Array, n: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / n));
  const raw = Array.from({ length: n }, (_, i) => {
    let m = 0;
    for (let k = i * size; k < Math.min(samples.length, (i + 1) * size); k++) m = Math.max(m, Math.abs(samples[k]!));
    return m;
  });
  const top = Math.max(...raw);
  return raw.map((v) => (top ? Math.round((v / top) * 100) / 100 : 0));
}
