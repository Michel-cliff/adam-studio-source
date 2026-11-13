import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, constants, copyFileSync, createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { kindOf, type LibraryKind } from "./local";
import { isYoutube, youtubeVideo } from "./youtube";
import { limitBytes, openPublicDownload } from "./public-network";

// cutout: an image comes in as a paper cut-out (its background removed on this machine, py/cutout), a transparent PNG.
export type ImportSource = { path?: string; url?: string; kind?: LibraryKind; title?: string; license?: string; creator?: string; page?: string; cutout?: boolean; startMs?: number; endMs?: number };
export type Imported = { id: string; kind: LibraryKind; path: string; file: string };

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "asset";
const DEFAULT_EXT = { video: ".mp4", image: ".jpg", audio: ".mp3", font: ".ttf", lottie: ".json" } as const;
// An id becomes a file name: it must stay one, inside the assets folder.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

let activeDownloads = 0;

async function download(url: string, path: string, timeout: number, allowed?: (url: string) => boolean): Promise<void> {
  if (activeDownloads >= 2) throw new Error("Too many downloads are running.");
  activeDownloads++;
  try {
    const signal = AbortSignal.timeout(timeout);
    const response = await openPublicDownload(url, signal, allowed);
    const max = 300 * 1024 * 1024;
    if (Number(response.headers["content-length"]) > max) {
      response.destroy();
      throw new Error("This file exceeds the allowed size.");
    }
    let owned = false;
    const stream = createWriteStream(path, { flags: "wx" });
    stream.once("open", () => { owned = true; });
    try { await pipeline(response, limitBytes(max), stream, { signal }); }
    catch (error) { if (owned) rmSync(path, { force: true }); throw error; }
  } finally { activeDownloads--; }
}

/**
 * Copies a local file, or downloads a URL, into `<project>/assets/` and records where it came from (license,
 * author, page) in `assets/CREDITS.md`. Returns the asset to add to the project (path relative to the project).
 */
export async function importAsset(projectDir: string, src: ImportSource, id?: string, hosts?: (url: string) => boolean): Promise<Imported> {
  if (!src.path && !src.url) throw new Error("give a path or a url");
  if (src.cutout && process.env.ADAM_PACKAGED) throw new Error("cut-outs are not available in the installed app yet: import the image as it is");
  const name = src.path ? basename(src.path) : basename(new URL(src.url!).pathname) || "download";
  const youtube = Boolean(src.url && isYoutube(src.url));
  const kind = src.kind ?? (youtube ? "video" : kindOf(name));
  if (youtube && kind !== "video") throw new Error("YouTube imports must be videos.");
  if (!youtube && (src.startMs !== undefined || src.endMs !== undefined)) throw new Error("Clip ranges are supported for YouTube videos.");
  if (!kind) throw new Error(`cannot tell what ${name} is: give kind (video, image, audio, font, lottie)`);
  const assetId = id ?? slug(src.title ?? basename(name, extname(name)));
  if (!SAFE_ID.test(assetId)) throw new Error(`"${assetId}" cannot be an asset id: letters, digits, - and _ only, 64 at most`);
  const folder = join(projectDir, "assets");
  mkdirSync(folder, { recursive: true });
  if (!lstatSync(folder).isDirectory() || realpathSync.native(folder) !== join(realpathSync.native(projectDir), "assets")) throw new Error("Invalid project assets folder.");
  // The extension follows the kind: a program named as an image comes in as an image file, and never runs.
  const ext = kindOf(name) === kind ? extname(name) : DEFAULT_EXT[kind];
  const file = join(folder, `${assetId}${ext}`);
  if (existsSync(file)) throw new Error(`${file} exists: pick another id`);
  if (src.path) {
    if (!existsSync(src.path)) throw new Error(`not found: ${src.path}`);
    copyFileSync(src.path, file, constants.COPYFILE_EXCL);
  } else {
    if (youtube) {
      if (hosts && !hosts(src.url!)) throw new Error("This source is not allowed.");
      await youtubeVideo(src.url!, async video => { copyFileSync(video, file, constants.COPYFILE_EXCL); }, src);
    } else await download(src.url!, file, 120_000, hosts);
  }
  if (src.url || src.license) {
    const credits = join(folder, "CREDITS.md");
    if (!existsSync(credits)) writeFileSync(credits, "# Credits\n\n", { flag: "wx" });
    if (!lstatSync(credits).isFile()) throw new Error("Invalid credits file.");
    appendFileSync(credits, `- ${basename(file)}: "${src.title ?? name}" by ${src.creator || "unknown"}, ${src.license ?? "license unknown"}${src.page || src.url ? `, ${src.page || src.url}` : ""}\n`);
  }
  if (src.cutout && kind === "image") {
    const png = join(folder, `${assetId}.png`);
    const r = spawnSync(cutoutPython(), ["-m", "adam_cutout", file, png], { encoding: "utf8", windowsHide: true });
    if (r.status !== 0) throw new Error(`the cut-out failed: ${(r.stderr || r.stdout).trim().split(/\r?\n/).pop()}`);
    if (png !== file) rmSync(file);
    return { id: assetId, kind, path: `assets/${basename(png)}`, file: png };
  }
  return { id: assetId, kind, path: `assets/${basename(file)}`, file };
}

