// What a long render tells the creator: where it is, and when it has really stopped moving.
export const STALL_MS = 10 * 60 * 1000;

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
