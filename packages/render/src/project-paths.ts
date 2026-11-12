import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

function within(root: string, file: string): boolean {
  const part = relative(root, file);
  return Boolean(part) && part !== ".." && !/^\.\.[\\/]/.test(part) && !isAbsolute(part);
}

export function realInside(root: string, target: string): string | null {
  try {
    const canonicalRoot = realpathSync.native(root);
    const canonical = realpathSync.native(target);
    return within(canonicalRoot, canonical) && !relative(canonicalRoot, canonical).includes(":") ? canonical : null;
  } catch { return null; }
}

const extensions = {
  video: /\.(mp4|mov|mkv|m4v|avi|webm)$/i,
  audio: /\.(mp3|wav|flac|aac|m4a|ogg|opus)$/i,
  image: /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i,
  lottie: /\.(json|lottie)$/i,
  font: /\.(ttf|otf|woff2?)$/i,
};

export function projectStylePath(dir: string, style: string): string {
  const path = resolve(dir, style);
  const series = process.env.ADAM_SERIES ?? join(homedir(), "AdamStudioSeries");
  const file = realInside(dir, path) ?? (isAbsolute(style) ? realInside(series, path) : null);
  if (!file || extname(file).toLowerCase() !== ".json") throw new Error("Style file is outside the project or series.");
  return file;
}

/** Keep old absolute rushes, and require external decorative assets to live in creator libraries. */
export function mediaPath(dir: string, value: string, kind: keyof typeof extensions): string {
  if (/^[\\/]{2}/.test(value) || /[:\u0000]/.test(value.replace(/^[a-z]:[\\/]/i, ""))) {
    throw new Error("Invalid media path.");
  }
  const path = resolve(dir, value);
  const internal = within(resolve(dir), path);
  if ((!isAbsolute(value) && !internal) || !extensions[kind].test(extname(path))) throw new Error("Invalid " + kind + " path.");
  if (!existsSync(path)) return path;
  const real = realpathSync.native(path);
  const externalRoots = [
    process.env.ADAM_INSPIRATION ?? join(homedir(), "AdamStudioInspiration"),
    process.env.ADAM_SERIES ?? join(homedir(), "AdamStudioSeries"),
    ...(kind === "font" ? [join(dirname(process.env.ADAM_DESKTOP_SETTINGS || join(homedir(), ".adam-studio", "ui.json")), "editor-fonts"),
      process.env.ADAM_FONTS, process.env.WINDIR && join(process.env.WINDIR, "Fonts"),
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Microsoft/Windows/Fonts"),
      process.env.ADAM_HOST_LOCALAPPDATA && join(process.env.ADAM_HOST_LOCALAPPDATA, "Microsoft/Windows/Fonts"),
      process.env.ADAM_APP_ROOT && join(process.env.ADAM_APP_ROOT, "fonts"),
      join(homedir(), ".local/share/fonts"), "/usr/share/fonts", "/Library/Fonts", "/System/Library/Fonts",
      join(homedir(), "Library/Fonts")].filter((p): p is string => Boolean(p)) : []),
  ];
  if ((!internal && kind !== "video" && !externalRoots.some((root) => realInside(root, path))) ||
      /^[\\/]{2}/.test(real) || (internal && !realInside(dir, path)) ||
      !extensions[kind].test(extname(real)) || !statSync(real).isFile()) throw new Error("Media path leaves its permitted location.");
  return real;
}
