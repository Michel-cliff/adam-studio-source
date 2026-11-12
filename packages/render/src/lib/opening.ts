import type { OpenCrtProps } from "@adam-studio/model";

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The CRT opening at a frame (local to the element): how wide the line is (share of the width), how far the frame
 * has opened (share of the height, 0 shut, 1 open) and the scanline level. The line stretches over the first 45 %,
 * the frame opens over the rest; once open, the scanlines hold `scanlines` for `scanlineFrames` frames.
 */
export function openingAt(frame: number, fps: number, p: Pick<OpenCrtProps, "openMs" | "scanlines" | "scanlineFrames">): { line: number; open: number; scanlines: number } {
  const openFrames = Math.max(1, Math.round((p.openMs * fps) / 1000));
  const t = Math.min(1, frame / openFrames);
  const line = t >= 0.45 ? 1 : easeInOut(t / 0.45);
  const open = t <= 0.45 ? 0 : easeInOut((t - 0.45) / 0.55);
  const after = frame - openFrames;
  return { line, open, scanlines: after >= 0 && after < p.scanlineFrames ? p.scanlines : 0 };
}
