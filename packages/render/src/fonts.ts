import { src } from "./lib/src";
import { loadFont } from "@remotion/fonts";
import type { RenderProps } from "./props";

const requested = new Set<string>();

/** The CSS font format, explicit so collections (.ttc) and files without an extension load after bundling. */
export function fontFormat(path: string): "truetype" | "opentype" | "collection" | "woff" | "woff2" {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  return ext === "otf" ? "opentype" : ext === "ttc" ? "collection" : ext === "woff" ? "woff" : ext === "woff2" ? "woff2" : "truetype";
}

/** The family a font file is loaded under: one per file, so two edits with other fonts never share one. */
export function familyOf(path: string): string {
  let h = 5381;
  for (let i = 0; i < path.length; i++) h = ((h * 33) ^ path.charCodeAt(i)) >>> 0;
  return `AdamFont${h.toString(36)}`;
}

/** Loads the style fonts once each; loadFont blocks the render until they are ready. Returns their families. */
export function ensureFonts(fonts: RenderProps["fonts"]): { caption: string; title: string; accent?: string } {
  for (const [path, italic] of [[fonts.caption, false], [fonts.title, false], [fonts.accent, true]] as const) {
    if (!path || requested.has(path)) continue;
    requested.add(path);
    // Remotion types list four formats; "collection" is a valid CSS format hint all the same. The accent is an italic
    // file: loaded as the italic face, so asking for italic never slants it a second time.
    void loadFont({ family: familyOf(path), url: src(path), format: fontFormat(path) as "truetype", ...(italic ? { style: "italic" } : {}) });
  }
  return {
    caption: fonts.caption ? familyOf(fonts.caption) : "AdamCaption",
    title: fonts.title ? familyOf(fonts.title) : "AdamTitle",
    ...(fonts.accent ? { accent: familyOf(fonts.accent) } : {}),
  };
}
