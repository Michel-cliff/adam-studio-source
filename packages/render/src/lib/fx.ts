import type { CameraZoomProps, ImageProps, Timeline } from "@adam-studio/model";
import { windowAt, windowEaseFrames } from "./camera";
import { presetMs } from "./presets";

/**
 * CRT scanlines at a frame: the window level while a 4:3 window is on screen, and a burst for a few frames when a
 * zoom lands, a window lands or an inserted window opens (an image element with intro "window"). 0 on a plain shot.
 */
export function scanlinesAt(timeline: Timeline, frame: number): number {
  const s = timeline.style.fx?.scanlines;
  if (!s || (s.window <= 0 && s.burst <= 0)) return 0;
  const speed = timeline.style.motion?.speed ?? 1;
  const msToFrames = (ms: number) => (ms / speed / 1000) * timeline.fps;
  const landings: number[] = [];
  for (const e of timeline.elements) {
    if (e.kind === "camera.zoom") landings.push(e.fromFrame + Math.ceil(msToFrames((e.props as CameraZoomProps).easeMs ?? 300)));
    else if (e.kind === "camera.window") landings.push(e.fromFrame + Math.ceil(windowEaseFrames(timeline, (e.props as { easeMs?: number }).easeMs ?? 300)));
    else if (e.kind === "image" && (e.props as ImageProps).intro === "window") landings.push(e.fromFrame + Math.ceil(msToFrames(presetMs("window"))));
  }
  const burst = s.burst > 0 && landings.some((l) => frame >= l && frame < l + s.burstFrames);
  const inWindow = s.window > 0 && windowAt(timeline, frame) !== null;
  return Math.max(burst ? s.burst : 0, inWindow ? s.window : 0);
}

/** Relative luminance of a #RRGGBB colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
