import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { cardLayout, type CardProps, type Style, type TimelineElement } from "@adam-studio/model";
import { CAPTION_FONT, TITLE_FONT } from "../props";

// Text-only mode (default art direction): enters in 240 ms from 24 px below, leaves in 180 ms 24 px up, on one axis.
const ENTER = Easing.bezier(0.33, 1, 0.68, 1), EXIT = Easing.bezier(0.32, 0, 0.67, 0);
export function cardMotion(ms: number, totalMs: number, delayMs = 0): { opacity: number; dy: number } {
  const t = Math.min(1, Math.max(0, (ms - delayMs) / 240));
  const out = Math.min(1, Math.max(0, (ms - (totalMs - 180)) / 180));
  const e = ENTER(t), x = EXIT(out);
  return { opacity: e * (1 - x), dy: 24 * (1 - e) - 24 * x };
}

export const Card: FC<{ el: TimelineElement; style: Style }> = ({ el, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const c = el.props as CardProps;
  const k = width / 1080, ky = height / 1920;
  const ms = (frame * 1000) / fps + el.trimStartMs;
  const totalMs = (el.durationFrames * 1000) / fps + el.trimStartMs;
  const { main, secondary = 36 } = cardLayout(c);
  const { text: fg, ink, highlight } = style.colors;
  // The first card is there from the first frame: the video (and its thumbnail) never opens on an empty background.
  const moving = (delayMs = 0): CSSProperties => {
    const m = cardMotion(el.fromFrame === 0 ? Math.max(ms, 240 + delayMs) : ms, totalMs, delayMs);
    return { opacity: m.opacity, transform: `translateY(${m.dy * ky}px)` };
  };
  // The safe zone: a 720 px line centred on x 540, the block centred between y 269 and 1248.
  const column = (children: ReactNode, align: "center" | "left" = "center") => (
    <div style={{ position: "absolute", left: 180 * k, width: 720 * k, top: 269 * ky, height: (1248 - 269) * ky, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: align === "center" ? "center" : "flex-start", textAlign: align, gap: 28 * ky }}>
      {children}
    </div>
  );
  const line = (size: number, font: string, color: string, weight = 800): CSSProperties => ({ fontFamily: font, fontSize: size * k, fontWeight: weight, lineHeight: 1.08, letterSpacing: "-0.02em", color, margin: 0, overflowWrap: "break-word" });

  switch (c.archetype) {
    case "breath":
      // One word on paper: the only card that turns the background over.
      return (
        <AbsoluteFill style={{ background: fg }}>
          {column(<div style={{ ...line(main, TITLE_FONT, ink, 400), ...moving() }}>{c.text}</div>)}
        </AbsoluteFill>
      );
    case "number":
      return (
        <AbsoluteFill>
          {column(<>
            <div style={{ ...line(main, TITLE_FONT, highlight, 400), lineHeight: 1, whiteSpace: "nowrap", ...moving() }}>{c.text}</div>
            {c.label && <div style={{ ...line(secondary, CAPTION_FONT, fg, 600), lineHeight: 1.25, ...moving(60) }}>{c.label}</div>}
          </>)}
        </AbsoluteFill>
      );
    case "opposition":
      return (
        <AbsoluteFill>
          {column(<>
            <div style={{ ...line(main, CAPTION_FONT, fg), ...moving() }}>{c.text}</div>
            <div style={{ width: 120 * k, height: Math.max(2, 4 * k), background: highlight, ...moving(60) }} />
            <div style={{ ...line(main, CAPTION_FONT, highlight), ...moving(120) }}>{c.against}</div>
          </>)}
        </AbsoluteFill>
      );
    case "list":
      return (
        <AbsoluteFill>
          {column(<>
            {c.text && <div style={{ ...line(main, CAPTION_FONT, fg), ...moving() }}>{c.text}</div>}
            {(c.items ?? []).map((item, i) => (
              <div key={i} style={{ ...line(secondary, CAPTION_FONT, fg, 600), lineHeight: 1.25, display: "flex", gap: 16 * k, ...moving(60 * (i + 1)) }}>
                <span style={{ color: highlight }}>{i + 1}</span><span>{item}</span>
              </div>
            ))}
          </>, "left")}
        </AbsoluteFill>
      );
    case "quote":
      return (
        <AbsoluteFill>
          {column(
            <div style={{ display: "flex", gap: 28 * k, ...moving() }}>
              <div style={{ width: 6 * k, alignSelf: "stretch", background: highlight, flex: "none" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 24 * ky }}>
                <div style={{ ...line(main, CAPTION_FONT, fg, 600), lineHeight: 1.2 }}>{c.text}</div>
                {c.label && <div style={{ ...line(secondary, CAPTION_FONT, fg, 500), opacity: 0.75 }}>{c.label}</div>}
              </div>
            </div>,
            "left",
          )}
        </AbsoluteFill>
      );
    default:
      return (
        <AbsoluteFill>
          {column(<>
            <div style={{ ...line(main, CAPTION_FONT, fg), ...moving() }}>{c.text}</div>
            {c.label && <div style={{ ...line(secondary, CAPTION_FONT, fg, 600), ...moving(60) }}>{c.label}</div>}
          </>)}
        </AbsoluteFill>
      );
  }
};
