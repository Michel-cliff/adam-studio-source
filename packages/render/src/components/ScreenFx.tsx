import type { FC } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { WindowState } from "../lib/camera";

/** Fine grain over the footage, a new noise seed every frame, at the style's fx.grain opacity (overlay). */
export const FootageGrain: FC<{ amount: number; frame: number }> = ({ amount, frame }) => {
  if (amount <= 0) return null;
  const id = "adam-footage-grain";
  return (
    <AbsoluteFill style={{ opacity: amount, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%" aria-hidden="true">
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame * 7 + 3} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
};

/** CRT scanlines: 2 px dark lines every 4 px (at 1920 high), at the given opacity. */
export const Scanlines: FC<{ amount: number }> = ({ amount }) => {
  const { height } = useVideoConfig();
  if (amount <= 0) return null;
  const line = (2 * height) / 1920;
  return (
    <AbsoluteFill
      style={{
        opacity: amount, pointerEvents: "none",
        background: `repeating-linear-gradient(to bottom, #000 0px, #000 ${line}px, transparent ${line}px, transparent ${line * 2}px)`,
      }}
    />
  );
};

/** The window's chrome around the 4:3 box: a 4 px black outline and a 40 px title bar with three squares. */
export const WindowChrome: FC<{ win: WindowState }> = ({ win }) => {
  const { width } = useVideoConfig();
  const k = width / 1080;
  const edge = 4 * k, bar = 40 * k, square = 20 * k;
  const { left, top, width: w, height: h } = win.box;
  return (
    <div style={{ position: "absolute", left: left - edge, top: top - bar - edge, width: w + 2 * edge, opacity: win.amount, pointerEvents: "none" }}>
      <div style={{ height: bar, background: win.barColor, border: `${edge}px solid #0D0D0D`, borderBottom: "none", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 * k, paddingRight: 10 * k, boxSizing: "content-box" }}>
        {[0, 1, 2].map((i) => <div key={i} style={{ width: square, height: square, background: "#E4E2BF", border: `${2 * k}px solid #0D0D0D`, boxSizing: "border-box" }} />)}
      </div>
      <div style={{ height: h, border: `${edge}px solid #0D0D0D`, boxSizing: "content-box" }} />
    </div>
  );
};
