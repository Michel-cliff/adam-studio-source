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
export const ImageElement: FC<{ el: TimelineElement; media: Record<string, MediaFiles>; speed?: number; inserts?: Style["inserts"] }> = ({
  el, media, speed = 1, inserts,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const props = el.props as ImageProps;
  const file = media[props.asset]?.file;
  if (!file) return null;
  const ms = ((frame * 1000) / fps + el.trimStartMs) * speed;
  const totalMs = ((el.durationFrames * 1000) / fps + el.trimStartMs) * speed;
  const intro = presetStyle(props.intro, ms, frame);
  const outro = presetStyle(props.outro, totalMs - ms, frame);
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
  return (
    <div
      style={{
        ...wrap,
        opacity: Math.min(intro.opacity ?? 1, outro.opacity ?? 1),
        transform: [intro.transform, outro.transform].filter(Boolean).join(" ") || undefined,
        filter: [intro.filter, outro.filter].filter(Boolean).join(" ") || undefined,
      }}
    >
      {video ? (
        <OffthreadVideo src={src(file)} trimBefore={startFrames(props.startMs ?? 0, fps)} volume={props.volume ?? 0} muted={!props.volume}
          style={{ ...picture, filter: look === "none" ? undefined : look }} />
      ) : (
        <Img src={src(file)} style={{ ...picture, filter: look === "none" ? undefined : look }} />
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
