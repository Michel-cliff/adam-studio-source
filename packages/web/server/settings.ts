import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

export const SETTINGS_FILE = join(homedir(), ".adam-studio", "ui.json");
/** The models Claude Code accepts by alias; "default" leaves Claude Code's own choice. */
export const CLAUDE_MODELS = ["default", "opus", "sonnet", "haiku"] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

function read(file: string): Record<string, unknown> {
  try { const s = JSON.parse(readFileSync(file, "utf8")); return s && typeof s === "object" ? s : {}; } catch { return {}; }
}
function write(file: string, patch: Record<string, unknown>): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...read(file), ...patch }, null, 2)}\n`);
}

export function projectsRoot(file = SETTINGS_FILE): string {
  const s = read(file);
  if (typeof s.projectsRoot === "string" && s.projectsRoot) return s.projectsRoot;
  return process.env.ADAM_PROJECTS ?? join(homedir(), "AdamStudioProjects");
}

export function setProjectsRoot(root: string, file = SETTINGS_FILE): void {
  if (!isAbsolute(root)) throw new Error(`the projects folder must be an absolute path, got "${root}"`);
  write(file, { projectsRoot: root });
}

/** The look (Inspiration/looks/<name>) applied to every video; "" for none. Editorial archival unless changed. */
export function lookName(file = SETTINGS_FILE): string {
  const l = read(file).look;
  return typeof l === "string" ? l : "editorial-archival";
}

export function setLookName(name: string, file = SETTINGS_FILE): void {
  write(file, { look: name });
}

export function claudeModel(file = SETTINGS_FILE): ClaudeModel {
  const m = read(file).claudeModel;
  return CLAUDE_MODELS.includes(m as ClaudeModel) ? (m as ClaudeModel) : "default";
}

export function setClaudeModel(model: string, file = SETTINGS_FILE): void {
  if (!CLAUDE_MODELS.includes(model as ClaudeModel)) throw new Error(`model must be one of ${CLAUDE_MODELS.join(", ")}`);
  write(file, { claudeModel: model });
}

/** The AI the studio asks: Claude Code or Codex CLI, whichever the creator has. */
export const ENGINES = ["claude", "codex"] as const;
export type Engine = (typeof ENGINES)[number];

export function engine(file = SETTINGS_FILE): Engine {
  const e = read(file).engine;
  return ENGINES.includes(e as Engine) ? (e as Engine) : "claude";
}

export function setEngine(e: string, file = SETTINGS_FILE): void {
  if (!ENGINES.includes(e as Engine)) throw new Error(`the AI must be one of ${ENGINES.join(", ")}`);
  write(file, { engine: e });
}

/** Codex's model: "default" leaves Codex's own choice; otherwise a model name as Codex knows it. */
export function codexModel(file = SETTINGS_FILE): string {
  const m = read(file).codexModel;
  return typeof m === "string" && /^[\w.:-]+$/.test(m) ? m : "default";
}

export function setCodexModel(model: string, file = SETTINGS_FILE): void {
  if (!/^[\w.:-]+$/.test(model)) throw new Error(`not a model name: "${model}"`);
  write(file, { codexModel: model });
}

export const MODES = ["steps", "auto"] as const;
export type Mode = (typeof MODES)[number];

/** How the studio runs: step by step (the creator decides each step), or auto (every step runs, then the render). */
export function studioMode(file = SETTINGS_FILE): Mode {
  const m = read(file).mode;
  return MODES.includes(m as Mode) ? (m as Mode) : "steps";
}

export function setStudioMode(m: string, file = SETTINGS_FILE): void {
  if (!MODES.includes(m as Mode)) throw new Error(`the mode must be one of ${MODES.join(", ")}`);
  write(file, { mode: m });
}

export const LANGS = ["en", "fr"] as const;
export type UiLang = (typeof LANGS)[number];

/** The language of the creator's interface when they ask: what Adam writes for them follows it. */
export function uiLang(file = SETTINGS_FILE): UiLang {
  const l = read(file).lang;
  return LANGS.includes(l as UiLang) ? (l as UiLang) : "en";
}

export function setUiLang(l: string, file = SETTINGS_FILE): void {
  if (!LANGS.includes(l as UiLang)) throw new Error(`the language must be one of ${LANGS.join(", ")}`);
  write(file, { lang: l });
}
