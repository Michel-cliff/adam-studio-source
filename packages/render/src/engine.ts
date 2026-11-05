import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { cpus, freemem, homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, makeCancelSignal } from "@remotion/renderer";
import { activeVideoSources, safeConcurrency } from "./lib/concurrency";
import { frameCacheBytes, MAX_TABS, progressReporter, renderAttempts, STALL_MS, stallGuard } from "./lib/render-watch";
import { prepareMedia, type MediaPlan } from "./media";
import { COMPOSITION_ID, type RenderProps } from "./props";

export const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "index.ts");

const OLD_BUNDLE_MS = 6 * 60 * 60 * 1000;
const RENDER_SRC = dirname(ENTRY);

/** What the bundle is made from: the same sources give the same bundle. */
function sourcesKey(): string {
  const hash = createHash("sha256");
  const walk = (folder: string) => {
    if (!existsSync(folder)) return;
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path);
      else { hash.update(`${path.slice(folder.length)}\0`); hash.update(readFileSync(path)); }
    }
  };
  walk(RENDER_SRC);
  walk(join(RENDER_SRC, "..", "..", "model", "src"));
  hash.update(readFileSync(join(RENDER_SRC, "..", "package.json")));
  return hash.digest("hex").slice(0, 16);
}

/** The bundle is built once per version of the code (10 s saved at each export and each still), whatever the project. */
async function sharedBundle(): Promise<string> {
  const dir = join(process.env.ADAM_CACHE_DIR ?? join(homedir(), ".adam-studio", "cache"), "bundles", sourcesKey());
  if (existsSync(join(dir, "index.html"))) return dir;
  const building = `${dir}.${process.pid}`;
  rmSync(building, { recursive: true, force: true });
  await bundle({ entryPoint: ENTRY, outDir: building, publicDir: join(building, "public") });
  // Another run may have finished first: its bundle is the same.
  try { renameSync(building, dir); } catch { rmSync(building, { recursive: true, force: true }); if (!existsSync(join(dir, "index.html"))) throw new Error("the render bundle could not be saved"); }
  // The bundles of earlier versions of the code are of no more use.
  const parent = dirname(dir);
  for (const name of readdirSync(parent)) if (name !== basename(dir) && !name.includes(".")) rmSync(join(parent, name), { recursive: true, force: true });
  return dir;
}

/**
 * A folder for this run under `outDir`: the shared bundle, and the planned media hard-linked into its public folder.
 * Each run has its own: a still asked while the video renders must not pull the files from under it. The folder goes
 * when the process ends; what a killed process left goes at a later run.
 */
export async function bundleWithMedia(plan: MediaPlan, outDir: string): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) {
    const old = join(outDir, name);
    try { if (Date.now() - statSync(old).mtimeMs > OLD_BUNDLE_MS) rmSync(old, { recursive: true, force: true }); } catch { /* another run is on it */ }
  }
  const shared = await sharedBundle();
  const runDir = join(outDir, `${process.pid}-${Date.now()}`);
  process.once("exit", () => { try { rmSync(runDir, { recursive: true, force: true }); } catch { /* removed at a later run */ } });
  cpSync(shared, runDir, { recursive: true });
  prepareMedia(plan, join(runDir, "public"));
  return runDir;
}

export async function renderVideo(
  serveUrl: string,
  props: RenderProps,
  outFile: string,
  frameRange: number | [number, number] | [number, number][] | null = null,
  opts: { transparent?: boolean; scale?: number } = {},
): Promise<void> {
  const composition = await selectComposition({ browserExecutable: process.env.ADAM_BROWSER_EXECUTABLE, serveUrl, id: COMPOSITION_ID, inputProps: props });
  const size = { fps: composition.fps, width: composition.width * (opts.scale ?? 1), height: composition.height * (opts.scale ?? 1), videoSources: activeVideoSources(props.timeline) };
  const concurrency = Math.min(MAX_TABS, safeConcurrency({ freeBytes: freemem(), cores: cpus().length, ...size }));
  const offthreadVideoCacheSizeInBytes = frameCacheBytes({ tabs: concurrency, ...size });
  // Decision 0001: CapCut keeps the alpha of MOV ProRes 4444 (and ignores it in WebM).
  const output = opts.transparent
    ? ({ codec: "prores", proResProfile: "4444", pixelFormat: "yuva444p10le", imageFormat: "png", muted: true } as const)
    : // BT.709 limited range, like the takes: Remotion's default (full-range BT.601) shifts brightness in CapCut.
      ({ codec: "h264", colorSpace: "bt709" } as const);
  // scale renders the 1080 x 1920 layout at n times its pixels (4K with 2); the takes come from edit@<n>x.mp4.
  const attempts = renderAttempts(Boolean(opts.transparent));
  for (const [i, attempt] of attempts.entries()) {
    const last = i === attempts.length - 1;
    // A render shows where it is, and a stuck one ends with a reason: it never just stays silent.
    const report = progressReporter();
    const { cancelSignal, cancel } = makeCancelSignal();
    let stuck = false;
    const guard = stallGuard(() => { stuck = true; cancel(); });
    try {
      await renderMedia({
        browserExecutable: process.env.ADAM_BROWSER_EXECUTABLE, composition, serveUrl, outputLocation: outFile, inputProps: props, frameRange, concurrency, offthreadVideoCacheSizeInBytes, scale: opts.scale ?? 1, cancelSignal, ...output,
        ...(attempt.gl ? { chromiumOptions: { gl: attempt.gl } } : {}), ...(opts.transparent ? {} : { x264Preset: "veryfast" as const }),
        onProgress: ({ progress }) => { guard.ping(progress); const line = report(progress); if (line) console.log(line); },
      });
      return;
    } catch (error) {
      if (last) {
        if (stuck) throw new Error(`the render stopped moving for ${STALL_MS / 60000} minutes: close other heavy programs, then export again`);
        throw error;
      }
      console.log(`note: the render did not hold on the ${attempt.label} (${stuck ? "it stopped moving" : (error as Error).message.split("\n")[0]}): starting again on the ${attempts[i + 1]!.label}`);
    } finally { guard.stop(); }
  }
}

export async function renderFrame(serveUrl: string, props: RenderProps, frame: number, outFile: string): Promise<void> {
  const composition = await selectComposition({ browserExecutable: process.env.ADAM_BROWSER_EXECUTABLE, serveUrl, id: COMPOSITION_ID, inputProps: props });
  await renderStill({ browserExecutable: process.env.ADAM_BROWSER_EXECUTABLE, composition, serveUrl, output: outFile, frame, inputProps: props, imageFormat: "png" });
}
