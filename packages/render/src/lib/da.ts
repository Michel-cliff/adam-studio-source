// The creator's own art direction (the guided path of the default art direction): five steps, each saved as soon as it
// is chosen, in ~/.adam-studio/da.json. It applies to every video as a style layer between the derived defaults (under
// it) and a video's own settings (over it), and sets the first pass (pauses, caption density). The don'ts go to the
// rules Adam already learns, not here.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { deepMerge, type Plain, type Project } from "@adam-studio/model";

// No rhythm step: Adam never cuts the footage, it comes already cut.
export const DA_STEPS = ["accent", "captions", "motion", "typography", "donts"] as const;
export type DaStep = (typeof DA_STEPS)[number];

export const CHOICES = {
  captions: ["bold", "clean", "minimal"],
  motion: ["none", "light", "default"],
  typography: ["anton", "serif", "manrope"],
} as const;

export type CreatorDA = {
  foundation?: "editorial";
  notes?: string;
  dontsText?: string;
  reference?: { summary: string; guidance: string[]; uncertainties: string[]; sources: { id: string; name: string }[]; analysedAt: string };
  accent?: string;
  captions?: (typeof CHOICES.captions)[number];
  motion?: (typeof CHOICES.motion)[number];
  typography?: (typeof CHOICES.typography)[number];
  /** A font of the creator's own for the captions, over the pair of the typography step (titles keep theirs). */
  captionFont?: { family: string; file: string };
  /** One colour per video, drawn from PALETTE (the blocks of titles and captions, the page of a 4:3 board). */
  rotate?: boolean;
  /** The colour each video was given, in the order they were given. */
  colors?: Record<string, string>;
  /** The don'ts were written (they live in the learned rules). */
  donts?: boolean;
  /** Videos after which the path was offered, to stop offering after three untouched. */
  offered?: string[];
};

