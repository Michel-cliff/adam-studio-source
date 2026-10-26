import type { CameraWindowProps, CameraZoomProps, Timeline } from "@adam-studio/model";

export type Camera = { transform?: string; origin?: string; filter?: string; flash: number };

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// Slope of `smooth`, scaled to 1 at its steepest (6t(1-t) peaks at 1.5).
const slope = (t: number) => (t <= 0 || t >= 1 ? 0 : (6 * t * (1 - t)) / 1.5);

/**
 * Moves of the main track at an absolute frame: punch-in zooms (camera.zoom elements, blurred on the move when the
 * style's fx.zoomBlur is set) and the whip and zoom transitions, plus the white of flash transitions. Effect durations
 * stretch when the style's motion speed is below 1.
 */
export function cameraAt(timeline: Timeline, frame: number): Camera {
  const { fps, width } = timeline;
  const speed = timeline.style.motion?.speed ?? 1;
  const zoomBlur = (timeline.style.fx?.zoomBlur ?? 0) * (width / 1080);
  let scale = 1;
  let origin: string | undefined;
  let shift = 0;
  let blur = 0;
  let flash = 0;
  for (const e of timeline.elements) {
    if (e.kind !== "camera.zoom" || frame < e.fromFrame || frame >= e.fromFrame + e.durationFrames) continue;
    const p = e.props as CameraZoomProps;
    const ease = Math.max(1, ((p.easeMs ?? 300) / speed / 1000) * fps);
    const m = Math.min((frame - e.fromFrame) / ease, (e.fromFrame + e.durationFrames - frame) / ease);
    const s = 1 + ((p.scale ?? 1.3) - 1) * smooth(m);
    if (s > scale) { scale = s; origin = `${(p.x ?? 0.5) * 100}% ${(p.y ?? 0.4) * 100}%`; }
    if (zoomBlur > 0) blur = Math.max(blur, zoomBlur * slope(m));
  }
  for (const c of timeline.clips) {
    const t = c.transitionOut;
    if (t.kind !== "flash" && t.kind !== "whip" && t.kind !== "zoom") continue;
    const cut = c.fromFrame + c.durationFrames;
    const half = Math.max(1, ((t.durationMs / 2 / speed) * fps) / 1000);
    const u = (frame - cut) / half; // -1 .. 1 around the cut
    if (u < -1 || u > 1) continue;
    const near = 1 - Math.abs(u);
    if (t.kind === "flash") flash = Math.max(flash, near ** 1.5);
    if (t.kind === "whip") { shift = (u < 0 ? -(1 + u) : 1 - u) * width * 0.18; blur = Math.max(blur, near * 28); }
    if (t.kind === "zoom") { const s = 1 + 0.4 * near * near; if (s > scale) { scale = s; origin = "50% 45%"; } }
  }
  const parts = [shift ? `translateX(${shift.toFixed(1)}px)` : "", scale !== 1 ? `scale(${scale.toFixed(4)})` : ""].filter(Boolean);
  return { transform: parts.join(" ") || undefined, origin, filter: blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : undefined, flash };
}

/** The 4:3 window at a frame: how far it has moved (0 full frame, 1 landed), its box on screen and the main track's move. */
export type WindowState = {
  amount: number; color: string; barColor: string;
  /** Transform of the main track, with transform-origin 0 0, and its clip in its own coordinates. */
  transform: string; clip: string;
  box: { left: number; top: number; width: number; height: number };
};

/** Frames a camera.window's move takes, at the style's motion speed. */
export function windowEaseFrames(timeline: Timeline, easeMs: number): number {
  const speed = timeline.style.motion?.speed ?? 1;
  return Math.max(1, (easeMs / speed / 1000) * timeline.fps);
}

/**
 * The window move of camera.window elements: the main track shrinks to a 4:3 box (the part of the take around
 * focusY), with a slight acceleration at the end of the course, on the way in and on the way back.
 */
export function windowAt(timeline: Timeline, frame: number): WindowState | null {
  const { width: W, height: H } = timeline;
  for (const e of timeline.elements) {
    if (e.kind !== "camera.window" || frame < e.fromFrame || frame >= e.fromFrame + e.durationFrames) continue;
    const p = e.props as CameraWindowProps;
    const ease = windowEaseFrames(timeline, p.easeMs ?? 300);
    const progress = Math.max(0, Math.min(1, (frame - e.fromFrame) / ease, (e.fromFrame + e.durationFrames - frame) / ease));
    const a = progress * progress;
    if (a <= 0) return null;
    const target = p.width ?? 0.8;
    const srcH = Math.min(H, (W * 3) / 4);
    const fy = Math.min(H - srcH / 2, Math.max(srcH / 2, (p.focusY ?? 0.4) * H));
    const cy = Math.min(H, Math.max(0, (p.y ?? 0.42) * H));
    const scale = 1 - (1 - target) * a;
    const tx = (W / 2) * (1 - scale);
    const ty = fy + (cy - fy) * a - scale * fy;
    const clipTop = (fy - srcH / 2) * a;
    const clipBottom = (H - fy - srcH / 2) * a;
    const r = (n: number) => Math.round(n * 100) / 100;
    return {
      amount: a, color: p.color ?? "#F3BA20", barColor: p.barColor ?? "#2B6FD4",
      transform: `translate(${r(tx)}px, ${r(ty)}px) scale(${scale.toFixed(4)})`,
      clip: `inset(${r(clipTop)}px 0px ${r(clipBottom)}px 0px)`,
      box: { left: tx, top: ty + scale * clipTop, width: scale * W, height: scale * (H - clipTop - clipBottom) },
    };
  }
  return null;
}

/** Frame ranges the camera changes, for the CapCut bake (the main track is rendered there). */
export function cameraWindows(timeline: Timeline): [number, number][] {
  const speed = timeline.style.motion?.speed ?? 1;
  const out: [number, number][] = timeline.elements
    .filter((e) => e.kind === "camera.zoom" || e.kind === "camera.window")
    .map((e) => [e.fromFrame, e.fromFrame + e.durationFrames]);
  for (const c of timeline.clips) {
    const t = c.transitionOut;
    if (t.kind !== "flash" && t.kind !== "whip" && t.kind !== "zoom") continue;
    const cut = c.fromFrame + c.durationFrames;
    const half = Math.ceil(((t.durationMs / 2 / speed) * timeline.fps) / 1000);
    out.push([Math.max(0, cut - half), Math.min(timeline.durationFrames, cut + half)]);
  }
  return out;
}
