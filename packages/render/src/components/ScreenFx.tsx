import type { FC } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { Style } from "@adam-studio/model";
import type { WindowState } from "../lib/camera";
import { luminance } from "../lib/fx";
import { atomPixels } from "../lib/atom";
import { boardFrame, iconPaths, pickIcons } from "../lib/pixelicons";
import { barcode } from "../lib/poster";
import { fitFontSize } from "../lib/text";
import { CAPTION_FONT } from "../props";
import { FrameAround } from "./FrameAround";

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
  if (win.chrome === "plain") return <div style={{ position: "absolute", left, top, width: w, height: h, border: `${2 * k}px solid rgba(244,242,237,0.75)`, borderRadius: 6 * k, boxShadow: "0 8px 28px rgba(0,0,0,0.2)", opacity: win.amount, pointerEvents: "none" }} />;
  return (
    <div style={{ position: "absolute", left: left - edge, top: top - bar - edge, width: w + 2 * edge, opacity: win.amount, pointerEvents: "none" }}>
      <div style={{ height: bar, background: win.barColor, border: `${edge}px solid #0D0D0D`, borderBottom: "none", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 * k, paddingRight: 10 * k, boxSizing: "content-box" }}>
        {[0, 1, 2].map((i) => <div key={i} style={{ width: square, height: square, background: "#E4E2BF", border: `${2 * k}px solid #0D0D0D`, boxSizing: "border-box" }} />)}
      </div>
      <div style={{ height: h, border: `${edge}px solid #0D0D0D`, boxSizing: "content-box" }} />
    </div>
  );
};

/**
 * The poster dress of the 4:3 window, after printed tickets and magazine covers: on the flat colour, a big header in
 * the caption font with a bar row and a tag above the box; the box in a thin frame with a halftone screen over the
 * take (which the edit turns black and white); under it, room for the captions, then a rule, small labels, a pill in
 * the highlight colour, a barcode and a spaced-out footer line. Ink or white, whichever reads on the flat colour.
 */
