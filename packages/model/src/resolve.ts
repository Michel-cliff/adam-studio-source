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
    zoom: l.clip.zoom,
    transitionOut: l.clip.transitionOut,
    volume: l.clip.volume,
  }];
  });
  const { elements, sfx } = resolveElements(ctx);
  const captions = resolveCaptions(ctx);
  const beats = resolveBeats(ctx);
  return {
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
  };
}
