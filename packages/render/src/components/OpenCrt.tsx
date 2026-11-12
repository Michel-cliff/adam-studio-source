import type { FC } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { OpenCrtPropsSchema, type Style, type TimelineElement } from "@adam-studio/model";
import { openingAt } from "../lib/opening";
import { colorOf } from "../lib/text";
import { Scanlines } from "./ScreenFx";

/** A CRT powering on over the first frames: a line from the centre to the edges, then the frame opening vertically. */
export const OpenCrt: FC<{ el: TimelineElement; style: Style }> = ({ el, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = OpenCrtPropsSchema.parse(el.props);
  const { line, open, scanlines } = openingAt(frame, fps, p);
  const lh = Math.max(1, (p.lineHeight * width) / 1080);
  const colour = colorOf(p.line, style);
  // The black halves draw back from the centre; the line rides their inner edges and thins out as they part.
  const half = (height / 2) * (1 - open);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {open < 1 ? (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, width, height: half, backgroundColor: "#000" }} />
          <div style={{ position: "absolute", left: 0, top: height - half, width, height: half, backgroundColor: "#000" }} />
          {line > 0 ? [height / 2 - half, height / 2 + half - lh].map((top, i) => (
            <div key={i} style={{ position: "absolute", top: open > 0 ? top : height / 2 - lh / 2, left: (width * (1 - line)) / 2, width: width * line, height: lh,
              backgroundColor: colour, opacity: 1 - open, boxShadow: `0 0 ${lh * 3}px ${colour}` }} />
          )) : null}
        </>
      ) : null}
      <Scanlines amount={scanlines} />
    </AbsoluteFill>
  );
};
