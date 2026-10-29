// The accent of the edit, derived from its takes (default art direction): worked out by the analysis at render time,
// kept in cache/accent.json until the takes change, read by the studio preview. Only for the untouched default style.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Project, Timeline } from "@adam-studio/model";
import { accentApplies, fallbackHue, withAccent } from "./color";

const VERSION = 1;

export function applyAccent(dir: string, tl: Timeline, project: Project, python: (() => string) | null, compute: boolean): Timeline {
  if (!accentApplies(tl.style.name, project.styleOverrides as Record<string, unknown>)) return tl;
  const takes = Object.fromEntries([...new Set(tl.clips.map((c) => c.asset))].map((a) => [a, join(dir, "cache", a, "edit.mp4")] as const).filter(([, p]) => existsSync(p)));
  const key = createHash("sha1").update(`${VERSION}:${Object.entries(takes).map(([a, p]) => `${a}:${statSync(p).size}`).join("|")}`).digest("hex");
  const file = join(dir, "cache", "accent.json");
  try {
    const cached = JSON.parse(readFileSync(file, "utf8")) as { key: string; hue: number };
    if (cached.key === key) return withAccent(tl, cached.hue);
  } catch { /* none yet */ }
  if (!compute) return tl;
  // A stable key for the fallback: the first take's source file, not the project's (renameable) name.
  const fallback = fallbackHue(project.assets.map((a) => `${a.id}:${basename(a.path)}`).join("|") || project.name);
  let hue = fallback;
  if (python && Object.keys(takes).length) {
    mkdirSync(join(dir, "cache"), { recursive: true });
    const spec = join(dir, "cache", "accent-spec.json"), out = join(dir, "cache", "accent-out.json");
    writeFileSync(spec, JSON.stringify({ takes, every_ms: 2000, max: 60 }));
    try {
      const r = spawnSync(python(), ["-m", "adam_analysis", "accent", spec, out], { encoding: "utf8", windowsHide: true });
      if (r.status === 0) hue = (JSON.parse(readFileSync(out, "utf8")) as { hue: number | null }).hue ?? fallback;
    } catch { /* no analysis environment: the fallback hue */ }
  }
  writeFileSync(file, JSON.stringify({ key, hue }));
  return withAccent(tl, hue);
}
