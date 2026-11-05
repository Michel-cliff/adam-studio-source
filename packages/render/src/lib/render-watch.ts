// What a long render tells the creator: where it is, and when it has really stopped moving.
export const STALL_MS = 10 * 60 * 1000;
/** Measured on a 12-thread laptop over 600 frames at 1080 x 1920: 198 ms a frame with 2 tabs, 180 with 3, 181 with 4, and 297 with 8 once memory runs out. */
export const MAX_TABS = 3;

/**
 * The frame cache of a render. Left to itself it takes half the free memory: the same speed with 1 GB (181 ms a frame
 * against 189), and 1.2 GB left free instead of 0.5 on a computer doing other things. It must still hold one second of
 * decoded frames per video per tab, or the render fails with "No frame found".
 */
export function frameCacheBytes(o: { tabs: number; width: number; height: number; fps: number; videoSources: number }): number {
  return Math.max(2 ** 30, Math.ceil(o.tabs * Math.max(1, o.videoSources) * o.fps * o.width * o.height * 4 * 1.1));
}

/**
 * The ways to try a render, best first. The graphics card takes a third off the time (270 to 180 ms a frame over a long
 * stretch) for the same picture (46 dB PSNR, SSIM .99 against the processor), but a driver or a computer without a card can
 * fail: the processor is always there behind it. A transparent layer stays on the processor: CapCut reads its alpha, which was checked that way.
 */
export function renderAttempts(transparent: boolean, env: Record<string, string | undefined> = process.env): { gl: "angle" | null; label: string }[] {
  const processor = { gl: null, label: "processor" };
  return transparent || env.ADAM_RENDER_GL === "off" ? [processor] : [{ gl: "angle", label: "graphics card" }, processor];
}

/** One line per 5 % step of the render, with the time left once it can be estimated; null between steps. */
export function progressReporter(now: () => number = Date.now): (progress: number) => string | null {
  const start = now();
  let shown = -1;
  return (progress) => {
    const step = Math.floor(progress * 20) * 5;
    if (step <= shown) return null;
    shown = step;
    if (step === 0 || step >= 100) return `rendering: ${step} %`;
    const left = Math.round(((now() - start) / progress) * (1 - progress) / 60000);
    return `rendering: ${step} %, about ${Math.max(1, left)} min left`;
  };
}

/** Calls onStall when no progress came for that long; ping() on every progress, stop() at the end. */
export function stallGuard(onStall: () => void, ms = STALL_MS, every = 15000, now: () => number = Date.now) {
  let last = now(), value = -1;
  const timer = setInterval(() => { if (now() - last >= ms) { clearInterval(timer); onStall(); } }, every);
  timer.unref?.();
  return {
    ping(progress: number) { if (progress !== value) { value = progress; last = now(); } },
    stop() { clearInterval(timer); },
  };
}
