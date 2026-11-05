import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { cpus, freemem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, makeCancelSignal } from "@remotion/renderer";
import { activeVideoSources, safeConcurrency } from "./lib/concurrency";
import { MAX_TABS, progressReporter, renderAttempts, STALL_MS, stallGuard } from "./lib/render-watch";
import { prepareMedia, type MediaPlan } from "./media";
import { COMPOSITION_ID, type RenderProps } from "./props";

export const ENTRY = join(dirname(fileURLToPath(import.meta.url)), "index.ts");

const OLD_BUNDLE_MS = 6 * 60 * 60 * 1000;

/**
 * Bundles into its own folder under `outDir`, and hard-links the planned media into its public folder. That folder
 * does not exist while bundling, so Remotion copies nothing. Each run has its own: a still asked while the video
 * renders must not pull the files from under it. The folder goes when the process ends; what a killed process left goes
 * at a later run.
 */
export async function bundleWithMedia(plan: MediaPlan, outDir: string): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) {
    const old = join(outDir, name);
    try { if (Date.now() - statSync(old).mtimeMs > OLD_BUNDLE_MS) rmSync(old, { recursive: true, force: true }); } catch { /* another run is on it */ }
  }
  const runDir = join(outDir, `${process.pid}-${Date.now()}`);
  process.once("exit", () => { try { rmSync(runDir, { recursive: true, force: true }); } catch { /* removed at a later run */ } });
  const publicDir = join(runDir, "public");
  const serveUrl = await bundle({ entryPoint: ENTRY, outDir: runDir, publicDir });
  prepareMedia(plan, publicDir);
  return serveUrl;
}

export async function renderVideo(
  serveUrl: string,
  props: RenderProps,
  outFile: string,
  frameRange: number | [number, number] | [number, number][] | null = null,
  opts: { transparent?: boolean; scale?: number } = {},
): Promise<void> {
  const composition = await selectComposition({ browserExecutable: process.env.ADAM_BROWSER_EXECUTABLE, serveUrl, id: COMPOSITION_ID, inputProps: props });
  const concurrency = Math.min(MAX_TABS, safeConcurrency({
    freeBytes: freemem(), cores: cpus().length, fps: composition.fps,
    width: composition.width * (opts.scale ?? 1), height: composition.height * (opts.scale ?? 1),
    videoSources: activeVideoSources(props.timeline),
  }));
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
        browserExecutable: process.env.ADAM_BROWSER_EXECUTABLE, composition, serveUrl, outputLocation: outFile, inputProps: props, frameRange, concurrency, scale: opts.scale ?? 1, cancelSignal, ...output,
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