export const PosterChrome: FC<{ win: WindowState; style: Style }> = ({ win, style }) => {
  const { width } = useVideoConfig();
  const k = width / 1080;
  const ink = luminance(win.color) > 0.45 ? "#111111" : "#F2F2EE";
  const { left, top, width: w, height: h } = win.box;
  const bottom = top + h;
  const head = win.header ? fitFontSize(win.header, w, 260 * k, 0.64) : 0;
  const line = 3 * k;
  const pixel = { fontFamily: CAPTION_FONT, fontWeight: 700, color: ink, lineHeight: 0.9 } as const;
  const small = { ...pixel, fontSize: 26 * k, letterSpacing: "0.06em", textTransform: "uppercase" } as const;
  const low = bottom + 200 * k;
  return (
    <AbsoluteFill style={{ opacity: win.amount, pointerEvents: "none" }}>
      {/* Above: the header, then the bar row and the tag. */}
      <div style={{ position: "absolute", left, width: w, bottom: `calc(100% - ${top - 26 * k}px)`, display: "flex", flexDirection: "column", gap: 18 * k }}>
        {win.header && <div style={{ ...pixel, fontSize: head, whiteSpace: "nowrap", letterSpacing: "0.02em" }}>{win.header}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 14 * k, height: 58 * k }}>
          <div style={{ width: 14 * k, height: "100%", background: ink }} />
          <div style={{ width: 14 * k, height: "100%", background: ink }} />
          <div style={{ flex: 1, height: "100%", background: ink, borderRadius: `0 ${29 * k}px ${29 * k}px 0` }} />
          {win.tag && <div style={{ ...pixel, fontSize: 64 * k }}>{win.tag}</div>}
        </div>
      </div>
      {/* The box: a thin frame and a halftone screen over the take. */}
      <div style={{ position: "absolute", left: left - line, top: top - line, width: w, height: h, border: `${line}px solid ${ink}`,
        backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.5) 30%, transparent 33%)", backgroundSize: `${7 * k}px ${7 * k}px`, mixBlendMode: "multiply" }} />
      {/* Under the captions: a rule, labels and the pill, the barcode, the footer. */}
      <div style={{ position: "absolute", left, width: w, top: low, display: "flex", flexDirection: "column", gap: 16 * k }}>
        <div style={{ height: line, background: ink }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 * k }}>
          <span style={small}>{win.footer || win.header}</span>
          <div style={{ flex: 1, height: 40 * k, borderRadius: 999, border: `${line}px solid ${ink}`, background: style.colors.highlight }} />
          <span style={small}>{win.tag}</span>
        </div>
        <svg width={w} height={120 * k} style={{ display: "block" }}>
          {barcode(`${win.header}${win.tag}${win.footer}`, w).map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={120 * k} fill={ink} />)}
        </svg>
        <div style={{ ...small, fontSize: 22 * k, letterSpacing: "0.55em", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden" }}>{win.footer}</div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * The 4:3 box as an application window round the take (in its own colours): a terminal (dark bar, three dots, the
 * header as a prompt) or an old Windows window (grey bevel, blue title bar, the header as its title, three buttons);
 * a fine grain over the take only, a new seed every frame.
 */
export const AppWindow: FC<{ win: WindowState; frame: number }> = ({ win, frame }) => {
  const { width } = useVideoConfig();
  const k = width / 1080;
  const { left, top, width: w, height: h } = win.box;
  const grainId = "adam-window-grain";
  const grain = (
    <svg style={{ position: "absolute", left, top, width: w, height: h, mixBlendMode: "overlay", opacity: 0.45 }} aria-hidden="true">
      <filter id={grainId} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame * 7 + 3} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${grainId})`} />
    </svg>
  );
  const label = { fontFamily: CAPTION_FONT, fontWeight: 700, fontSize: 26 * k, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden" } as const;
  if (win.chrome === "terminal") {
    const edge = 3 * k, bar = 50 * k;
    return (
      <AbsoluteFill style={{ opacity: win.amount, pointerEvents: "none" }}>
        {grain}
        <div style={{ position: "absolute", left: left - edge, top: top - bar - edge, width: w + 2 * edge, height: h + bar + 2 * edge, boxSizing: "border-box",
          border: `${edge}px solid #2B2B2B`, borderRadius: 14 * k, boxShadow: `0 ${18 * k}px ${50 * k}px rgba(0,0,0,0.45)` }}>
          <div style={{ height: bar - edge, background: "#1D1D1D", borderRadius: `${11 * k}px ${11 * k}px 0 0`, display: "flex", alignItems: "center", gap: 12 * k, padding: `0 ${18 * k}px` }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 18 * k, height: 18 * k, borderRadius: "50%", background: c }} />)}
            <div style={{ ...label, color: "#D8D8D8", marginLeft: 16 * k }}>{win.header || "~"} <span style={{ opacity: frame % 30 < 15 ? 1 : 0 }}>_</span></div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  // Windows 95: a 4 px bevel (light top-left, dark bottom-right) round a grey frame, the blue title bar, the buttons.
  const pad = 6 * k, bar = 44 * k, bevel = (light: string, dark: string, n: number) => `inset ${n}px ${n}px 0 ${light}, inset ${-n}px ${-n}px 0 ${dark}`;
  return (
    <AbsoluteFill style={{ opacity: win.amount, pointerEvents: "none" }}>
      {grain}
      <div style={{ position: "absolute", left: left - pad, top: top - bar - 2 * pad, width: w + 2 * pad, height: h + bar + 3 * pad, boxSizing: "border-box",
        background: "transparent", boxShadow: `${bevel("#FFFFFF", "#404040", 3 * k)}, 0 0 0 ${3 * k}px #C0C0C0, 0 0 0 ${5 * k}px #000000` }}>
        <div style={{ position: "absolute", left: pad, right: pad, top: pad, height: bar, background: "linear-gradient(90deg, #000080, #1084D0)", display: "flex", alignItems: "center", padding: `0 ${8 * k}px`, gap: 6 * k }}>
          <div style={{ ...label, color: "#FFFFFF", flex: 1 }}>{win.header || "WAMI.exe"}</div>
          {["_", "□", "×"].map((g) => (
            <div key={g} style={{ ...label, width: 34 * k, height: 30 * k, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", background: "#C0C0C0", boxShadow: bevel("#FFFFFF", "#404040", 2 * k), fontSize: 24 * k }}>{g}</div>
          ))}
        </div>
        {/* the grey frame between the bar and the take */}
        <div style={{ position: "absolute", left: 0, right: 0, top: pad + bar, height: pad, background: "#C0C0C0" }} />
        <div style={{ position: "absolute", left: 0, width: pad, top: pad + bar, bottom: 0, background: "#C0C0C0", boxShadow: bevel("#FFFFFF", "transparent", 3 * k) }} />
        <div style={{ position: "absolute", right: 0, width: pad, top: pad + bar, bottom: 0, background: "#C0C0C0", boxShadow: bevel("transparent", "#404040", 3 * k) }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: pad, background: "#C0C0C0", boxShadow: bevel("transparent", "#404040", 3 * k) }} />
      </div>
    </AbsoluteFill>
  );
};

