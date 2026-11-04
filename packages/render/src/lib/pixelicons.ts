// Pixel icons of the house look (12 x 12 cells: X ink, o fill) and what the board dress of the 4:3 window draws
// from an element's id: its frame, its icons. Drawn from the id, so a video keeps its draw at every render.
import { seedAngle } from "./atom";

export const ICONS: Record<string, string[]> = {
  cursor: ["X...........", "XX..........", "XoX.........", "XooX........", "XoooX.......", "XooooX......", "XoooooX.....", "XooooooX....", "XooXXXXXX...", "XoX.........", "XX..........", "X..........."],
  folder: ["............", ".XXXX.......", ".XooX.......", ".XXXXXXXXXX.", ".XooooooooX.", ".XooooooooX.", ".XooooooooX.", ".XooooooooX.", ".XooooooooX.", ".XXXXXXXXXX.", "............", "............"],
  warning: [".....XX.....", "....XooX....", "....XooX....", "...XoXXoX...", "...XoXXoX...", "..XooXXooX..", "..XooXXooX..", ".XooooooooX.", ".XoooXXoooX.", "XooooXXooooX", "XooooooooooX", "XXXXXXXXXXXX"],
  search: ["..XXXX......", ".XooooX.....", "XooooooX....", "XooooooX....", "XooooooX....", "XooooooX....", ".XooooX.....", "..XXXXXX....", "......XXX...", ".......XXX..", "........XXX.", ".........XX."],
  bulb: ["...XXXXXX...", "..XooooooX..", ".XooooooooX.", ".XooooooooX.", ".XooooooooX.", ".XooooooooX.", "..XooooooX..", "...XooooX...", "...XXXXXX...", "...X....X...", "...XXXXXX...", "....XXXX...."],
  chat: [".XXXXXXXXXX.", "XooooooooooX", "XooooooooooX", "XoXXoXXoXXoX", "XooooooooooX", "XooooooooooX", ".XXXXXXXXXX.", "..XoX.......", "..XX........", "..X.........", "............", "............"],
  check: ["XXXXXXXXXXXX", "XooooooooooX", "XoooooooooXX", "XooooooooXXX", "XoXoooooXXoX", "XoXXoooXXooX", "XooXXoXXoooX", "XoooXXXooooX", "XooooXoooooX", "XooooooooooX", "XooooooooooX", "XXXXXXXXXXXX"],
  briefcase: ["....XXXX....", "...X....X...", "XXXXXXXXXXXX", "XooooooooooX", "XooooooooooX", "XXXXXooXXXXX", "XooooXXooooX", "XooooooooooX", "XooooooooooX", "XooooooooooX", "XXXXXXXXXXXX", "............"],
  cap: [".....XX.....", "...XXooXX...", ".XXooooooXX.", "XooooooooooX", ".XXooooooXX.", "...XXooXX..X", "..XXXXXXXX.X", "..XooooooX.X", "..XooooooX.X", "...XXXXXX.XX", "...........X", "............"],
  hourglass: ["XXXXXXXXXXXX", ".XooooooooX.", "..XooooooX..", "...XooooX...", "....XooX....", ".....XX.....", ".....XX.....", "....X..X....", "...X.XX.X...", "..X.XXXX.X..", ".XXXXXXXXXX.", "XXXXXXXXXXXX"],
  heart: ["............", ".XXX....XXX.", "XoooX..XoooX", "XooooXXooooX", "XooooooooooX", "XooooooooooX", ".XooooooooX.", "..XooooooX..", "...XooooX...", "....XooX....", ".....XX.....", "............"],
  sparkle: [".....XX.....", ".....XX.....", "....XooX....", "....XooX....", "XXXXooooXXXX", ".XXooooooXX.", ".XXooooooXX.", "XXXXooooXXXX", "....XooX....", "....XooX....", ".....XX.....", ".....XX....."],
};

/** The board's frames round the take (the viewfinder was left out). */
export const BOARD_FRAMES = ["sticker", "fig", "notch", "loading", "folder"] as const;
export type BoardFrame = (typeof BOARD_FRAMES)[number];

const draw = (id: string, salt: string) => seedAngle(`${salt}:${id}`) / (2 * Math.PI);

/** The frame of a board: the one asked for, or one drawn from the element's id. */
export function boardFrame(id: string, asked?: BoardFrame): BoardFrame {
  return asked ?? BOARD_FRAMES[Math.floor(draw(id, "frame") * BOARD_FRAMES.length)]!;
}

/** n different icons drawn from the element's id. */
export function pickIcons(id: string, n: number): string[] {
  const names = Object.keys(ICONS).sort((a, b) => draw(id, a) - draw(id, b));
  return names.slice(0, n);
}

/** An icon as SVG path data, one path per colour. */
export function iconPaths(name: string): { ink: string; fill: string } {
  const rows = ICONS[name] ?? [];
  const d = (ch: string) => rows.flatMap((row, y) => [...row].map((c, x) => (c === ch ? `M${x} ${y}h1v1h-1z` : ""))).join("");
  return { ink: d("X"), fill: d("o") };
}