// Several art directions: "default" lives in da.json (the first one, as before), the others in das/<name>.json; the
// active one's name in da-active.json. Everything reads and writes the active one.
const ACTIVE = "da-active.json";
const validName = (name: string) => name === "default" || Boolean(name.trim() === name && name.length && name.length <= 40 && !/[\\/:*?"<>|.]/.test(name));
const pathOf = (dir: string, name: string) => (name === "default" ? join(dir, "da.json") : join(dir, "das", `${name}.json`));
function activeName(dir: string): string {
  try {
    const name = String(JSON.parse(readFileSync(join(dir, ACTIVE), "utf8")).name ?? "default");
    return validName(name) && (existsSync(pathOf(dir, name)) || name === "default") ? name : "default";
  } catch { return "default"; }
}
const file = (dir: string) => pathOf(dir, activeName(dir));

/** The art directions there are, and the active one. */
export function listDAs(dir: string): { active: string; names: string[] } {
  let others: string[] = [];
  try { others = readdirSync(join(dir, "das")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort((a, b) => a.localeCompare(b)); } catch { /* none yet */ }
  return { active: activeName(dir), names: ["default", ...others] };
}

/** Makes an art direction the active one. */
export function useDA(dir: string, name: string): void {
  if (!validName(name) || (name !== "default" && !existsSync(pathOf(dir, name)))) throw new Error(`no art direction named "${name}"`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ACTIVE), `${JSON.stringify({ name })}\n`);
}

/** A new art direction, blank or a copy of the active one, made active. */
export function newDA(dir: string, name: string, copy: boolean): void {
  const n = name.trim();
  if (!n || n.length > 40 || /[\\/:*?"<>|.]/.test(n) || n === "default") throw new Error(`not a valid art direction name: "${name}"`);
  if (existsSync(pathOf(dir, n))) throw new Error(`an art direction named "${n}" exists`);
  const from: CreatorDA = copy ? readDA(dir) : { foundation: "editorial" };
  mkdirSync(join(dir, "das"), { recursive: true });
  writeFileSync(pathOf(dir, n), `${JSON.stringify(from, null, 2)}\n`);
  useDA(dir, n);
}

export function readDA(dir: string): CreatorDA {
  try { return JSON.parse(readFileSync(file(dir), "utf8")) as CreatorDA; } catch { return {}; }
}

export function saveDA(dir: string, da: CreatorDA): CreatorDA {
  mkdirSync(dirname(file(dir)), { recursive: true });
  writeFileSync(file(dir), `${JSON.stringify(da, null, 2)}\n`);
  return da;
}

/** Saves one step (null: back to the derived default). */
export function setStep(dir: string, step: DaStep, value: string | boolean | null): CreatorDA {
  const da = readDA(dir);
  if (value === null) { delete da[step]; return saveDA(dir, da); }
  if (step === "accent") {
    if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) throw new Error("the accent is a colour like #5AC576");
    da.accent = value.toUpperCase();
  } else if (step === "donts") {
    da.donts = true;
  } else {
    const allowed = CHOICES[step] as readonly string[];
    if (!allowed.includes(String(value))) throw new Error(`the ${step} is one of ${allowed.join(", ")}`);
    (da as Record<string, unknown>)[step] = value;
  }
  return saveDA(dir, da);
}

/** Records that the path was offered after a video; returns whether it may still be offered. */
export function offerAfter(dir: string, video: string): boolean {
  const da = readDA(dir);
  if (DA_STEPS.some((s) => da[s] !== undefined)) return !DA_STEPS.every((s) => da[s] !== undefined);
  const offered = [...new Set([...(da.offered ?? []), video])];
  saveDA(dir, { ...da, offered });
  // Three videos without a single step: the creator is happy with the default; the path stays in the panel.
  return offered.length <= 3;
}

/** The six lines of the panel: derived, or set by the creator. */
export function daStatus(da: CreatorDA): { step: DaStep; set: boolean }[] {
  return DA_STEPS.map((step) => ({ step, set: da[step] !== undefined }));
}

/** Where the house fonts are installed for this user. */
export function fontsDir(): string {
  if (process.platform === "win32") return join(process.env.ADAM_HOST_LOCALAPPDATA || process.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts");
  if (process.platform === "darwin") return join(homedir(), "Library", "Fonts");
  return join(homedir(), ".local", "share", "fonts");
}

const PAIRS = {
  anton: { title: ["Anton", "Anton-Regular.ttf"], caption: ["Manrope", "Manrope-Variable.ttf"] },
  serif: { title: ["DM Serif Display", "DMSerifDisplay-Regular.ttf"], caption: ["Manrope", "Manrope-Variable.ttf"] },
  manrope: { title: ["Manrope", "Manrope-Variable.ttf"], caption: ["Manrope", "Manrope-Variable.ttf"] },
} as const;

/** The style layer of the art direction. */
export function daStyle(da: CreatorDA, fonts = fontsDir()): Plain {
  const out: Plain = da.foundation === "editorial" ? {
    textLayout: "thirds",
    motion: { stable: true, speed: 0.8 },
    fx: { grain: 0, scanlines: { window: 0, burst: 0, burstFrames: 3 }, zoomBlur: 8 },
    caption: { size: 0.0445, intro: "none", maxCharsPerLine: 32 },
    slots: { "9:16": { caption: { x: 0.5, y: 0.76 }, title: { x: 0.5, y: 0.15 }, center: { x: 0.5, y: 0.43 } } },
  } : {};
  if (da.foundation === "editorial") {
    const title = join(fonts, "Anton-Regular.ttf"), caption = join(fonts, "Manrope-Variable.ttf");
    if (existsSync(title) && existsSync(caption)) out.fonts = { title: { family: "Anton", file: title }, caption: { family: "Manrope", file: caption } };
  }
  if (da.accent) out.colors = { highlight: da.accent, accent: da.accent };
  if (da.captions) {
    out.caption = { size: { bold: 0.062, clean: 0.052, minimal: 0.046 }[da.captions] };
    // Minimal: no highlighted word, the highlight takes the text colour.
    if (da.captions === "minimal") out.colors = { ...(out.colors as Plain | undefined), highlight: "#FFFFFF" };
  }
  if (da.motion) out.motion = { ...(out.motion as Plain | undefined), push: { none: 0, light: 0.006, default: 0.012 }[da.motion] };
  if (da.typography) {
    const p = PAIRS[da.typography];
    out.fonts = { title: { family: p.title[0], file: join(fonts, p.title[1]) }, caption: { family: p.caption[0], file: join(fonts, p.caption[1]) } };
  }
  if (da.captionFont) out.fonts = { ...(out.fonts as Plain | undefined), caption: { family: da.captionFont.family, file: da.captionFont.file } };
  return out;
}

/** The project with the art direction under its own settings. */
export function withDA(project: Project, da: CreatorDA, fonts = fontsDir()): Project {
  const layer = daStyle(da, fonts);
  if (!Object.keys(layer).length) return project;
  return { ...project, styleOverrides: deepMerge(layer, project.styleOverrides as Plain) as Project["styleOverrides"] };
}

/** The first pass under the art direction: the caption density of its style. */
export function daFirstPass(da: CreatorDA): { maxWords: number; maxChars: number } {
  const density = da.captions === "bold" ? [3, 24] : [5, 32];
  return { maxWords: density[0]!, maxChars: density[1]! };
}

/** The colours a video can be given when the creator chose rotation: cream, forest green, royal blue, tomato, mustard, ink. */
export const PALETTE = ["#EDE3CF", "#1E5B2F", "#1F4FA8", "#C0261D", "#EFA020", "#141412"];

/** A video's colour: the one it was given, or one drawn from its name, never the colour of the video before. */
export function videoColor(dir: string, video: string): string {
  const da = readDA(dir);
  const given = da.colors ?? {};
  if (given[video]) return given[video]!;
  const last = Object.values(given).at(-1);
  const pool = PALETTE.filter((c) => c !== last);
  let h = 2166136261;
  for (const ch of video) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const color = pool[(h >>> 0) % pool.length]!;
  saveDA(dir, { ...da, colors: { ...given, [video]: color } });
  return color;
}

/** The project with the creator's art direction under its own settings, and its colour of the set when they rotate. */
export function withVideoDA(project: Project, dir: string, fonts = fontsDir()): Project {
  const da = readDA(dir);
  const out = withDA(project, da, fonts);
  if (!da.rotate || da.accent) return out;
  const c = videoColor(dir, project.name);
  return { ...out, styleOverrides: deepMerge({ colors: { highlight: c, accent: c } }, out.styleOverrides as Plain) as Project["styleOverrides"] };
}

/** Remove a custom profile recoverably. Reference videos and projects may be shared with other profiles. */
export function deleteDA(dir: string, name: string): void {
  if (name === "default") throw new Error("The default art direction cannot be deleted.");
  if (!validName(name) || !listDAs(dir).names.includes(name)) throw new Error("No such art direction.");
  const active = activeName(dir) === name;
  const trash = join(dir, "da-trash"); mkdirSync(trash, { recursive: true });
  renameSync(pathOf(dir, name), join(trash, `${randomUUID()}.json`));
  if (active) useDA(dir, "default");
}
