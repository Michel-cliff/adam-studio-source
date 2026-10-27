import { z } from "zod";

const Ms = z.number().int().nonnegative();

export const TitlePropsSchema = z.strictObject({
  kicker: z.string().optional(),
  phases: z
    .array(
      z
        .strictObject({
          startMs: Ms,
          endMs: Ms,
          lines: z
            .array(z.strictObject({ text: z.string().min(1), box: z.boolean().default(false), sizeScale: z.number().positive().default(1) }))
            .min(1),
        })
        .refine((p) => p.endMs > p.startMs, { message: "endMs must be greater than startMs", path: ["endMs"] }),
    )
    .min(1),
});

export const BehindSubjectTextPropsSchema = z.strictObject({
  text: z.string().min(1),
  color: z.string().default("accent"),
  sizeScale: z.number().positive().default(1),
});

export const ImagePropsSchema = z.strictObject({
  asset: z.string().min(1),
  fit: z.enum(["full", "contain", "cover"]).default("full"),
  intro: z.string().optional(),
  outro: z.string().optional(),
  // Width as a share of the frame's width (popups beside the speaker); without it, at most 90% of the frame.
  width: z.number().min(0.03).max(1).optional(),
  // A video asset plays from startMs in its file, at this volume (muted by default: the speaker talks over it).
  startMs: Ms.default(0),
  volume: z.number().min(0).max(2).default(0),
});

export const SfxPropsSchema = z.strictObject({
  asset: z.string().min(1),
  volume: z.number().min(0).default(1),
  fadeInMs: Ms.default(0),
  fadeOutMs: Ms.default(0),
});

export const HudPanelPropsSchema = z.strictObject({
  title: z.string().default(""),
  lines: z.array(z.string()).default([]),
  asset: z.string().optional(),
  color: z.string().default("accent"),
  typing: z.boolean().default(true),
  width: z.number().min(0.2).max(1).default(0.8),
});

export const HudStatPropsSchema = z.strictObject({
  label: z.string(),
  value: z.number(),
  from: z.number().default(0),
  prefix: z.string().default(""),
  suffix: z.string().default(""),
  decimals: z.number().int().min(0).max(4).default(0),
  color: z.string().default("accent"),
  countMs: Ms.default(900),
});

export const LottiePropsSchema = z.strictObject({
  asset: z.string().min(1),
  loop: z.boolean().default(false),
  playbackRate: z.number().positive().default(1),
  width: z.number().min(0.05).max(1).default(0.5),
});

/** A punch-in on the main track (take, behind-subject elements and cut-out together); not drawn itself. */
export const CameraZoomPropsSchema = z.strictObject({
  scale: z.number().min(1).max(4).default(1.3),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.4),
  easeMs: Ms.default(300),
  // "cut": the element starts already zoomed in and only eases out at its end (an opening dezoom).
  enter: z.enum(["ease", "cut"]).default("ease"),
});

/**
 * The 4:3 window move: the main track shrinks like a window to a 4:3 box on a flat colour, with a black outline and a
 * title bar, then grows back at the end; not drawn itself. focusY is the part of the take the box keeps (its centre,
 * as a share of the frame height); y is where the box sits.
 */
export const CameraWindowPropsSchema = z.strictObject({
  // What sits behind the box: the flat colour, or the take itself, blurred and dimmed.
  backdrop: z.enum(["color", "blur"]).default("color"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "expected a #RRGGBB color").default("#F3BA20"),
  barColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "expected a #RRGGBB color").default("#2B6FD4"),
  width: z.number().min(0.3).max(1).default(0.8),
  y: z.number().min(0).max(1).default(0.42),
  focusY: z.number().min(0).max(1).default(0.4),
  easeMs: Ms.default(300),
});

export const KIND_SCHEMAS = {
  title: TitlePropsSchema,
  "text.behindSubject": BehindSubjectTextPropsSchema,
  image: ImagePropsSchema,
  sfx: SfxPropsSchema,
  "hud.panel": HudPanelPropsSchema,
  "hud.stat": HudStatPropsSchema,
  lottie: LottiePropsSchema,
  "camera.zoom": CameraZoomPropsSchema,
  "camera.window": CameraWindowPropsSchema,
} as const;

export type KindName = keyof typeof KIND_SCHEMAS;
export const KIND_NAMES = Object.keys(KIND_SCHEMAS) as KindName[];
/** Kinds whose props.asset must name an asset of the project. */
export const ASSET_PROP_KINDS: ReadonlySet<string> = new Set(["image", "sfx", "lottie", "hud.panel"]);

export function isKind(kind: string): kind is KindName {
  return Object.prototype.hasOwnProperty.call(KIND_SCHEMAS, kind);
}

export type TitleProps = z.output<typeof TitlePropsSchema>;
export type BehindSubjectTextProps = z.output<typeof BehindSubjectTextPropsSchema>;
export type ImageProps = z.output<typeof ImagePropsSchema>;
export type HudPanelProps = z.output<typeof HudPanelPropsSchema>;
export type HudStatProps = z.output<typeof HudStatPropsSchema>;
export type LottieProps = z.output<typeof LottiePropsSchema>;
export type CameraZoomProps = z.output<typeof CameraZoomPropsSchema>;
export type CameraWindowProps = z.output<typeof CameraWindowPropsSchema>;
export type SfxProps = z.output<typeof SfxPropsSchema>;
