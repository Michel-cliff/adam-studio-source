import type { FC } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { EndcardDesktopPropsSchema, type Style, type TimelineElement } from "@adam-studio/model";
import { ARROW, cursorAt, FOLDER, iconBoxes, targetOf } from "../lib/endcard";
import { colorOf } from "../lib/text";
import { CAPTION_FONT } from "../props";

/** A pixel grid drawn as crisp rects: each character of `rows` picks a fill from `fills` ("." is empty). */
const Pixels: FC<{ rows: string[]; fills: Record<string, string>; size: number }> = ({ rows, fills, size }) => {
  const w = rows[0]!.length, h = rows.length;
  return (
    <svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" style={{ display: "block" }}>
      {rows.flatMap((row, y) => [...row].map((c, x) => (fills[c] ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fills[c]} /> : null)))}
    </svg>
  );
};

/** The end card as an old desktop: a folder per episode, and a cursor that double-clicks the next one. */
export const EndcardDesktop: FC<{ el: TimelineElement; style: Style }> = ({ el, style }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = EndcardDesktopPropsSchema.parse(el.props);
  const k = width / 1080;
  const t = Math.min(1, frame / Math.max(1, el.durationFrames - 1));
  const boxes = iconBoxes(p.items.length, k);
  const target = targetOf(p);
  const goal = boxes[target]!;
  const cursor = cursorAt(t, { x: width * 0.78, y: height * 0.78 }, { x: goal.x + goal.size * 0.55, y: goal.y + goal.size * 0.45 });
  const ink = style.colors.ink, icon = colorOf(p.iconColor, style), selection = colorOf(p.selection, style);
  const fills = { X: ink, Y: icon, H: `color-mix(in srgb, ${icon} 60%, white)` };
  const arrow = 48 * k;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${colorOf(p.sky[0], style)} 0%, ${colorOf(p.sky[1], style)} 100%)` }}>
      {p.items.map((item, i) => {
        const b = boxes[i]!;
        const selected = i === target && cursor.selected;
        const opened = i === p.current && i !== target;
        return (
          <div key={i} style={{ position: "absolute", left: b.x - 24 * k, top: b.y - 12 * k, width: b.size + 48 * k, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * k }}>
            <div style={{ padding: 6 * k, backgroundColor: selected ? `color-mix(in srgb, ${selection} 45%, transparent)` : "transparent", opacity: opened ? 0.6 : 1 }}>
              <Pixels rows={FOLDER} fills={fills} size={b.size} />
            </div>
            <div style={{ fontFamily: CAPTION_FONT, fontWeight: 600, fontSize: 26 * k, lineHeight: 1.1, textAlign: "center", whiteSpace: "nowrap",
              color: selected ? "#FFFFFF" : style.colors.text, backgroundColor: selected ? selection : "transparent", padding: `${2 * k}px ${6 * k}px`,
              textShadow: selected ? "none" : `0 ${2 * k}px 0 ${ink}` }}>
              {item.label}
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: cursor.x, top: cursor.y, transform: `scale(${cursor.pressed ? 0.86 : 1})`, transformOrigin: "0 0" }}>
        <Pixels rows={ARROW} fills={{ X: "#000000", W: "#FFFFFF" }} size={(arrow * 11) / 17} />
      </div>
    </AbsoluteFill>
  );
};
