import { seedAngle } from "../lib/atom";
import { boardFrame } from "../lib/pixelicons";
import { FrameAround } from "./FrameAround";
import { src } from "../lib/src";
import type { CSSProperties, FC } from "react";
import { Img, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import type { ImageProps, Style, TimelineElement } from "@adam-studio/model";
import { bloomLayer, grainLayer, insertFilter } from "../lib/inserts";
import { isVideoFile, startFrames } from "../lib/media-kind";
import { presetStyle } from "../lib/presets";
import type { MediaFiles } from "../props";

const OFF: Style["inserts"] = { bw: 0, grain: 0, bloom: 0 };

/**
 * An image insert. The wrapper takes the image's exact box, so the inserts' treatment (style.inserts: black and
 * white, a bloom copy in screen mode, a grain drawn anew each frame) covers the picture and nothing around it.
 */
export const ImageElement: FC<{ el: TimelineElement; media: Record<string, MediaFiles>; speed?: number; inserts?: Style["inserts"]; stable?: boolean }> = ({
  el, media, speed = 1, inserts, stable = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const props = el.props as ImageProps;
  const file = media[props.asset]?.file;
  if (!file) return null;
  const ms = ((frame * 1000) / fps + el.trimStartMs) * speed;
  const totalMs = ((el.durationFrames * 1000) / fps + el.trimStartMs) * speed;
  const intro = presetStyle(props.intro, ms, frame, stable);
  const outro = presetStyle(props.outro, totalMs - ms, frame, stable);
  const ins = inserts ?? OFF;
  const look = insertFilter(ins);
  const bloom = bloomLayer(ins, height);
  const grain = grainLayer(ins, frame);
  const full = props.fit === "full";
  const wrap: CSSProperties = full
    ? { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }
    : { position: "absolute", left: el.x * width, top: el.y * height, translate: "-50% -50%" };
  const picture: CSSProperties = full
    ? { display: "block", width: "100%", height: "100%", objectFit: "fill" }
    : props.width
      ? { display: "block", width: props.width * width, height: "auto", maxHeight: height * 0.9, objectFit: props.fit as "contain" | "cover" }
      : { display: "block", maxWidth: width * 0.9, maxHeight: height * 0.9, objectFit: props.fit as "contain" | "cover" };
  const video = isVideoFile(file);
  const cover: CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" };
  const grainId = `adam-grain-${el.id}`;
  // The pixel entrance: a mosaic filter (sample one point per block, tile it, grow it back to the block) at the
  // preset's block size, scaled to the frame width.
  const block = Math.round(((intro.pixel || outro.pixel || 0) * width) / 1080);
  const pixelId = `adam-px-${el.id}`;
  // Paper: hard white drop-shadows all round make the edge, one dark one the shadow; tilted -6 to 6 degrees.
  const e = Math.max(3, Math.round((9 * width) / 1080));
  const paper = props.paper
    ? [...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * 2 * Math.PI; return `drop-shadow(${(e * Math.cos(a)).toFixed(1)}px ${(e * Math.sin(a)).toFixed(1)}px 0 #FFFFFF)`; }),
      `drop-shadow(${e * 1.4}px ${e * 1.8}px 0 rgba(0,0,0,0.32))`].join(" ")
    : "";
  const tilt = props.paper ? ((seedAngle(el.id) / Math.PI) - 1) * 6 : 0;
  return (
    <div
      style={{
        ...wrap,
        opacity: Math.min(intro.opacity ?? 1, outro.opacity ?? 1),
        transform: [intro.transform, outro.transform].filter(Boolean).join(" ") || undefined,
        filter: [intro.filter, outro.filter, block > 1 ? `url(#${pixelId})` : ""].filter(Boolean).join(" ") || undefined,
      }}
    >
      {block > 1 ? (
        <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
          <filter id={pixelId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feFlood x={Math.floor(block / 2) - 1} y={Math.floor(block / 2) - 1} width={2} height={2} />
            <feComposite width={block} height={block} />
            <feTile result="grid" />
            <feComposite in="SourceGraphic" in2="grid" operator="in" />
            <feMorphology operator="dilate" radius={block / 2} />
          </filter>
        </svg>
      ) : null}
      {video ? (
        <OffthreadVideo src={src(file)} trimBefore={startFrames(props.startMs ?? 0, fps)} volume={props.volume ?? 0} muted={!props.volume}
          style={{ ...picture, filter: look === "none" ? undefined : look }} />
      ) : (
        props.frame && !full ? (
          // In a box the picture's size, so the frame is drawn from its edges.
          <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
            <Img src={src(file)} style={{ ...picture, filter: look === "none" ? undefined : look }} />
            <FrameAround kind={props.frame === "auto" ? boardFrame(el.id) : props.frame} k={width / 1080} ink="#141412" name={props.asset}
              tag={props.asset} no={1 + (Math.round(seedAngle(el.id) * 100) % 9)} progress={Math.min(1, ms / Math.max(1, totalMs))} />
          </div>
        ) : (
          <Img src={src(file)} style={{ ...picture, filter: [look === "none" ? "" : look, paper].filter(Boolean).join(" ") || undefined, rotate: tilt ? `${tilt.toFixed(1)}deg` : undefined }} />
        )
      )}
      {bloom && !video ? <Img src={src(file)} style={{ ...cover, objectFit: "fill", filter: bloom.filter, opacity: bloom.opacity, mixBlendMode: bloom.mixBlendMode }} /> : null}
      {grain ? (
        <svg style={{ ...cover, opacity: grain.opacity, mixBlendMode: "overlay" }} aria-hidden="true">
          <filter id={grainId} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={grain.seed} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${grainId})`} />
        </svg>
      ) : null}
    </div>
  );
};
