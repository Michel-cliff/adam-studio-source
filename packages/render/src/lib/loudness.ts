// The finished video's sound, as the default art direction fixes it: -14 LUFS integrated (the platforms' target),
// true peaks at -1 dBTP or lower (headroom for their AAC encode), loudness range at most 7 LU. Two passes of ffmpeg's
// loudnorm: one measures, the second applies with those measures (linear, so the dynamics are not pumped).
import { execFileSync, spawnSync } from "node:child_process";
import { renameSync, rmSync } from "node:fs";

// The true peak aims at -2.5 dBTP, not -1: the AAC encode after loudnorm overshoots by about 1 dB (measured on a real
// take: -1.5 aimed, -0.6 delivered). loudnorm's limiter only touches the peaks, the integrated level stays at -14.
export const TARGET = { i: -14, tp: -2.5, lra: 7 } as const;
const GATE = { minI: -15, maxI: -13, maxTp: -1 } as const;

export type Loudness = { i: number; tp: number; lra: number; thresh: number; offset: number };

/** The JSON report loudnorm prints at the end of its log. */
export function parseLoudnorm(log: string): Loudness {
  const start = log.lastIndexOf("{"), end = log.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("ffmpeg gave no loudness report");
  const j = JSON.parse(log.slice(start, end + 1)) as Record<string, string>;
  const n = (k: string) => { const v = Number(j[k]); if (!Number.isFinite(v)) throw new Error(`no ${k} in the loudness report`); return v; };
  return { i: n("input_i"), tp: n("input_tp"), lra: n("input_lra"), thresh: n("input_thresh"), offset: n("target_offset") };
}

const filter = (extra = "") => `loudnorm=I=${TARGET.i}:TP=${TARGET.tp}:LRA=${TARGET.lra}${extra}:print_format=json`;

/** Integrated loudness, true peak and range of a file's sound. */
export function measureLoudness(file: string): Loudness {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", filter(), "-f", "null", "-"], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`could not measure the sound of ${file}: ${(r.stderr ?? "").trim().split("\n").pop()}`);
  return parseLoudnorm(r.stderr);
}

/** The cut that brings true peaks back under -1 dBTP (0.5 dB of margin), when the AAC encode pushed them over anyway. */
export function peakTrim(m: Loudness): number {
  return m.tp > GATE.maxTp ? -(m.tp - GATE.maxTp + 0.5) : 0;
}

const encodeAudio = (file: string, af: string) => {
  const tmp = file.replace(/(\.\w+)$/, ".loud$1");
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-map", "0", "-c:v", "copy", "-af", af, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp], { windowsHide: true });
    renameSync(tmp, file);
  } catch (e) { rmSync(tmp, { force: true }); throw e; }
};

/**
 * Normalises the sound in place; the picture is copied as it is. Returns the measures before. The AAC encode can push
 * true peaks back over the limit after loudnorm (seen on a real take: -0.6 dBTP): a last small cut takes them back.
 */
export function normalizeLoudness(file: string): Loudness {
  const m = measureLoudness(file);
  encodeAudio(file, filter(`:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true`));
  const trim = peakTrim(measureLoudness(file));
  if (trim < 0) encodeAudio(file, `volume=${trim.toFixed(2)}dB`);
  return m;
}

/** What blocks the export: integrated loudness outside -15 to -13 LUFS, true peaks above -1 dBTP. */
export function audioGate(m: Loudness): string[] {
  const out: string[] = [];
  if (m.i < GATE.minI || m.i > GATE.maxI) out.push(`the sound is at ${m.i.toFixed(1)} LUFS, outside -15 to -13`);
  if (m.tp > GATE.maxTp) out.push(`its true peak reaches ${m.tp.toFixed(1)} dBTP, above -1`);
  return out;
}

const ffmpegLog = (file: string, af: string) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", af, "-f", "null", "-"], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`could not read the sound of ${file}`);
  return r.stderr;
};

/** The share of the duration in dead silence (below -60 dB for 0.3 s or more). */
export function silenceShare(file: string): number {
  const log = ffmpegLog(file, "silencedetect=noise=-60dB:d=0.3");
  const silent = [...log.matchAll(/silence_duration: ([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  // A silence still open at the end has no duration line: from its start to the end.
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: /g)].length;
  const total = Number(log.match(/Duration: (\d+):(\d+):([\d.]+)/)?.slice(1).reduce((a, x, i) => a + Number(x) * [3600, 60, 1][i]!, 0) ?? 0);
  const open = starts.length > ends ? total - starts[starts.length - 1]! : 0;
  return total > 0 ? Math.min(1, (silent + open) / total) : 0;
}

/**
 * The noise floor in dBFS: the level of the quietest stretches where something is still heard (the room and the mic),
 * from the level of every 50 ms; the instants of exact digital silence (between takes, at the ends) do not count.
 */
export function noiseFloor(file: string): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af",
    "asetnsamples=n=2400:p=0,astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=RMS_level,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
    "-f", "null", "-"], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`could not read the sound of ${file}`);
  const levels = [...r.stdout.matchAll(/RMS_level=(-?[\d.]+)/g)].map((m) => Number(m[1])).filter((v) => v > -90).sort((a, b) => a - b);
  // The 10th percentile: the quiet between words, not one odd window.
  return levels.length ? levels[Math.floor(levels.length * 0.1)]! : -120;
}
