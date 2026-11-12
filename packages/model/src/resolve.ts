import { placeTextInThirds } from "./text-placement";
import { canvasSize } from "./time";
import type { Project } from "./schema/project";
import type { Style } from "./schema/style";
import type { Timeline } from "./schema/timeline";
import { resolveBeats, resolveCaptions } from "./captions";
import { createContext, mergeStyle } from "./context";
import { resolveClipAudio, resolveElements } from "./elements";
import { ResolveError } from "./context";
import { withVariant } from "./workflow";
import type { VariantKey } from "./schema/project";

export { ResolveError };

export interface ResolveOptions {
  /** Applies one variant virtually, for previews (in place of the chosen one when the proposal is decided). */
  apply?: { proposal: string; variant: VariantKey };
}

/** The edit's speech: each kept word where it lands, merged when they touch. */
function speechSpans(ctx: ReturnType<typeof createContext>): [number, number][] {
  const spans = [...ctx.words.keys()].flatMap((id) => { const w = ctx.wordOut(id); return w && w.endMs > w.startMs ? [[w.startMs, w.endMs] as [number, number]] : []; })
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}

// The default push (default art direction): a face-camera shot whose zoom nobody set moves slowly, 1.2 % a second,
// one shot in and the next back out (the same way three shots running reads as an effect), at most 8 % in a shot, so
// the scale never passes 1.08. The eye does not see it move, but it does not drop off.
const PUSH_PER_SEC = 0.012, PUSH_MAX = 0.08;
function defaultPush(zoom: { base: number; driftPerSec: number }, index: number, durationMs: number, rate: number) {
  if (zoom.base !== 1 || zoom.driftPerSec !== 0 || durationMs <= 0 || rate <= 0) return zoom;
  const total = Math.min(PUSH_MAX, rate * (durationMs / 1000));
  const drift = total / (durationMs / 1000);
  return index % 2 === 0 ? { base: 1, driftPerSec: drift } : { base: 1 + total, driftPerSec: -drift };
}

export function resolve(projectIn: Project, styleIn: Style, options: ResolveOptions = {}): Timeline {
  let project = projectIn;
  if (options.apply) {
    const { proposal, variant } = options.apply;
    try { project = withVariant(project, proposal, variant); } catch (e) { throw new ResolveError((e as Error).message); }
  }
  const style = mergeStyle(styleIn, project.styleOverrides);
  const ctx = createContext(project, style);
  const { width, height } = canvasSize(project.canvas.format);
  const clips = ctx.clips.flatMap((l) => {
    if (ctx.frame(l.outEndMs) - ctx.frame(l.outStartMs) < 1) {
      ctx.warnings.push(`clip "${l.clip.id}" is shorter than one frame and was dropped`);
      return [];
    }
    return [{
    id: l.clip.id,
    asset: l.clip.asset,
    fromFrame: ctx.frame(l.outStartMs),
    durationFrames: ctx.frame(l.outEndMs) - ctx.frame(l.outStartMs),
    sourceInMs: l.clip.inMs,
    sourceOutMs: l.clip.outMs,
    framing: l.clip.framing,
    zoom: project.format === "facecam" ? defaultPush(l.clip.zoom, ctx.clips.indexOf(l), l.outEndMs - l.outStartMs, style.motion.push ?? PUSH_PER_SEC) : l.clip.zoom,
    transitionOut: l.clip.transitionOut,
    volume: l.clip.volume,
  }];
  });
  const { elements, sfx } = resolveElements(ctx);
  // The style's opening: an element over the first frames of every edit (and a CapCut overlay like the others).
  const opening = style.opening;
  if (opening) {
    const lastFrame = ctx.frame(ctx.totalMs);
    const durationFrames = Math.min(lastFrame, ctx.frame(opening.openMs) + opening.scanlineFrames + 1);
    if (durationFrames > 0) elements.unshift({ id: "style.opening", kind: "open.crt", layer: "front", fromFrame: 0, durationFrames, trimStartMs: 0, x: 0.5, y: 0.5, props: opening });
  }
  // An important passage says the words itself: the subtitles under it step aside (a caption whose middle falls in it).
  const stacks = elements.filter((e) => e.kind === "text.stack").map((e) => [e.fromFrame, e.fromFrame + e.durationFrames] as const);
  const captions = resolveCaptions(ctx).filter((c) => !stacks.some(([a, b]) => c.fromFrame + c.durationFrames / 2 >= a && c.fromFrame + c.durationFrames / 2 < b));
  const beats = resolveBeats(ctx);
  return placeTextInThirds({
    format: project.canvas.format,
    width,
    height,
    fps: ctx.fps,
    durationFrames: ctx.frame(ctx.totalMs),
    clips,
    elements,
    captions,
    beats,
    audio: [...resolveClipAudio(ctx), ...sfx],
    speech: speechSpans(ctx),
    orphans: ctx.orphans,
    warnings: ctx.warnings,
    style,
  });
}
