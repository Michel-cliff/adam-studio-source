// The edge blur of the default art direction: the push alone reads as a change of scale; a slight blur at the edges,
// coupled with it, makes it read as moving through the picture. One layer over the decoded video (backdrop-filter):
// the video is not decoded twice. Under every text: a text is never blurred.

const REST = 1.2, PEAK = 2.2, PUSH_FULL = 0.012, GROW = 1.35, FEATHER = 180, CLOSE_UP = 0.55;

/** The blur of a shot (radius in px, CSS mask), or null: no face found, or a close-up with no edge to soften. */
export function edgeBlur(face: readonly [number, number, number, number] | undefined, width: number, height: number, driftPerSec: number): { radius: number; mask: string } | null {
  if (!face || face[3] > CLOSE_UP) return null;
  const k = width / 1080;
  const [x, y, w, h] = face;
  const radius = (REST + Math.min(1, Math.abs(driftPerSec) / PUSH_FULL) * (PEAK - REST)) * k;
  const cx = Math.round((x + w / 2) * width), cy = Math.round((y + h / 2) * height);
  const rx = Math.round((w * width * GROW) / 2), ry = Math.round((h * height * GROW) / 2);
  return { radius, mask: `radial-gradient(ellipse ${rx}px ${ry}px at ${cx}px ${cy}px, transparent 100%, black calc(100% + ${Math.round(FEATHER * k)}px))` };
}
