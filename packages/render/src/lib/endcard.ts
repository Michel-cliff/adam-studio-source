import type { EndcardDesktopProps } from "@adam-studio/model";

/** A pixel-art folder, 16 x 12: X outline, Y the colour, H the colour lightened. */
export const FOLDER = [
  ".XXXXX..........",
  "XHHHHHX.........",
  "XHYYYYHXXXXXXXX.",
  "XYYYYYYYYYYYYYYX",
  "XHHHHHHHHHHHHHHX",
  "XYYYYYYYYYYYYYYX",
  "XYYYYYYYYYYYYYYX",
  "XYYYYYYYYYYYYYYX",
  "XYYYYYYYYYYYYYYX",
  "XYYYYYYYYYYYYYYX",
  "XYYYYYYYYYYYYYYX",
  "XXXXXXXXXXXXXXXX",
];

/** The classic arrow cursor, 11 x 17: X outline, W white. Its tip is the top-left pixel. */
export const ARROW = [
  "X..........",
  "XX.........",
  "XWX........",
  "XWWX.......",
  "XWWWX......",
  "XWWWWX.....",
  "XWWWWWX....",
  "XWWWWWWX...",
  "XWWWWWWWX..",
  "XWWWWWWWWX.",
  "XWWWWWXXXXX",
  "XWWXWWX....",
  "XWX.XWWX...",
  "XX..XWWX...",
  "X....XWWX..",
  ".....XWWX..",
  "......XX...",
];

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Where each icon sits on a 1080-wide frame: 96 px folders down the left, 90 px from the edge. */
export function iconBoxes(count: number, k: number): { x: number; y: number; size: number }[] {
  const size = 96 * k, step = 190 * k, top = 300 * k;
  return Array.from({ length: count }, (_, i) => ({ x: 90 * k, y: top + i * step, size }));
}

/** The episode the cursor opens: `next`, or the one after `current`, kept inside the list. */
export function targetOf(p: Pick<EndcardDesktopProps, "items" | "current" | "next">): number {
  return Math.min(p.items.length - 1, Math.max(0, p.next ?? p.current + 1));
}

/**
 * The cursor over the card at a share `t` of its time: it waits (first 15 %), crosses from the lower right to the
 * target (to 65 %), then double-clicks (presses around 70 % and 80 %); the target is selected from the first click.
 */
export function cursorAt(t: number, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number; pressed: boolean; selected: boolean } {
  const move = easeInOut(Math.min(1, Math.max(0, (t - 0.15) / 0.5)));
  const pressed = (t >= 0.7 && t < 0.74) || (t >= 0.8 && t < 0.84);
  return { x: from.x + (to.x - from.x) * move, y: from.y + (to.y - from.y) * move, pressed, selected: t >= 0.7 };
}
