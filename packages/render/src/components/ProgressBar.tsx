import type { FC } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Style } from "@adam-studio/model";
import { progressFill } from "../lib/progress";

/** The style's progress bar along the bottom: a dim track, lit block by block as the edit goes. */
export const ProgressBar: FC<{ progress: NonNullable<Style["progress"]>; durationFrames: number }> = ({ progress: p, durationFrames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const k = width / 1080;
  const h = Math.max(1, Math.round(p.height * k)), top = height - Math.round(p.bottom * k) - h;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, top, width, height: h, backgroundColor: p.track, opacity: p.trackOpacity }} />
      {progressFill(frame, durationFrames, width, p).map((b) => (
        <div key={b.x} style={{ position: "absolute", left: b.x, top, width: b.w, height: h, backgroundColor: p.color }} />
      ))}
    </AbsoluteFill>
  );
};
