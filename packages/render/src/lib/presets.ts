import { clamp01, easeOutCubic, editorialEntrance } from "./text";

/** `pixel`: the picture's block size in px at 1080 wide (0 or absent: sharp), drawn by the element's mosaic filter. */
export type PresetStyle = { opacity?: number; transform?: string; filter?: string; pixel?: number };

const round = (n: number) => Math.round(n * 1000) / 1000;

// pixel: the picture appears in big blocks that resolve to full resolution over six frames, growing from 0.96.
const PIXEL_MS = 250;
const PIXEL_BLOCKS = [24, 24, 16, 8, 4, 2];
// step: a stop-motion pop for pixel icons, four frames at 12 fps, no smoothing.
const STEP_MS = 1000 / 12;
const STEP_SCALES = [0, 0.6, 1.1, 1];
// popOut: an icon springing out of nothing, past its size (back easing), settled at 1 after 400 ms.
const POPOUT_MS = 400;
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
// window: opens wide first (40 % of the time), then tall, like a window drawn on screen.
const WINDOW_MS = 250;

/** Style of an entrance (or exit, with msFromEdge counted from the end) preset at msFromEdge. */
export function presetStyle(name: string | undefined, msFromEdge: number, frame: number, stable = false): PresetStyle {
  if (name === "softZoom" || (stable && ["glitch", "step", "pixel", "popOut"].includes(name ?? ""))) {
    const e = editorialEntrance(msFromEdge);
    return { opacity: e.opacity, transform: `scale(${round(e.scale)})`, filter: e.blur > 0.05 ? `blur(${round(e.blur)}px)` : undefined };
  }
  switch (name) {
    case "fade":
      return { opacity: clamp01(msFromEdge / 250) };
    case "pop":
      return { opacity: clamp01(msFromEdge / 120), transform: `scale(${0.9 + 0.1 * easeOutCubic(msFromEdge / 200)})` };
    case "glitch": {
      if (msFromEdge >= 200) return {};
      const g = 1 - msFromEdge / 200;
      const shift = Math.round(6 * g);
      const jitter = ((frame * 37) % 11) - 5;
      return {
        opacity: frame % 2 === 0 && g > 0.5 ? 0.6 : 1,
        transform: `translateX(${Math.round(jitter * g)}px)`,
        filter: `drop-shadow(${-shift}px 0 rgba(255,0,60,0.8)) drop-shadow(${shift}px 0 rgba(0,220,255,0.8))`,
      };
    }
    case "pixel": {
      if (msFromEdge >= PIXEL_MS) return {};
      const step = Math.min(PIXEL_BLOCKS.length - 1, Math.max(0, Math.floor(msFromEdge / (PIXEL_MS / PIXEL_BLOCKS.length))));
      return { pixel: PIXEL_BLOCKS[step], transform: `scale(${round(0.96 + 0.04 * easeOutCubic(msFromEdge / PIXEL_MS))})` };
    }
    case "step": {
      if (msFromEdge >= STEP_MS * STEP_SCALES.length) return {};
      const i = Math.max(0, Math.floor(msFromEdge / STEP_MS));
      return i === 0 ? { opacity: 0, transform: "scale(0)" } : { transform: `scale(${STEP_SCALES[i]})` };
    }
    case "popOut": {
      if (msFromEdge >= POPOUT_MS) return {};
      const t = clamp01(msFromEdge / POPOUT_MS);
      return { opacity: clamp01(msFromEdge / 80), transform: `scale(${round(Math.max(0, easeOutBack(t)))})` };
    }
    case "window": {
      if (msFromEdge >= WINDOW_MS) return {};
      const t = clamp01(msFromEdge / WINDOW_MS);
      const wide = t < 0.4;
      const sx = wide ? 0.2 + 0.8 * (t / 0.4) : 1;
      const sy = wide ? 0.04 : 0.04 + 0.96 * easeOutCubic((t - 0.4) / 0.6);
      return { transform: `scaleX(${round(sx)}) scaleY(${round(sy)})` };
    }
    default:
      return {};
  }
}

/** How long an entrance preset runs, in ms (0 when it has no fixed length). */
export function presetMs(name: string | undefined): number {
  switch (name) {
    case "pixel": return PIXEL_MS;
    case "step": return STEP_MS * STEP_SCALES.length;
    case "window": return WINDOW_MS;
    case "popOut": return POPOUT_MS;
    default: return 0;
  }
}
