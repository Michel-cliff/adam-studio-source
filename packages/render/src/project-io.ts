import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseProject, parseStyle, type FieldError, type Project, type Style } from "@adam-studio/model";

import { projectStylePath, realInside } from "./project-paths";

export class CliError extends Error {}

export function formatErrors(file: string, errors: FieldError[]): string {
  return `${file} is invalid:\n${errors.map((e) => `- ${e.path}: ${e.message}`).join("\n")}`;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new CliError(`cannot read ${path}: ${(e as Error).message}`);
  }
}

export function loadProject(projectDir: string): { dir: string; project: Project; style: Style } {
  const dir = resolve(projectDir);
  const file = realInside(dir, join(dir, "project.json"));
  if (!file) throw new CliError("Project file is missing or outside the project folder.");
  const p = parseProject(readJson(file));
  if (!p.ok) throw new CliError(formatErrors("project.json", p.errors));
  const stylePath = projectStylePath(dir, p.value.style);
  const s = parseStyle(readJson(stylePath));
  if (!s.ok) throw new CliError(formatErrors(p.value.style, s.errors));
  return { dir, project: p.value, style: s.value };
}

export function saveProject(dir: string, project: Project): void {
  writeFileSync(join(dir, "project.json"), `${JSON.stringify(project, null, 2)}\n`);
}
