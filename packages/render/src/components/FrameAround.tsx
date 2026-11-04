import type { CSSProperties, FC } from "react";
import { iconPaths, type BoardFrame } from "../lib/pixelicons";
import { CAPTION_FONT } from "../props";

const notch = (a: number, b: number) =>
  `polygon(0 ${a}px,${b}px ${a}px,${b}px ${b}px,${a}px ${b}px,${a}px 0,calc(100% - ${a}px) 0,calc(100% - ${a}px) ${b}px,calc(100% - ${b}px) ${b}px,calc(100% - ${b}px) ${a}px,100% ${a}px,` +
  `100% calc(100% - ${a}px),calc(100% - ${b}px) calc(100% - ${a}px),calc(100% - ${b}px) calc(100% - ${b}px),calc(100% - ${a}px) calc(100% - ${b}px),calc(100% - ${a}px) 100%,` +
  `${a}px 100%,${a}px calc(100% - ${b}px),${b}px calc(100% - ${b}px),${b}px calc(100% - ${a}px),0 calc(100% - ${a}px))`;

/**
 * One of the house frames round a picture, drawn from its edges (placed inside a box the picture's size, it needs no
 * measure): a sticker (white border, tape, file name), FIG. (outline, corner crosses, a tag), a stepped pixel border,
 * loading (a path and a progress bar above), a folder (dashed border, a tab). k scales 1080-wide sizes.
 */
export const FrameAround: FC<{ kind: BoardFrame; k: number; ink: string; name: string; tag: string; no: number; progress: number }> = ({ kind, k, ink, name, tag, no, progress }) => {
  const label: CSSProperties = { position: "absolute", fontFamily: CAPTION_FONT, fontWeight: 700, fontSize: 24 * k, lineHeight: 1, color: ink, whiteSpace: "nowrap" };
  const box = (inset: number | string, extra: CSSProperties): CSSProperties => ({ position: "absolute", inset, boxSizing: "border-box", ...extra });
  if (kind === "sticker") {
    const side = 12 * k, foot = 48 * k;
    return (
      <>
        <div style={box(`${-side}px ${-side}px ${-foot}px ${-side}px`, { borderStyle: "solid", borderColor: "#FFFFFF", borderWidth: `${side}px ${side}px ${foot}px ${side}px`, boxShadow: `${7 * k}px ${7 * k}px 0 rgba(0,0,0,0.35)` })} />
        <div style={{ ...label, left: 4 * k, bottom: -38 * k, color: "#141412" }}>{name}_0{no}.png</div>
        <div style={{ position: "absolute", left: "50%", top: -30 * k, width: 140 * k, height: 40 * k, marginLeft: -70 * k, background: "#8C8B86", opacity: 0.85, transform: "rotate(4deg)" }} />
      </>
    );
  }
  if (kind === "fig") {
    const cross = { ...label, fontSize: 34 * k };
    return (
      <>
        <div style={box(0, { outline: `${3 * k}px solid ${ink}` })} />
        <div style={{ ...cross, left: -30 * k, top: -34 * k }}>+</div>
        <div style={{ ...cross, right: -30 * k, top: -34 * k }}>+</div>
        <div style={{ ...cross, left: -30 * k, bottom: -34 * k }}>+</div>
        <div style={{ ...cross, right: -30 * k, bottom: -34 * k }}>+</div>
        <div style={{ ...label, left: 0, top: -44 * k, background: ink, color: ink === "#141412" ? "#FFFFFF" : "#141412", padding: `${8 * k}px ${12 * k}px` }}>FIG. 0{no}</div>
      </>
    );
  }
  if (kind === "notch") {
    const t = 22 * k;
    return <div style={box(-t, { border: `${t}px solid ${ink}`, clipPath: notch(2 * t, t) })} />;
  }
  if (kind === "loading") {
    const filled = Math.min(14, Math.round(progress * 14 * 1.2));
    return (
      <>
        <div style={box(0, { outline: `${3 * k}px solid ${ink}` })} />
        <div style={{ position: "absolute", left: 0, right: 0, top: -96 * k, display: "flex", flexDirection: "column", gap: 12 * k }}>
          <div style={{ ...label, position: "static" }}>{`C:\\${name.toUpperCase()}\\${name}_0${no}.png`}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 * k }}>
            <div style={{ flex: 1, height: 30 * k, boxSizing: "border-box", border: `${3 * k}px solid ${ink}`, padding: 3 * k, display: "flex", gap: 3 * k }}>
              {Array.from({ length: 14 }, (_, i) => <div key={i} style={{ flex: 1, background: i < filled ? ink : "transparent" }} />)}
            </div>
            <div style={{ ...label, position: "static" }}>{Math.round((filled / 14) * 100)}%</div>
          </div>
        </div>
      </>
    );
  }
  const gap = 12 * k;
  const onInk = ink === "#141412" ? "#FFFFFF" : "#141412";
  return (
    <>
      <div style={box(-gap, { border: `${4 * k}px dashed ${ink}` })} />
      <div style={{ ...label, left: -gap, top: -gap - 46 * k, height: 46 * k, display: "flex", alignItems: "center", gap: 10 * k, padding: `0 ${26 * k}px 0 ${14 * k}px`, background: ink, color: onInk, clipPath: `polygon(0 0, calc(100% - ${16 * k}px) 0, 100% 100%, 0 100%)` }}>
        <svg width={24 * k} height={24 * k} viewBox="0 0 12 12" shapeRendering="crispEdges"><path fill={onInk} d={iconPaths("folder").ink} /></svg>
        {tag.toUpperCase()}
      </div>
    </>
  );
};
