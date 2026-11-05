// The atoms that loop around an important passage (text.stack): each one goes round the text block in
// 3.6 s, the others spread evenly on it, and spins on itself; each appearance starts at its own angle.

const LOOP_MS = 3600, SPIN_DEG_PER_S = 160;

/** Where atom k of n is at ms, and how far it has turned (degrees). */
export function atomOrbit(ms: number, k: number, n: number, start: number, box: { cx: number; cy: number; rx: number; ry: number }): { x: number; y: number; spin: number } {
  const a = start + (2 * Math.PI * ms) / LOOP_MS + (2 * Math.PI * k) / n;
  // A superellipse, not an ellipse: it goes round the corners of the block instead of cutting across them.
  const sq = (v: number) => Math.sign(v) * Math.sqrt(Math.abs(v));
  return { x: box.cx + box.rx * sq(Math.cos(a)), y: box.cy + box.ry * sq(Math.sin(a)), spin: (ms / 1000) * SPIN_DEG_PER_S * (k % 2 ? -1 : 1) };
}

/** A stable starting angle from the element's id: two passages never start their atoms at the same place. */
export function seedAngle(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 3600) / 3600 * 2 * Math.PI;
}

/**
 * The atom as pixels, after a hand-drawn one: three long orbits tilted at 60 degrees from each other, each one breathing
 * flatter and rounder as if it turned in depth; the half in front drawn thick (2 cells), the half behind dotted; an
 * electron of 2 x 2 cells running on each, a four-pointed star of a nucleus. Whole cells of a grid x grid square, drawn
 * upscaled with hard edges: the pixels jump as it turns, like a low-resolution screen.
 */
export function atomPixels(ms: number, grid: number): [number, number][] {
  const c = Math.floor(grid / 2), R = grid * 0.47, seen = new Set<string>(), out: [number, number][] = [];
  const put = (x: number, y: number) => {
    const px = Math.round(x), py = Math.round(y), k = `${px},${py}`;
    if (px < 0 || py < 0 || px >= grid || py >= grid || seen.has(k)) return;
    seen.add(k); out.push([px, py]);
  };
  const samples = grid * 8;
  for (let i = 0; i < 3; i++) {
    const rot = ((25 + i * 60) * Math.PI) / 180;
    const phase = (2 * Math.PI * ms) / 2400 + i * 2.1;
    const flat = 0.26 + 0.12 * Math.sin(phase);
    const at = (u: number) => {
      const x = R * Math.cos(u), y = R * flat * Math.sin(u);
      return [c + x * Math.cos(rot) - y * Math.sin(rot), c + x * Math.sin(rot) + y * Math.cos(rot)] as const;
    };
    for (let s = 0; s < samples; s++) {
      const u = (2 * Math.PI * s) / samples;
      const front = Math.sin(u + phase) > 0;
      if (!front && s % 6 > 1) continue; // behind: dotted
      const [x, y] = at(u);
      put(x, y);
      if (front) { put(x + 1, y); put(x, y + 1); } // in front: thick
    }
    const [ex, ey] = at((ms / 1000) * 4 + i * 2.1);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) put(ex + dx!, ey + dy!);
  }
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0], [0, 3], [0, -3]]) put(c + dx!, c + dy!);
  return out;
}
