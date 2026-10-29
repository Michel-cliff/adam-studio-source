// The creator's own art direction (the guided path of the default art direction): six steps, each saved as soon as it
// is chosen, in ~/.adam-studio/da.json. It applies to every video as a style layer between the derived defaults (under
// it) and a video's own settings (over it), and sets the first pass (pauses, caption density). The don'ts go to the
// rules Adam already learns, not here.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { deepMerge, type Plain, type Project } from "@adam-studio/model";

export const DA_STEPS = ["accent", "captions", "rhythm", "motion", "typography", "donts"] as const;
export type DaStep = (typeof DA_STEPS)[number];

export const CHOICES = {
  captions: ["bold", "clean", "minimal"],
  rhythm: ["calm", "standard", "tight"],
  motion: ["none", "light", "default"],
  typography: ["anton", "serif", "manrope"],
} as const;

export type CreatorDA = {
  accent?: string;
  captions?: (typeof CHOICES.captions)[number];
  rhythm?: (typeof CHOICES.rhythm)[number];
  motion?: (typeof CHOICES.motion)[number];
  typography?: (typeof CHOICES.typography)[number];
  /** The don'ts were written (they live in the learned rules). */
  donts?: boolean;
  /** Videos after which the path was offered, to stop offering after three untouched. */
  offered?: string[];
};

const file = (dir: string) => join(dir, "da.json");

export function readDA(dir: string): CreatorDA {
  try { return JSON.parse(readFileSync(file(dir), "utf8")) as CreatorDA; } catch { return {}; }
}

function writeDA(dir: string, da: CreatorDA): CreatorDA {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file(dir), `${JSON.stringify(da, null, 2)}\n`);
  return da;
}

/** Saves one step (null: back to the derived default). */
export function setStep(dir: string, step: DaStep, value: string | boolean | null): CreatorDA {
  const da = readDA(dir);
  if (value === null) { delete da[step]; return writeDA(dir, da); }
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
  return writeDA(dir, da);
}

/** Records that the path was offered after a video; returns whether it may still be offered. */
export function offerAfter(dir: string, video: string): boolean {
  const da = readDA(dir);
  if (DA_STEPS.some((s) => da[s] !== undefined)) return !DA_STEPS.every((s) => da[s] !== undefined);
  const offered = [...new Set([...(da.offered ?? []), video])];
  writeDA(dir, { ...da, offered });
  // Three videos without a single step: the creator is happy with the default; the path stays in the panel.
  return offered.length <= 3;
}

/** The six lines of the panel: derived, or set by the creator. */
export function daStatus(da: CreatorDA): { step: DaStep; set: boolean }[] {
  return DA_STEPS.map((step) => ({ step, set: da[step] !== undefined }));
}

/** Where the house fonts are installed for this user. */
export function fontsDir(): string {
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Windows", "Fonts");
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
  const out: Plain = {};
  if (da.accent) out.colors = { highlight: da.accent, accent: da.accent };
  if (da.captions) {
    out.caption = { size: { bold: 0.062, clean: 0.052, minimal: 0.046 }[da.captions] };
    // Minimal: no highlighted word, the highlight takes the text colour.
    if (da.captions === "minimal") out.colors = { ...(out.colors as Plain | undefined), highlight: "#FFFFFF" };
  }
  if (da.motion) out.motion = { push: { none: 0, light: 0.006, default: 0.012 }[da.motion] };
  if (da.typography) {
    const p = PAIRS[da.typography];
    out.fonts = { title: { family: p.title[0], file: join(fonts, p.title[1]) }, caption: { family: p.caption[0], file: join(fonts, p.caption[1]) } };
  }
  return out;
}

/** The project with the art direction under its own settings. */
export function withDA(project: Project, da: CreatorDA, fonts = fontsDir()): Project {
  const layer = daStyle(da, fonts);
  if (!Object.keys(layer).length) return project;
  return { ...project, styleOverrides: deepMerge(layer, project.styleOverrides as Plain) as Project["styleOverrides"] };
}

/** The first pass under the art direction: the pauses of its rhythm, the caption density of its style. */
export function daFirstPass(da: CreatorDA): { pauseOverMs: number; pauseKeepMs: number; maxWords: number; maxChars: number } {
  const pause = { calm: [900, 400], standard: [600, 250], tight: [400, 150] }[da.rhythm ?? "standard"];
  const density = da.captions === "bold" ? [3, 24] : [5, 32];
  return { pauseOverMs: pause[0]!, pauseKeepMs: pause[1]!, maxWords: density[0]!, maxChars: density[1]! };
}
