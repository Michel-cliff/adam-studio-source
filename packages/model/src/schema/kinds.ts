import { z } from "zod";

const Ms = z.number().int().nonnegative();

export const TitlePropsSchema = z.strictObject({
  kicker: z.string().optional(),
  // A short serif italic bridge between the first two title lines.
  connector: z.string().max(50).optional(),
  // A colour per part (a style colour name or #RRGGBB) for a title with a key word: kicker, letters, key word block.
  kickerColor: z.string().optional(),
  // The kicker as plain words, or as a small tag stuck on (the highlight colour, ink letters, slightly turned).
  kickerStyle: z.enum(["plain", "tag"]).default("plain"),
  textColor: z.string().optional(),
  blockColor: z.string().optional(),
  phases: z
    .array(
      z
        .strictObject({
          startMs: Ms,
          endMs: Ms,
          lines: z
            .array(z.strictObject({
              text: z.string().min(1), box: z.boolean().default(false), sizeScale: z.number().positive().default(1),
              // The important word(s) of the line: in the caption font, upper case, on the accent block;
              // block: the part of the line on that accent block (the key word by default). Once a line of a phase has
              // a key, the whole title is drawn this way: plain heavy letters, colour only behind the block.
              key: z.string().min(1).optional(),
              block: z.string().min(1).optional(),
            }))
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
  // A paper cut-out (an image imported with cutout, on a transparent background): a white edge round its shape, a
  // hard shadow, a slight tilt drawn from the element's id.
  paper: z.boolean().default(false),
  // One of the house frames round the picture (as on a 4:3 board), or auto: drawn from the element's id.
  frame: z.enum(["sticker", "fig", "notch", "loading", "folder", "auto"]).optional(),
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
  backdrop: z.enum(["color", "blur"]).default("blur"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "expected a #RRGGBB color").default("#F4F2ED"),
  barColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "expected a #RRGGBB color").default("#525252"),
  width: z.number().min(0.3).max(1).default(0.8),
  y: z.number().min(0).max(1).default(0.42),
  focusY: z.number().min(0).max(1).default(0.4),
  easeMs: Ms.default(300),
  // The dress around the box: a window (title bar, black outline), or a poster (the take in black and white halftone
  // in a thin frame, a big header in the caption font, rules, a pill, small labels, a barcode) on the flat colour.
  // terminal and win95: the take in its own colours with grain, in a terminal window (dark bar, three dots, the header
  // as its prompt) or an old Windows one (grey bevel, blue title bar, the header as its title, three buttons).
  // board: on a paper page with a wireframe grid and grain, pixel icons scattered, the take (in its own colours, with
  // grain) in a frame drawn from the element's id among five, or the one asked for in frame.
  chrome: z.enum(["plain", "window", "poster", "terminal", "win95", "board"]).default("plain"),
  frame: z.enum(["sticker", "fig", "notch", "loading", "folder"]).optional(),
  header: z.string().optional(),
  tag: z.string().optional(),
  footer: z.string().optional(),
});

/**
 * An important passage: its words stacked one per line (or its own lines, split by 
), huge and tight, a small
 * label above, and atoms looping around the block, spinning, starting elsewhere at each appearance.
 */
export const StackPropsSchema = z.strictObject({
  text: z.string().min(1),
  label: z.string().optional(),
  color: z.string().default("accent"),
  // The label's colour (the body's by default) and the hard outline round the letters.
  labelColor: z.string().optional(),
  // The label as plain words, or in an outlined pill.
  labelStyle: z.enum(["plain", "pill"]).default("plain"),
  outline: z.string().default("text"),
  // The creator's subtitle font by default (the passage is said, like a subtitle), or the title font.
  font: z.enum(["caption", "title"]).default("caption"),
  atoms: z.number().int().min(0).max(4).default(0),
  atomColor: z.string().default("highlight"),
  sizeScale: z.number().positive().default(1),
});

export const ARCHETYPES = ["statement", "number", "opposition", "list", "quote", "breath"] as const;
/**
 * A text card (text-only mode): text is the statement, the number, the left side of an opposition, the title of a
 * list, the quote or the one word of a breath; label is the number's label or the quote's source.
 */
export const CardPropsSchema = z.strictObject({
  archetype: z.enum(ARCHETYPES),
  text: z.string().default(""),
  label: z.string().optional(),
  against: z.string().optional(),
  items: z.array(z.string().min(1)).max(4).optional(),
});

export const KIND_SCHEMAS = {
  card: CardPropsSchema,
  "text.stack": StackPropsSchema,
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
export type StackProps = z.output<typeof StackPropsSchema>;
export type CardProps = z.input<typeof CardPropsSchema>;
export type SfxProps = z.output<typeof SfxPropsSchema>;
