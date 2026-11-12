import { z } from "zod";
import { FormatSchema } from "./project";

const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "expected a #RRGGBB color");
const Signed = z.number().min(-1).max(1);
const Point = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export const FR_FILLERS = ["euh", "heu", "bah", "ben", "du coup", "en fait"];
/** Filler words by transcript language (Whisper codes). */
export const FILLERS: Record<string, string[]> = {
  fr: FR_FILLERS,
  en: ["um", "uh", "erm", "like", "you know", "i mean", "basically"],
  es: ["eh", "este", "o sea", "pues", "bueno"],
  de: ["äh", "ähm", "also", "halt", "sozusagen"],
  it: ["ehm", "cioè", "tipo", "allora", "praticamente"],
  pt: ["é", "tipo", "né", "então", "assim"],
};

export const FontSchema = z.strictObject({
  family: z.string().min(1),
  file: z.string().min(1),
  capcutResourceId: z.string().optional(),
});

export const StyleSchema = z.strictObject({
  name: z.string().min(1),
  textLayout: z.enum(["thirds", "free"]).optional(),
  // accent: an italic serif for the important word of a caption (highlightAs "serif") and the connector of a title.
  fonts: z.strictObject({ caption: FontSchema, title: FontSchema, accent: FontSchema.optional() }),
  colors: z.strictObject({ text: Hex, highlight: Hex, accent: Hex, ink: Hex }),
  grade: z
    .strictObject({
      warmth: Signed.default(0),
      contrast: Signed.default(0),
      saturation: Signed.default(0),
      brightness: Signed.default(0),
      vignette: z.number().min(0).max(1).default(0),
    })
    .default({ warmth: 0, contrast: 0, saturation: 0, brightness: 0, vignette: 0 }),
  // The inserts' own treatment (image elements), apart from the presenter's grade: black and white, grain, bloom.
  inserts: z
    .strictObject({
      bw: z.number().min(0).max(1).default(0),
      grain: z.number().min(0).max(1).default(0),
      bloom: z.number().min(0).max(1).default(0),
    })
    .default({ bw: 0, grain: 0, bloom: 0 }),
  // Screen effects over the footage: a fine grain drawn anew each frame, CRT scanlines (a level while a 4:3 window is on screen, and a short
  // burst when a zoom lands, a 4:3 window lands or an inserted video opens), and a blur on the move of a zoom (px at 1080 wide).
  fx: z
    .strictObject({
      grain: z.number().min(0).max(1).default(0),
      scanlines: z
        .strictObject({
          window: z.number().min(0).max(1).default(0),
          burst: z.number().min(0).max(1).default(0),
          burstFrames: z.number().int().min(1).max(30).default(3),
        })
        .default({ window: 0, burst: 0, burstFrames: 3 }),
      zoomBlur: z.number().min(0).max(40).default(0),
    })
    .default({ grain: 0, scanlines: { window: 0, burst: 0, burstFrames: 3 }, zoomBlur: 0 }),
  caption: z.strictObject({
    size: z.number().positive(),
    stroke: z.number().min(0).default(0.08),
    shadow: z.boolean().default(true),
    maxCharsPerLine: z.number().int().positive().default(22),
    intro: z.string().default("miniZoom"),
    // The important word: in the highlight colour, on a block of it (like the key word of a title), or in the accent
    // italic serif and the highlight colour (the switch reads by its shape, not only its colour).
    highlightAs: z.enum(["color", "block", "serif"]).default("color"),
  }),
  /** Animation speed of every effect: 1 as designed, below 1 slower (0.7 = 30% slower), above 1 faster. */
  motion: z.strictObject({
    speed: z.number().min(0.25).max(3).default(1),
    stable: z.boolean().default(true),
    // The default push of face-camera shots, per second (0.012 when not set, 0 for none).
    push: z.number().min(0).max(0.03).optional(),
  }).default({ speed: 1, stable: true }),
  /** Filler words checked by lint, by transcript language. */
  fillers: z.record(z.string(), z.array(z.string())).default(FILLERS),
  slots: z.record(FormatSchema, z.record(z.string(), Point)),
  lint: z.record(
    FormatSchema,
    z.strictObject({
      minDurationMs: z.number().int().nonnegative(),
      maxDurationMs: z.number().int().positive(),
      maxPauseMs: z.number().int().positive().default(350),
      /** Overrides the language list for this format. */
      fillers: z.array(z.string()).optional(),
    }),
  ),
});

export type Style = z.output<typeof StyleSchema>;
export type StyleInput = z.input<typeof StyleSchema>;
