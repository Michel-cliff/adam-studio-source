import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve as resolvePath } from "node:path";
import { lint, repairCuts, resolve, type Project, type Timeline } from "@adam-studio/model";
import { analysisPython, ensureAnalysis } from "../analysis";
import { bundleWithMedia, renderVideo } from "../engine";
import { exportChecks } from "../lib/checks";
import { confidenceWarnings, wordConfidence } from "../lib/confidence";
import { editStamp, writeVideoStamp } from "../lib/edit-stamp";
import { homedir } from "node:os";
import { applyAccent } from "../lib/accent";
import { withVideoDA } from "../lib/da";
import { openingBlackWindows } from "../lib/opening";
import { applyLegibility } from "../lib/legibility";
import { audioGate, blackShare, measureLoudness, noiseFloor, normalizeLoudness, silenceShare } from "../lib/loudness";
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
  // Taken before reading: a change made from here on is not in this video, and the studio will say so.
  const stamp = editStamp(resolvePath(projectDir));
  const loaded = loadProject(projectDir);
  const { dir, style } = loaded;
  // Never a cut inside a word: an edge that falls in one moves out of it before anything is computed.
  // The creator's art direction under the video's own settings, and never a cut inside a word.
  const { project, moved } = repairCuts(withVideoDA(loaded.project, join(homedir(), ".adam-studio")));
  for (const m of moved) console.log(`repaired: ${m}`);
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
  // Each caption's treatment and height, from the frames under it (cached until the edit changes).
  // The accent from the takes (untouched default style only), then each caption's treatment and height.
  const readable = applyLegibility(dir, applyAccent(dir, timeline, project, analysisPython, true), analysisPython, true);
  // The edit's own checks come before the render: a refusal costs no rendering time.
  const checks = exportChecks(readable, project.transcript.words);
  checks.warnings.push(...confidenceWarnings(readable, wordConfidence(dir, [...new Set(readable.clips.map((c) => c.asset))])));
  for (const w of checks.warnings) console.log(`warning: ${w}`);
  if (checks.blocking.length && !opts.frames) throw new CliError(`Export refused: ${checks.blocking.join("; ")}.`);
  // Made under a hidden name, and put in place only once finished: nothing half made can be opened, and the previous
  // video stays playable meanwhile.
  const part = join(dirname(out), `.${basename(out, ".mp4")}.part.mp4`);
  await renderVideo(serveUrl, { timeline: readable, media: plan.media, fonts: plan.fonts }, part, parseFrames(opts.frames), { scale });
  // A text-only video sits on its ink background on purpose: no black-picture check for it.
  if (!opts.frames) finishSound(part, { picture: project.format !== "text", expectedBlack: openingBlackWindows(timeline), refusedAs: out.replace(/\.mp4$/i, ".refused.mp4") });
  const placed = moveIntoPlace(part, out);
  if (!opts.frames) writeVideoStamp(placed, stamp);
  console.log(`wrote ${placed}`);
  return placed;
}

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Puts a finished video at its place. A video open in a player cannot be replaced on Windows: it waits a moment, then
 * gives the new video a dated name rather than lose minutes of rendering.
 */
export function moveIntoPlace(from: string, to: string, opts: { waitMs?: number; rename?: (a: string, b: string) => void; now?: Date } = {}): string {
  const rename = opts.rename ?? renameSync;
  const until = Date.now() + (opts.waitMs ?? 15000);
  for (;;) {
    try { rename(from, to); return to; } catch (error) {
      if (!["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      if (Date.now() >= until) break;
      pause(Math.min(500, Math.max(1, until - Date.now())));
    }
  }
  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const other = to.replace(/\.mp4$/i, ` ${stamp}.mp4`);
  rename(from, other);
  console.log(`note: ${basename(to)} is open in another program: the new video is saved as ${basename(other)}`);
  return other;
}

const hasSound = (file: string) => {
  try { return execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file], { encoding: "utf8" }).trim() !== ""; }
  catch { return false; }
};

/**
 * The finished sound, as the default art direction fixes it: normalised to -14 LUFS (true peak -1.5 dBTP), then
 * checked. A failed check refuses the export: the file is renamed .refused.mp4, so it never passes for a finished
 * video, and the reasons are given.
 */
export function finishSound(out: string, opts: { picture?: boolean; refusedAs?: string; expectedBlack?: { start: number; end: number }[] } = {}): void {
  const issues: string[] = [];
  if (hasSound(out)) {
    // The noise floor is judged on the processed voice, before the final gain lifts everything (+10 dB on a real take).
    const floor = noiseFloor(out);
    const before = normalizeLoudness(out);
    const after = measureLoudness(out);
    console.log(`sound: ${before.i.toFixed(1)} -> ${after.i.toFixed(1)} LUFS, true peak ${after.tp.toFixed(1)} dBTP, noise floor ${floor.toFixed(0)} dBFS`);
    issues.push(...audioGate(after));
    // A loud floor never refuses the export: it is a noisy room, or sound the creator already mixed in.
    if (floor > -35) console.log(`note: sound at ${floor.toFixed(0)} dBFS between words (a noisy room, or sound already mixed in): the export goes on`);
    else if (floor > -45) console.log(`warning: the background noise is at ${floor.toFixed(0)} dBFS, the sound will stay average (a quieter room or a closer mic helps)`);
    const silent = silenceShare(out);
    if (silent > 0.15) issues.push(`${Math.round(silent * 100)} % of the video is total silence (more than 15 %)`);
  }
  // Silent videos still need their picture checked.
  const black = opts.picture === false ? 0 : blackShare(out, opts.expectedBlack);
  if (black > 0) issues.push(`${black.toFixed(2)} s of black picture`);
  if (!issues.length) return;
  renameSync(out, opts.refusedAs ?? out.replace(/\.mp4$/i, ".refused.mp4"));
  throw new CliError(`Export refused: ${issues.join("; ")}.`);
}
