import { usesThirds } from "@adam-studio/model";
import type { FC } from "react";
import { Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { Timeline, TimelineCaption } from "@adam-studio/model";
import { windowAt } from "../lib/camera";
import { luminance } from "../lib/fx";
import { captionLines, easeOutCubic } from "../lib/text";
import { ACCENT_FONT, CAPTION_FONT } from "../props";

export const Captions: FC<{ timeline: Timeline }> = ({ timeline }) => (
  <>
    {timeline.captions.map((c) => (
      <Sequence key={c.id} from={c.fromFrame} durationInFrames={c.durationFrames} layout="none">
        <CaptionView c={c} timeline={timeline} />
      </Sequence>
    ))}
  </>
);

const CaptionView: FC<{ c: TimelineCaption; timeline: Timeline }> = ({ c, timeline }) => {
  const style = timeline.style;
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const size = style.caption.size * width;
  const introFrames = Math.max(1, Math.min(Math.round(0.15 * fps), Math.floor(c.durationFrames / 3)));
  const scale = style.caption.intro === "miniZoom" ? 0.85 + 0.15 * easeOutCubic(frame / introFrames) : 1;
  // In a 4:3 window the caption follows the frame and sits under the reduced picture; on a light flat colour it turns
  // ink without an outline, on a dark one it keeps its colour with a thinner outline.
  const win = windowAt(timeline, c.fromFrame + frame);
  const home = c.y * height;
  // Under the window the caption hangs from its top edge (two lines never bite into the frame); at home it is centred.
  // Under a board, a little lower: its frames (sticker foot, corner marks) take room under the box.
  const under = win ? win.box.top + win.box.height + size * 0.5 + (win.chrome === "board" ? 70 * (width / 1080) : 0) : home;
  const fixedText = usesThirds(timeline) || style.textLayout === "free";
  const top = fixedText ? home : win ? home + (under - home) * win.amount : home;
  const anchor = fixedText ? -50 : -50 * (1 - (win?.amount ?? 0));
  const onWindow = win !== null && win.amount > 0.5;
  // A blurred take behind the window reads like an image: the caption keeps its colour and outline.
  const light = onWindow && win!.backdrop === "color" && luminance(win!.color) > 0.35;
  // The legibility pass chose the least that keeps it readable on the frames under it: no thick outline everywhere.
  const t = onWindow ? undefined : c.treatment;
  const stroke = onWindow ? (light ? 0 : (8 * width) / 1080) : t === undefined ? size * style.caption.stroke * 0.5 : t === 2 ? (3 * width) / 1080 : 0;
  const shadow = t === undefined ? (style.caption.shadow && !onWindow ? "0 4px 12px rgba(0,0,0,0.55)" : undefined)
    : t === 0 ? "0 4px 12px rgba(0,0,0,0.55)" : t === 1 ? "0 4px 18px rgba(0,0,0,0.80)" : undefined;
  const k = width / 1080;
  // On a page of the same colour as the highlight (a board in the video's colour), the block turns ink, or cream on ink.
  const samePage = onWindow && win!.color.toLowerCase() === style.colors.highlight.toLowerCase();
  const block = samePage ? (luminance(win!.color) < 0.03 ? "#EDE3CF" : "#141412") : style.colors.highlight;
  return (
    <div
      style={{
        position: "absolute", left: c.x * width - width * 0.45, width: width * 0.9, top,
        transform: `translateY(${anchor}%) scale(${scale})`, textAlign: "center",
        fontFamily: CAPTION_FONT, fontWeight: 600, fontSize: size, lineHeight: 1.15, color: light ? style.colors.ink : style.colors.text,
        WebkitTextStroke: stroke > 0 ? `${stroke}px ${t === 2 ? style.colors.ink : "black"}` : undefined, paintOrder: "stroke fill",
        textShadow: shadow,
        // The plate, last resort on a light and busy background: ink at 88 %, 18 / 10 px inside, 6 px corners.
        // Sized to its lines (at most 720 px, as every caption), not to the room left of its anchor.
        ...(t === 3 ? { background: "rgba(18,18,18,0.88)", padding: `${10 * k}px ${18 * k}px`, borderRadius: 6 * k, width: "max-content", maxWidth: 720 * k, left: c.x * width, transform: `translate(-50%, ${anchor}%) scale(${scale})` } : {}),
      }}
    >
      {captionLines(c.text, c.highlightRanges).map((line, i) => (
        <div key={i}>
          {line.map((s, k) => (
            // On a light flat colour the highlight colour could vanish into it: the word stays ink there.
            <span key={k} style={s.highlight && style.caption.highlightAs === "block" ? {
              // On a block: the colour behind the word, the letters in ink or white (whichever reads on it), no outline.
              backgroundColor: block, color: luminance(block) > 0.55 ? style.colors.ink : "#FFFFFF",
              WebkitTextStroke: "0", textShadow: "none", padding: `0 ${size * 0.14}px`, margin: `0 ${size * 0.04}px`,
              backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 5px)",
            } : s.highlight && style.caption.highlightAs === "serif" ? {
              // In the accent italic serif: the switch reads by its shape. A serif sits smaller on the line than the
              // sans around it, so a touch larger; regular weight (the italic file has no bold to fake).
              fontFamily: ACCENT_FONT, fontStyle: "italic", fontWeight: 400, fontSize: size * 1.12, lineHeight: 1,
              color: light ? undefined : style.colors.highlight,
            } : { color: s.highlight && !light ? style.colors.highlight : undefined }}>
              {s.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};
