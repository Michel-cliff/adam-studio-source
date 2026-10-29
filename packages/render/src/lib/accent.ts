// The accent of the edit, derived from its takes (default art direction): worked out by the analysis at render time,
// kept in cache/accent.json until the takes change, read by the studio preview. Only for the untouched default style.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Project, Timeline } from "@adam-studio/model";
import { accentApplies, fallbackHue, withAccent } from "./color";

const VERSION = 2; // 2: the three main hues kept for the guided path

export function applyAccent(dir: string, tl: Timeline, project: Project, python: (() => string) | null, compute: boolean): Timeline {
  if (!accentApplies(tl.style.name, project.styleOverrides as Record<string, unknown>)) return tl;
  const found = takeHues(dir, tl, project, python, compute);
  return found ? withAccent(tl, found.hue) : tl;
}

/** The accent hue of the takes and their three main hues (cached; worked out when compute is set). */
export function takeHues(dir: string, tl: Timeline, project: Project, python: (() => string) | null, compute: boolean): { hue: number; hues: number[] } | null {
  const takes = Object.fromEntries([...new Set(tl.clips.map((c) => c.asset))].map((a) => [a, join(dir, "cache", a, "edit.mp4")] as const).filter(([, p]) => existsSync(p)));
  const key = createHash("sha1").update(`${VERSION}:${Object.entries(takes).map(([a, p]) => `${a}:${statSync(p).size}`).join("|")}`).digest("hex");
  const file = join(dir, "cache", "accent.json");
  try {
    const cached = JSON.parse(readFileSync(file, "utf8")) as { key: string; hue: number; hues?: number[] };
    if (cached.key === key) return { hue: cached.hue, hues: cached.hues ?? [cached.hue] };
  } catch { /* none yet */ }
  if (!compute) return null;
  // A stable key for the fallback: the first take's source file, not the project's (renameable) name.
  const fallback = fallbackHue(project.assets.map((a) => `${a.id}:${basename(a.path)}`).join("|") || project.name);
  let hue = fallback, hues: number[] = [];
  if (python && Object.keys(takes).length) {
    mkdirSync(join(dir, "cache"), { recursive: true });
    const spec = join(dir, "cache", "accent-spec.json"), out = join(dir, "cache", "accent-out.json");
    writeFileSync(spec, JSON.stringify({ takes, every_ms: 2000, max: 60 }));
    try {
      const r = spawnSync(python(), ["-m", "adam_analysis", "accent", spec, out], { encoding: "utf8", windowsHide: true });
      if (r.status === 0) {
        const a = JSON.parse(readFileSync(out, "utf8")) as { hue: number | null; hues?: number[] };
        hue = a.hue ?? fallback;
        hues = a.hues ?? [];
      }
    } catch { /* no analysis environment: the fallback hue */ }
  }
  if (!hues.length) hues = [hue];
  writeFileSync(file, JSON.stringify({ key, hue, hues }));
  return { hue, hues };
}
