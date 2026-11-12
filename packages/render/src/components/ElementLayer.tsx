import type { FC } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { Timeline, TimelineElement } from "@adam-studio/model";
import type { MediaFiles } from "../props";
import { BigWord } from "./BigWord";
import { Card } from "./Card";
import { Stack } from "./Stack";
import { HudPanel } from "./HudPanel";
import { HudStat } from "./HudStat";
import { LottieElement } from "./LottieElement";
import { ImageElement } from "./ImageElement";
import { Title } from "./Title";
import { OpenCrt } from "./OpenCrt";
import { EndcardDesktop } from "./EndcardDesktop";

/** Kinds that cover the whole frame, captions included: drawn above the captions, not with the other elements. */
export const COVER_KINDS: ReadonlySet<string> = new Set(["open.crt", "endcard.desktop"]);

/**
 * The elements of one layer; `only` keeps the listed element ids (CapCut overlays). In the full edit the front layer
 * leaves out the covering kinds (`covers` false), drawn later one kind at a time (`kind`) over the captions.
 */
export const ElementLayer: FC<{ timeline: Timeline; media: Record<string, MediaFiles>; layer: "front" | "behind-subject"; only?: string[]; covers?: boolean; kind?: string }> = ({
  timeline, media, layer, only, covers = true, kind,
}) => (
  <>
    {timeline.elements
      .filter((e) => e.layer === layer && (!only || only.includes(e.id)) && (covers || !COVER_KINDS.has(e.kind)) && (!kind || e.kind === kind))
      .map((el) => (
        <Sequence key={el.id} from={el.fromFrame} durationInFrames={el.durationFrames} layout="none">
          <AbsoluteFill style={{ pointerEvents: "none", zIndex: layer === "front" ? 20 : undefined, opacity: el.opacity ?? 1, transform: `rotate(${el.rotation ?? 0}deg) scale(${el.scale ?? 1})`, transformOrigin: `${el.x * 100}% ${el.y * 100}%` }}>
            <ElementView el={el} timeline={timeline} media={media} />
          </AbsoluteFill>
        </Sequence>
      ))}
  </>
);

const ElementView: FC<{ el: TimelineElement; timeline: Timeline; media: Record<string, MediaFiles> }> = ({ el, timeline, media }) => {
  switch (el.kind) {
    case "text.stack":
      return <Stack el={el} style={timeline.style} />;
    case "card":
      return <Card el={el} style={timeline.style} />;
    case "title":
      return <Title el={el} style={timeline.style} />;
    case "text.behindSubject":
      return <BigWord el={el} style={timeline.style} />;
    case "image":
      return <ImageElement el={el} media={media} speed={timeline.style.motion?.speed ?? 1} inserts={timeline.style.inserts} stable={timeline.style.motion?.stable !== false} />;
    case "hud.panel":
      return <HudPanel el={el} style={timeline.style} media={media} />;
    case "hud.stat":
      return <HudStat el={el} style={timeline.style} />;
    case "lottie":
      return <LottieElement el={el} style={timeline.style} media={media} />;
    case "open.crt":
      return <OpenCrt el={el} style={timeline.style} />;
    case "endcard.desktop":
      return <EndcardDesktop el={el} style={timeline.style} />;
    default:
      return null;
  }
};
