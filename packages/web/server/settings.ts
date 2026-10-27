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