/** The Python of the cut-out environment (py/cutout/.venv, its own: rembg needs numpy 2). */
function cutoutPython(): string {
  const root = fileURLToPath(new URL("../../../py/cutout/.venv/", import.meta.url));
  const py = process.platform === "win32" ? join(root, "Scripts", "python.exe") : join(root, "bin", "python");
  if (!existsSync(py)) throw new Error("the cut-out environment is missing: python -m venv py/cutout/.venv, then py/cutout/.venv/Scripts/python -m pip install -e py/cutout");
  return py;
}

/**
 * A picture of a file for Claude to look at, as base64 JPEG: four frames of a video, the image itself, the waveform
 * of a sound, or a sample line of a font. Local paths and URLs both work.
 */
export async function lookAt(pathOrUrl: string, hosts?: (url: string) => boolean): Promise<{ kind: LibraryKind; jpeg: string; note: string }> {
  if (isYoutube(pathOrUrl)) {
    if (hosts && !hosts(pathOrUrl)) throw new Error("This source is not allowed.");
    return youtubeVideo(pathOrUrl, file => lookAt(file));
  }
  let file = pathOrUrl;
  let temp: string | null = null;
  if (/^https?:\/\//.test(pathOrUrl)) {
    temp = join(tmpdir(), `adam-look-${randomUUID()}${extname(new URL(pathOrUrl).pathname) || ".bin"}`);
    await download(pathOrUrl, temp, 60_000, hosts);
    file = temp;
  }
  const kind = kindOf(file) ?? "image";
  const out = join(tmpdir(), `adam-look-${randomUUID()}.jpg`);
  const ff = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", "-protocol_whitelist", "file,pipe", ...args, "-frames:v", "1", "-q:v", "4", out]);
  let note = "";
  try {
    if (kind === "video") {
      const d = Number.parseFloat(execFileSync("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" })) || 1;
      ff(["-i", file, "-vf", `fps=${(4 / d).toFixed(4)},scale=-2:480,tile=4x1`]);
      note = `four frames across ${d.toFixed(1)} s`;
    } else if (kind === "audio") {
      ff(["-i", file, "-filter_complex", "showwavespic=s=1200x240:colors=white", "-update", "1"]);
      note = "waveform";
    } else if (kind === "font") {
      const font = file.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
      ff(["-f", "lavfi", "-i", "color=c=0x16161a:s=1400x260", "-vf", `drawtext=fontfile='${font}':text='Adam Studio 0123 AaBbCc':fontcolor=white:fontsize=96:x=40:y=80`]);
      note = "font sample";
    } else if (kind === "lottie") {
      note = `Lottie JSON (${readFileSync(file, "utf8").length} bytes): no picture`;
      return { kind, jpeg: "", note };
    } else {
      ff(["-i", file, "-vf", "scale='min(1280,iw)':-2"]);
      note = "image";
    }
    return { kind, jpeg: readFileSync(out).toString("base64"), note };
  } finally {
    rmSync(out, { force: true });
    if (temp) rmSync(temp, { force: true });
  }
}
