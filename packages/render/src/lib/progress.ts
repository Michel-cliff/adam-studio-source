import type { Style } from "@adam-studio/model";

type Progress = NonNullable<Style["progress"]>;

/**
 * The filled part of the progress bar at a frame, in px of a frame `width` wide: whole blocks only (the bar steps
 * like pixel art, a block lights up once the edit has passed its end), or a continuous fill when block is 0.
 * The last frame fills the bar.
 */
export function progressFill(frame: number, durationFrames: number, width: number, p: Pick<Progress, "block" | "gap">): { x: number; w: number }[] {
  const k = width / 1080;
  const share = durationFrames <= 1 ? 1 : Math.min(1, Math.max(0, frame / (durationFrames - 1)));
  if (p.block <= 0) return share > 0 ? [{ x: 0, w: width * share }] : [];
  const block = p.block * k, gap = Math.min(p.gap * k, block / 2);
  const total = Math.ceil(width / block);
  const lit = share >= 1 ? total : Math.floor((width * share) / block);
  const out: { x: number; w: number }[] = [];
  for (let i = 0; i < lit; i++) {
    const x = i * block;
    out.push({ x, w: Math.min(block - gap, width - x) });
  }
  return out;
}
