import type { FC } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { cameraAt, windowAt } from "./lib/camera";
import { scanlinesAt } from "./lib/fx";
import { FootageGrain, Scanlines, AppWindow, BoardChrome, PosterChrome, WindowChrome } from "./components/ScreenFx";
import { AudioLayer } from "./components/AudioLayer";
import { Captions } from "./components/Captions";
import { ClipLayer } from "./components/ClipLayer";
import { ElementLayer } from "./components/ElementLayer";
import { ProgressBar } from "./components/ProgressBar";
import { SubjectLayer } from "./components/SubjectLayer";
import { ensureFonts } from "./fonts";
import { GRADE_FILTER_ID, gradeFilter, vignetteBackground, warmthFilter, warmthMatrix } from "./lib/grade";
import { slideWindows, subjectWindows } from "./lib/subject";
import type { RenderProps } from "./props";

export const Edit: FC<RenderProps> = (props) => {
  const families = ensureFonts(props.fonts);
  const fontVars = { "--adam-caption": families.caption, "--adam-title": families.title, ...(families.accent ? { "--adam-accent": families.accent } : {}) } as React.CSSProperties;
  const frame = useCurrentFrame();
  const { timeline, media } = props;
  const mode = props.mode ?? { kind: "full" };
  if (mode.kind === "overlay") {
    // Transparent background, only the listed front elements: a CapCut overlay.
    return (
      <AbsoluteFill style={fontVars}>
        <ElementLayer timeline={timeline} media={media} layer="front" only={mode.elements} />
      </AbsoluteFill>
    );
  }
  const full = mode.kind === "full";
  const grade = timeline.style.grade;
  // Baked stretches keep only the warmth (the exporter warms the native videos alike): CapCut applies the
  // rest of the grade over the whole main track, baked or native.
  const filter = full ? gradeFilter(grade, GRADE_FILTER_ID) : warmthFilter(grade, GRADE_FILTER_ID);
  const slides = slideWindows(timeline);
  const cam = cameraAt(timeline, frame);
  const win = windowAt(timeline, frame);
  const fx = timeline.style.fx;
  return (
    <AbsoluteFill style={{ backgroundColor: "black", ...fontVars }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={GRADE_FILTER_ID} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={warmthMatrix(grade.warmth).join(" ")} />
        </filter>
      </svg>
      {/* The 4:3 window: the flat colour is already behind while the main track shrinks onto it. */}
      {win?.backdrop === "color" ? <AbsoluteFill style={{ backgroundColor: win.color }} /> : null}
      {/* or the take itself, blurred and dimmed, filling the frame behind the box */}
      {win?.backdrop === "blur" ? (
        <AbsoluteFill style={{ filter: `${filter === "none" ? "" : filter} blur(${Math.round(timeline.width * 0.04)}px) brightness(0.75)`, transform: "scale(1.12)" }}>
          <ClipLayer timeline={timeline} media={media} slides={slides} />
        </AbsoluteFill>
      ) : null}
      {/* A poster: the take turns black and white and harder as it lands in its frame. */}
      <AbsoluteFill style={win ? { transform: win.transform, transformOrigin: "0 0", clipPath: win.clip, filter: win.chrome === "poster" ? `grayscale(${win.amount}) contrast(${1 + 0.35 * win.amount})` : undefined } : undefined}>
        <AbsoluteFill style={{ transform: cam.transform, transformOrigin: cam.origin, filter: cam.filter }}>
          <AbsoluteFill style={{ filter }}>
            <ClipLayer timeline={timeline} media={media} slides={slides} />
          </AbsoluteFill>
          <ElementLayer timeline={timeline} media={media} layer="behind-subject" />
          <AbsoluteFill style={{ filter }}>
            <SubjectLayer timeline={timeline} media={media} windows={subjectWindows(timeline)} slides={slides} />
          </AbsoluteFill>
        </AbsoluteFill>
      </AbsoluteFill>
      {win ? (win.chrome === "poster" ? <PosterChrome win={win} style={timeline.style} />
        : win.chrome === "terminal" || win.chrome === "win95" ? <AppWindow win={win} frame={frame} />
        : win.chrome === "board" ? <BoardChrome win={win} frame={frame} /> : <WindowChrome win={win} />) : null}
      <FootageGrain amount={fx?.grain ?? 0} frame={frame} />
      <Scanlines amount={scanlinesAt(timeline, frame)} />
      {cam.flash > 0 ? <AbsoluteFill style={{ backgroundColor: "white", opacity: cam.flash }} /> : null}
      {full && grade.vignette > 0 ? <AbsoluteFill style={{ background: vignetteBackground(grade.vignette), opacity: 1 - (win?.amount ?? 0) }} /> : null}
      {full ? <ElementLayer timeline={timeline} media={media} layer="front" covers={false} /> : null}
      {full ? <Captions timeline={timeline} /> : null}
      {/* What covers the frame goes over the captions: the end card, the progress bar over it, the opening over all. */}
      {full ? <ElementLayer timeline={timeline} media={media} layer="front" kind="endcard.desktop" /> : null}
      {full && timeline.style.progress ? <ProgressBar progress={timeline.style.progress} durationFrames={timeline.durationFrames} /> : null}
      {full ? <ElementLayer timeline={timeline} media={media} layer="front" kind="open.crt" /> : null}
      <AudioLayer timeline={timeline} media={media} clipAudioOnly={!full} />
    </AbsoluteFill>
  );
};
