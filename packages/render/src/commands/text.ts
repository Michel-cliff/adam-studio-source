// Text-only mode (default art direction): a project made from a script alone (script.json, the studio's). Each line
// becomes a card; the "take" is a silent background in the style's ink, as long as the cards, written straight where
// the analysis would put a take's edit.mp4, so the render, the studio and CapCut read it like any other.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve as resolvePath } from "node:path";
import { canvasSize, cardElements, mergeStyle, parseProject, scriptCards, type ProjectInput } from "@adam-studio/model";
import { CliError, formatErrors, loadProject } from "../project-io";
import { defaultStyle, findSystemFont } from "../takes";

const BG = "bg";

function background(dir: string, ms: number, ink: string, width: number, height: number, fps: number): void {
  const out = join(dir, "cache", BG, "edit.mp4"), stamp = join(dir, "cache", BG, "background.json");
  const want = JSON.stringify({ ms, ink, width, height, fps });
  if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, "utf8") === want) return;
  mkdirSync(join(dir, "cache", BG), { recursive: true });
  // One key frame a second and no B-frames, like an analysed take: the studio seeks in it.
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${ink.replace("#", "0x")}:s=${width}x${height}:r=${fps}`,
    "-t", (ms / 1000).toFixed(3), "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-bf", "0", "-g", String(fps), "-pix_fmt", "yuv420p", out], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new CliError(`could not make the background of the cards: ${r.stderr.trim()}`);
  writeFileSync(stamp, want);
}

/** Makes or rebuilds a text-only project from a script (the given file, or the project's own script.json). */
export function textCommand(dirIn: string, opts: { script?: string; name?: string }): void {
  const dir = resolvePath(dirIn);
  // The script lives where the studio keeps it (script.json), so it is edited and sent with every ask like any other.
  const own = join(dir, "script.json");
  const fresh = !existsSync(join(dir, "project.json"));
  let script: string;
  if (opts.script) {
    if (!existsSync(opts.script)) throw new CliError(`script not found: ${resolvePath(opts.script)}`);
    script = readFileSync(resolvePath(opts.script), "utf8");
  } else {
    try { script = String(JSON.parse(readFileSync(own, "utf8")).text ?? ""); } catch { throw new CliError(`${dir} has no script yet: give one with --script`); }
  }
  const cards = scriptCards(script);
  if (!cards.length) throw new CliError("the script is empty: write one line per card");
  mkdirSync(dir, { recursive: true });
  if (opts.script) writeFileSync(own, `${JSON.stringify({ text: script.trim(), by: "you", at: Date.now() }, null, 2)}\n`);

  let project: ProjectInput;
  if (fresh) {
    writeFileSync(join(dir, "style.json"), `${JSON.stringify(defaultStyle(findSystemFont()), null, 2)}\n`);
    project = { version: 1, name: opts.name ?? basename(dir), canvas: { format: "9:16", fps: 30 }, format: "text", style: "style.json", assets: [], story: [] };
  } else {
    const loaded = loadProject(dir).project;
    if (loaded.format !== "text") throw new CliError(`${loaded.name} is a ${loaded.format} video, not a text-only one`);
    project = loaded;
  }
  const { elements, totalMs } = cardElements(cards);
  const { style } = fresh ? { style: undefined } : loadProject(dir);
  const ink = (style ? mergeStyle(style, project.styleOverrides ?? {}) : defaultStyle(findSystemFont())).colors.ink;
  const { width, height } = canvasSize(project.canvas.format);
  background(dir, totalMs, ink, width, height, project.canvas.fps);

  const next: ProjectInput = {
    ...project,
    assets: [{ id: BG, kind: "video", path: `cache/${BG}/edit.mp4`, meta: { durationMs: totalMs, width, height, hasAudio: false } }, ...(project.assets ?? []).filter((a) => a.id !== BG)],
    transcript: { lang: project.transcript?.lang ?? "fr", words: {} },
    story: [{ id: "c1", asset: BG, inMs: 0, outMs: totalMs }],
    // The cards are the script's: the others (music, sound effects) stay.
    elements: [...elements, ...(project.elements ?? []).filter((e) => e.kind !== "card")],
    captions: [],
  };
  const parsed = parseProject(next);
  if (!parsed.ok) throw new CliError(formatErrors("project.json", parsed.errors));
  writeFileSync(join(dir, "project.json"), `${JSON.stringify(next, null, 2)}\n`);
  console.log(`${dir}: ${cards.length} cards, ${(totalMs / 1000).toFixed(1)} s`);
}
