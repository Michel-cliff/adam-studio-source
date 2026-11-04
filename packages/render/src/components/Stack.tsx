import type { FC } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { StackProps, Style, TimelineElement } from "@adam-studio/model";
import { atomOrbit, atomPixels, seedAngle } from "../lib/atom";
import { clamp01, colorOf, easeOutCubic, exitOpacity, fitFontSize } from "../lib/text";
import { CAPTION_FONT, TITLE_FONT } from "../props";

const GRID = 44;

/** A pixel atom (see atomPixels): whole cells, hard edges, a hard shadow. */
const Atom: FC<{ size: number; color: string; ms: number; spin: number }> = ({ size, color, ms, spin }) => (
  <svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} shapeRendering="crispEdges"
    style={{ transform: `rotate(${Math.round(spin / 15) * 15}deg)`, filter: "drop-shadow(2px 2px 0 rgba(0,0,0,0.35))" }}>
    <path fill={color} d={atomPixels(ms, GRID).map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("")} />
  </svg>
);

/** An important passage: the words stacked, huge and tight, a small label above, atoms looping around the block. */
export const Stack: FC<{ el: TimelineElement; style: Style }> = ({ el, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = el.props as StackProps;
  const speed = style.motion?.speed ?? 1;
  const ms = ((frame * 1000) / fps + el.trimStartMs) * speed;
  const totalMs = ((el.durationFrames * 1000) / fps + el.trimStartMs) * speed;
  const lines = (p.text.includes("\n") ? p.text.split("\n") : p.text.split(/\s+/)).map((l) => l.trim()).filter(Boolean);
  const widest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
  const caption = (p.font ?? "caption") === "caption";
  const size = fitFontSize(widest, width * 0.86, width * 0.3 * (p.sizeScale ?? 1), caption ? 0.62 : 0.5);
  const lineH = size * 0.86, labelH = p.label ? size * 0.3 : 0;
  const blockH = lines.length * lineH + labelH;
  const cy = Math.min(Math.max(el.y * height, blockH / 2 + height * 0.06), height * 0.94 - blockH / 2);
  const color = colorOf(p.color ?? "accent", style);
  const atomSize = width * 0.18;
  const box = { cx: width / 2, cy, rx: Math.min(width * 0.47, (widest.length * size * (caption ? 0.62 : 0.56)) / 2 + size * 0.2), ry: blockH / 2 + size * 0.2 };
  const start = seedAngle(el.id);
  // A hard outline in the text colour, eight steps round, no blur: the passage stays readable on a face or a dark
  // shirt and keeps its pixel edges.
  const o = Math.max(2, Math.round(size * 0.035)), ring = colorOf(p.outline ?? "text", style);
  const outline = [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]].map(([x, y]) => `${x}px ${y}px 0 ${ring}`).join(", ");
  return (
    <AbsoluteFill style={{ opacity: exitOpacity(ms, totalMs) }}>
      <div style={{ position: "absolute", left: 0, width, top: cy - blockH / 2, display: "flex", flexDirection: "column", alignItems: "center", color, fontFamily: caption ? CAPTION_FONT : TITLE_FONT, fontWeight: caption ? 700 : 800 }}>
        {p.label && <div style={{ fontSize: size * 0.24, lineHeight: 1.1, letterSpacing: caption ? "0" : "-0.04em", height: labelH, opacity: clamp01(ms / 160), textShadow: outline, color: colorOf(p.labelColor ?? p.color ?? "accent", style),
          ...(p.labelStyle === "pill" ? { textShadow: "none", height: "auto", fontSize: size * 0.17, textTransform: "uppercase", letterSpacing: "0.08em", padding: `${size * 0.04}px ${size * 0.14}px`,
            border: `${Math.max(2, Math.round(size * 0.012))}px solid currentColor`, borderRadius: 999, background: "rgba(20,20,18,0.62)", marginBottom: size * 0.08 } : {}) }}>{p.label}</div>}
        {lines.map((l, i) => {
          const t = easeOutCubic(clamp01((ms - i * 90) / 180));
          return (
            <div key={i} style={{ fontSize: size, lineHeight: 0.86, height: lineH, letterSpacing: caption ? "0" : "-0.06em", whiteSpace: "nowrap", opacity: t, transform: `translateY(${(1 - t) * size * 0.15}px) scale(${0.92 + 0.08 * t})`, textShadow: outline }}>
              {l}
            </div>
          );
        })}
      </div>
      {Array.from({ length: p.atoms ?? 2 }, (_, k) => {
        const o = atomOrbit(ms, k, p.atoms ?? 2, start, box);
        const pop = easeOutCubic(clamp01((ms - 120 - k * 80) / 240));
        return (
          <div key={k} style={{ position: "absolute", left: o.x - atomSize / 2, top: o.y - atomSize / 2, transform: `scale(${pop})` }}>
            <Atom size={atomSize} color={colorOf(p.atomColor ?? "highlight", style)} ms={ms} spin={o.spin} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
