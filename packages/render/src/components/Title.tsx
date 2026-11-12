import type { FC } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Style, TimelineElement, TitleProps } from "@adam-studio/model";
import { colorOf, editorialEntrance, exitOpacity, fitFontSize, glitchAmount, keySegments } from "../lib/text";
import { ACCENT_FONT, CAPTION_FONT, TITLE_FONT } from "../props";

/** Condensed headline, optional italic bridge, restrained scale/focus. The text never shakes by default. */
export const Title: FC<{ el: TimelineElement; style: Style }> = ({ el, style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const props = el.props as TitleProps;
  const ms = frame * 1000 / fps + el.trimStartMs;
  const speed = style.motion?.speed ?? 1;
  const phase = props.phases.find((p) => ms >= p.startMs && ms < p.endMs);
  if (!phase) return null;
  const local = (ms - phase.startMs) * speed, phaseMs = (phase.endMs - phase.startMs) * speed;
  const stable = style.motion?.stable !== false;
  const g = stable ? 0 : glitchAmount(local, phaseMs, phase.lines.length);
  const entrance = editorialEntrance(local);
  const keyed = phase.lines.some((l) => l.key);
  const colour = colorOf(props.textColor ?? "text", style);
  // Keep the complete headline group in the safe title band, including the connector.
  const maxSize = Math.min(width * 0.10, (el.textMaxHeight ?? height * 0.16) / (phase.lines.length + (props.connector ? 0.65 : 0) + (props.kicker ? 0.5 : 0)));
  const connector = props.connector ? <div style={{ fontFamily: ACCENT_FONT, fontStyle: "italic", fontWeight: 400, fontSize: maxSize * 0.62, lineHeight: 1.05, color: colour, WebkitTextStroke: `${width * 0.001}px ${style.colors.ink}`, paintOrder: "stroke fill", textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>{props.connector}</div> : null;
  return <AbsoluteFill style={{ opacity: entrance.opacity * exitOpacity(local, phaseMs) }}>
    <div style={{ position: "absolute", left: (el.x - 0.5) * width, width, top: el.y * height,
      display: "flex", flexDirection: "column", alignItems: "center",
      transform: `translate(${g ? (((frame * 37) % 11) - 5) * g : 0}px, -50%) scale(${entrance.scale})`,
      filter: entrance.blur > 0.05 ? `blur(${entrance.blur}px)` : undefined }}>
      {props.kicker && phase === props.phases[0] && <div style={{ fontFamily: CAPTION_FONT, fontSize: maxSize * 0.36, fontWeight: 600, lineHeight: 1.15, marginBottom: width * 0.008, color: colour }}>{props.kicker}</div>}
      {phase.lines.map((line, i) => {
        const text = line.text.toLocaleUpperCase();
        const size = fitFontSize(text, width * 2 / 3, maxSize * line.sizeScale, 0.55);
        return <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {keyed ? <KeyLine text={text} keyText={line.key} blockText={line.block ?? line.key} size={size} r={1} style={style} text_={colour} block={colorOf(props.blockColor ?? "accent", style)} />
            : <div style={{ fontFamily: TITLE_FONT, fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: "-0.025em", whiteSpace: "nowrap",
                color: colour, background: line.box ? style.colors.accent : undefined, padding: line.box ? `0 ${size * 0.12}px` : undefined,
                WebkitTextStroke: `${width * 0.002}px ${style.colors.ink}`, paintOrder: "stroke fill", textShadow: g ? `${-6*g}px 0 red, ${6*g}px 0 cyan` : "0 3px 12px rgba(0,0,0,0.3)" }}>{text}</div>}
          {i === 0 && connector}
        </div>;
      })}
    </div>
  </AbsoluteFill>;
};

/**
 * A line of a title with a key word: plain heavy letters in the title font, the block on the accent colour (crossed
 * by fine scanlines), and in it the key word in the caption font, upper case.
 */
const KeyLine: FC<{ text: string; keyText?: string; blockText?: string; size: number; r: number; style: Style; text_: string; block: string }> = ({ text, keyText, blockText, size, r, style, text_, block }) => {
  const plain = (t: string, j: number) => (
    <span key={j} style={{ fontFamily: TITLE_FONT, fontWeight: 800, fontSize: size * 0.86, lineHeight: 1, letterSpacing: "-0.05em", color: text_ }}>{t}</span>
  );
  const inBlock = (t: string) => keySegments(t, keyText).map((s, j) => s.key ? (
    <span key={j} style={{ fontFamily: CAPTION_FONT, fontWeight: 700, fontSize: size * 1.02, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.04em",
      textShadow: style.motion?.stable !== false ? "none" : `${size * 0.03}px 0 rgba(0,229,255,0.55), ${-size * 0.03}px 0 rgba(255,0,92,0.45)` }}>
      {s.text.toUpperCase()}
    </span>
  ) : plain(s.text, j));
  return (
    <div style={{ display: "flex", alignItems: "center", whiteSpace: "pre", transform: `translateY(${(1 - r) * size * 0.3}px)`, clipPath: `inset(${(1 - r) * 100}% 0 0 0)`,
      // A soft dark shadow lifts light letters off the picture; dark letters would only get muddier with it.
      textShadow: luminance(text_) > 0.4 ? "0 3px 14px rgba(0,0,0,0.45)" : "none" }}>
      {keySegments(text, blockText).map((s, j) => s.key ? (
        <span key={j} style={{ display: "flex", alignItems: "center", color: luminance(block) > 0.55 ? style.colors.ink : text_, backgroundColor: block, padding: `${size * 0.06}px ${size * 0.14}px`,
          backgroundImage: style.motion?.stable !== false ? undefined : "repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 2px, transparent 2px 5px)", textShadow: "none" }}>
          {inBlock(s.text)}
        </span>
      ) : plain(s.text, j))}
    </div>
  );
};

/** Relative brightness of a #RRGGBB colour, 0 to 1 (anything else counts as light). */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1]!, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