const B_INK = "#141412";
const PixelIcon: FC<{ name: string; px: number; ink?: string }> = ({ name, px, ink = B_INK }) => {
  const p = iconPaths(name);
  return (
    <svg width={px} height={px} viewBox="0 0 12 12" shapeRendering="crispEdges">
      <path fill={ink} d={p.ink} /><path fill={ink === B_INK ? "#FFFFFF" : B_INK} d={p.fill} />
    </svg>
  );
};

function seedNum(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

/**
 * The board dress of the 4:3 window: a paper page with a fine grid and a wireframe floor in perspective (never over
 * the take), grain over everything, pixel icons and a turning atom scattered round, the take in its own colours in one
 * of five frames (drawn from the element's id, or the one asked for).
 */
export const BoardChrome: FC<{ win: WindowState; frame: number }> = ({ win, frame }) => {
  const { width, height, fps } = useVideoConfig();
  const k = width / 1080, ky = height / 1920;
  const { left, top, width: w, height: h } = win.box;
  const bottom = top + h;
  // Ink on every page but the black one, where the lines, frames and icons turn cream.
  const ink = luminance(win.color) < 0.03 ? "#EDE3CF" : B_INK;
  const kind = boardFrame(win.id, win.frame);
  const icons = pickIcons(win.id, 4);
  const hole = `path(evenodd, "M0 0H${width}V${height}H0Z M${left} ${top}H${left + w}V${bottom}H${left}Z")`;
  const floor = Math.max(bottom + 230 * ky, 1330 * ky);
  const no = 1 + Math.floor(seedNum(win.id) * 9);
  const grainId = "adam-board-grain";
  const ms = (frame * 1000) / fps;
  const frameEl = (
    <div style={{ position: "absolute", left, top, width: w, height: h }}>
      <FrameAround kind={kind} k={k} ink={ink} name={(win.header || "wami").toLowerCase()} tag={win.tag || "preuves"} no={no} progress={win.progress} />
    </div>
  );
  const slots: [number, number, number][] = [[80 * k, 140 * ky, 72 * k], [930 * k, 200 * ky, 60 * k], [110 * k, floor + 120 * ky, 58 * k], [560 * k, floor + 330 * ky, 50 * k]];
  const hLines = Math.ceil(floor / (110 * ky));
  return (
    <AbsoluteFill style={{ opacity: win.amount, pointerEvents: "none" }}>
      {/* The page's grid and floor, cut round the take. */}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", left: 0, top: 0, clipPath: hole, opacity: 0.38 }}>
        {Array.from({ length: hLines }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 110 * ky} x2={width} y2={i * 110 * ky} stroke={ink} strokeWidth={1.2 * k} opacity={0.45} />)}
        {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={i * 108 * k} y1={0} x2={i * 108 * k} y2={floor} stroke={ink} strokeWidth={1.2 * k} opacity={0.45} />)}
        {Array.from({ length: 23 }, (_, i) => <line key={`r${i}`} x1={width / 2 + (i - 11) * 40 * k} y1={floor} x2={width / 2 + (i - 11) * 260 * k} y2={height} stroke={ink} strokeWidth={2 * k} />)}
        {Array.from({ length: 9 }, (_, i) => { const y = floor + Math.pow(i / 8, 1.8) * (height - floor); return <line key={`f${i}`} x1={0} y1={y} x2={width} y2={y} stroke={ink} strokeWidth={2 * k} />; })}
      </svg>
      {frameEl}
      {slots.map(([x, y, s], i) => <div key={i} style={{ position: "absolute", left: x, top: y }}><PixelIcon name={icons[i]!} px={s} ink={ink} /></div>)}
      {/* A turning atom on the floor. */}
      <svg width={170 * k} height={170 * k} viewBox="0 0 44 44" shapeRendering="crispEdges" style={{ position: "absolute", left: 790 * k, top: floor + 190 * ky }}>
        <path fill={ink} d={atomPixels(ms, 44).map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("")} />
      </svg>
      {/* Grain over the page and the take. */}
      <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, mixBlendMode: "overlay", opacity: 0.5 }} aria-hidden="true">
        <filter id={grainId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame * 7 + 3} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${grainId})`} />
      </svg>
    </AbsoluteFill>
  );
};
