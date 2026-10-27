import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { lint, resolve, type Project, type Timeline } from "@adam-studio/model";
import { ensureAnalysis } from "../analysis";
import { bundleWithMedia, renderVideo } from "../engine";
import { expandEnv, planMedia } from "../media";
import { CliError, loadProject } from "../project-io";

export function parseFrames(s?: string): [number, number] | null {
  if (!s) return null;
  const m = /^(\d+)-(\d+)$/.exec(s);
  if (!m) throw new CliError(`--frames expects a-b (e.g. 0-90), got "${s}"`);
  return [Number(m[1]), Number(m[2])];
}

/** The project name as a file name: characters Windows forbids become "-" (a ":" would write an NTFS stream). */
export function fileSafeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/, "").trim() || "edit";
}

/** Prints the lint warnings and refuses to go on while any is an error, unless forced. */
export function lintGate(project: Project, timeline: Timeline, dir: string, force: boolean, action: "render" | "export"): void {
  const warnings = lint(project, timeline, { projectDir: dir, fileExists: existsSync });
  for (const w of warnings) console.log(`${w.severity === "error" ? "ERROR" : "warn "} ${w.rule}: ${w.message}`);
  if (warnings.some((w) => w.severity === "error") && !force) {
    throw new CliError(`Refusing to ${action}: fix the errors above, or pass --force.`);
  }
}

/**
 * For an export scaled by n (e.g. 2 for 4K from 1080 x 1920), the takes re-encoded from their source at n times the
 * edit size, like edit.mp4 (same frame rate, no B-frames), into cache/<asset>/edit@<n>x.mp4. Kept while newer than
 * the source.
 */
export function ensureScaledTakes(dir: string, project: Project, timeline: Timeline, scale: number): void {
  const ids = new Set(timeline.clips.flatMap((c) => (c.framing.mode === "split" ? [c.asset, c.framing.asset] : [c.asset])));
  for (const id of ids) {
    const asset = project.assets.find((a) => a.id === id);
    const w = asset?.meta?.width, h = asset?.meta?.height;
    if (!asset || !w || !h) throw new CliError(`--scale needs the size of take "${id}" (run the analysis first)`);
    const src = resolvePath(dir, expandEnv(asset.path));
    const out = join(dir, "cache", id, `edit@${scale}x.mp4`);
    if (existsSync(out) && existsSync(src) && statSync(out).mtimeMs > statSync(src).mtimeMs) continue;
    if (!existsSync(src)) throw new CliError(`--scale reads the source of take "${id}", missing: ${src}`);
    console.log(`encoding ${id} at ${w * scale}x${h * scale}`);
    const fps = String(timeline.fps);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", `scale=${w * scale}:${h * scale}:flags=lanczos`, "-r", fps,
      "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-g", fps, "-bf", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out]);
  }
}

export async function renderCommand(projectDir: string, opts: { out?: string; frames?: string; force: boolean; analyze?: boolean; scale?: number }): Promise<string> {
  const { dir, project, style } = loadProject(projectDir);
  const timeline = resolve(project, style);
  ensureAnalysis(dir, project, timeline, { analyze: opts.analyze ?? true });
  lintGate(project, timeline, dir, opts.force, "render");
  const scale = opts.scale ?? 1;
  if (scale > 1) ensureScaledTakes(dir, project, timeline, scale);
  const plan = planMedia(dir, project, timeline, { scale });
  const serveUrl = await bundleWithMedia(plan, join(dir, "renders", ".bundle"));
  const name = fileSafeName(project.name);
  const out = opts.out ? resolvePath(opts.out) : join(dir, "renders", scale > 1 ? `${name}@${scale}x.mp4` : `${name}.mp4`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(join(dir, "renders", `${name}.timeline.json`), `${JSON.stringify(timeline, null, 2)}\n`);
  await renderVideo(serveUrl, { timeline, media: plan.media, fonts: plan.fonts }, out, parseFrames(opts.frames), { scale });
  console.log(`wrote ${out}`);
  return out;
}
