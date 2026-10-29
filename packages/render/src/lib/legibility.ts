// Legibility and placement of the captions, from the frames under them (the default art direction): the analysis
// measures the background under each caption and finds the face and hands at those moments; the caption gets the least
// treatment that keeps it readable (soft shadow, stronger shadow, outline, plate) and a height clear of the eyes, the
// mouth and the hands. Worked out at render time and kept in cache/legibility.json until the edit changes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline } from "@adam-studio/model";

const VERSION = 5; // 2: the face wins over the hands; 3: above the head when the face fills the band; 4: one height above the head
const LINE_HEIGHT = 1.15;

export type LegibilitySpec = {
  width: number; height: number; band: [number, number]; safeTop: number; takes: Record<string, string>;
  shots: { id: string; take: string; ms: number }[];
  items: { id: string; box: [number, number, number, number]; samples: { take: string; ms: number }[] }[];
};
export type LegibilityResult = Record<string, { treatment: number; y: number; burnt: number }> & { _shots?: Record<string, [number, number, number, number] | null> };

/** Where an output frame is in the takes: the clip holding it, and the source time (clips may be sped up). */
function sourceAt(tl: Timeline, frame: number): { take: string; ms: number } | null {
  const c = tl.clips.find((x) => frame >= x.fromFrame && frame < x.fromFrame + x.durationFrames) ?? null;
  if (!c) return null;
  return { take: c.asset, ms: Math.round(c.sourceInMs + ((frame - c.fromFrame) / c.durationFrames) * (c.sourceOutMs - c.sourceInMs)) };
}

/** The question for the analysis: each caption's box (720 px wide, two lines), and three moments of the takes under it. */
export function legibilitySpec(tl: Timeline, takes: Record<string, string>): LegibilitySpec {
  const k = tl.width / 1080;
  const band: [number, number] = tl.format === "9:16"
    ? [Math.round(950 * tl.height / 1920), Math.round(1248 * tl.height / 1920)]
    : [Math.round(tl.height * 0.7), Math.round(tl.height * 0.93)];
  const h = Math.round(2 * tl.style.caption.size * tl.width * LINE_HEIGHT);
  const items = tl.captions.map((c) => {
    const cx = c.x * tl.width, y0 = Math.round(c.y * tl.height - h / 2);
    const samples = [0.2, 0.5, 0.8].map((f) => sourceAt(tl, c.fromFrame + Math.round(c.durationFrames * f))).filter((s): s is { take: string; ms: number } => s !== null && s.take in takes);
    return { id: c.id, box: [Math.round(cx - 360 * k), y0, Math.round(cx + 360 * k), y0 + h] as [number, number, number, number], samples };
  });
  const safeTop = tl.format === "9:16" ? Math.round(269 * tl.height / 1920) : Math.round(tl.height * 0.08);
  // The middle of each shot, for the face its edge blur is shaped around.
  const shots = tl.clips.filter((c) => c.asset in takes).map((c) => ({ id: c.id, take: c.asset, ms: Math.round((c.sourceInMs + c.sourceOutMs) / 2) }));
  return { width: tl.width, height: tl.height, band, safeTop, takes, items, shots };
}

/** The timeline with each answered caption's treatment and height. */
export function mergeLegibility(tl: Timeline, r: LegibilityResult): Timeline {
  const faces = r._shots ?? {};
  return {
    ...tl,
    captions: tl.captions.map((c) => (r[c.id] ? { ...c, treatment: r[c.id]!.treatment, y: r[c.id]!.y / tl.height } : c)),
    clips: tl.clips.map((c) => {
      const f = faces[c.id];
      return f ? { ...c, face: [f[0] / tl.width, f[1] / tl.height, f[2] / tl.width, f[3] / tl.height] as [number, number, number, number] } : c;
    }),
  };
}

/**
 * The timeline with its captions' legibility: from cache when the edit has not changed, else worked out (compute) by
 * the analysis. Without the analysis environment, or when it fails, the captions keep the style's own treatment.
 */
export function applyLegibility(dir: string, tl: Timeline, python: (() => string) | null, compute: boolean): Timeline {
  if (!tl.captions.length) return tl;
  const takes = Object.fromEntries([...new Set(tl.clips.map((c) => c.asset))].map((a) => [a, join(dir, "cache", a, "edit.mp4")] as const).filter(([, p]) => existsSync(p)));
  const spec = legibilitySpec(tl, takes);
  const key = createHash("sha1").update(`${VERSION}:${JSON.stringify(spec)}`).digest("hex");
  const file = join(dir, "cache", "legibility.json");
  try {
    const cached = JSON.parse(readFileSync(file, "utf8")) as { key: string; result: LegibilityResult };
    if (cached.key === key) return mergeLegibility(tl, cached.result);
  } catch { /* none yet */ }
  if (!compute || !python || !Object.keys(takes).length) return tl;
  mkdirSync(join(dir, "cache"), { recursive: true });
  const specFile = join(dir, "cache", "legibility-spec.json"), outFile = join(dir, "cache", "legibility-out.json");
  writeFileSync(specFile, JSON.stringify(spec));
  let bin: string;
  try { bin = python(); } catch { return tl; }
  const r = spawnSync(bin, ["-m", "adam_analysis", "legibility", specFile, outFile], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0 || !existsSync(outFile)) { console.warn(`legibility skipped: ${(r.stderr ?? "").trim().split("\n").pop() ?? "the analysis failed"}`); return tl; }
  const result = JSON.parse(readFileSync(outFile, "utf8")) as LegibilityResult;
  writeFileSync(file, JSON.stringify({ key, result }));
  return mergeLegibility(tl, result);
}
