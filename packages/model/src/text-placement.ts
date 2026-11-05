import type { Timeline } from "./schema/timeline";

export const THIRD_BANDS = { titleTop: 0.055, titleBottom: 0.30, captionTop: 0.70, captionBottom: 0.85 };
export function usesThirds(tl: Timeline): boolean {
  return tl.format === "9:16" && (tl.style.textLayout === "thirds" || (tl.style.name === "Default" && tl.style.textLayout !== "free"));
}

/** Default safety layout also applies to stored AI positions and cached legibility results. */
export function placeTextInThirds(tl: Timeline): Timeline {
  if (!usesThirds(tl)) return tl;
  const H = tl.height, margin = H * 0.0125;
  const warnings = [...tl.warnings];
  const facesDuring = (start: number, duration: number) => tl.clips.filter(c => c.face && c.fromFrame < start + duration && c.fromFrame + c.durationFrames > start).map(c => c.face!);
  const elements = tl.elements.flatMap(e => {
    // A title asked behind the head stays where it was put: moved above the head, nothing would pass in front of it.
    if (e.kind !== "title" || e.layer === "behind-subject") return [e];
    const faces = facesDuring(e.fromFrame, e.durationFrames);
    const top = H * THIRD_BANDS.titleTop;
    const bottom = Math.min(H * THIRD_BANDS.titleBottom, ...faces.map(f => f[1] * H - margin));
    // No room above the head: the title stays, small at the very top, over the forehead rather than gone.
    const tight = bottom - top < H * 0.035;
    if (tight) warnings.push(`title ${e.id}: no room above the head in the upper third`);
    const box = tight ? H * 0.07 : Math.min(H * 0.16, bottom - top);
    const cy = tight ? top + box / 2 : Math.min(Math.max(H * 0.15, top + box / 2), bottom - box / 2);
    return [{ ...e, x: 0.5, y: cy / H, textMaxHeight: box }];
  });
  const captions = tl.captions.flatMap(c => {
    const half = c.text.split("\n").length * tl.style.caption.size * tl.width * 1.15 / 2;
    const faces = facesDuring(c.fromFrame, c.durationFrames);
    const top = Math.max(H * THIRD_BANDS.captionTop, ...faces.map(f => (f[1] + f[3]) * H + margin));
    const bottom = H * THIRD_BANDS.captionBottom - margin;
    // No room below the face: the subtitle stays, as low as the band allows (on the chin, under the mouth), never gone.
    if (top + half * 2 > bottom) warnings.push(`caption ${c.id}: no room below the face in the lower third`);
    const cy = Math.min(Math.max(H * 0.76, top + half), bottom - half);
    return [{ ...c, x: 0.5, y: cy / H }];
  });
  return { ...tl, elements, captions, warnings: [...new Set(warnings)] };
}
