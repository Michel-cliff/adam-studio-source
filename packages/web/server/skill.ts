// The adam-studio Claude Code skill (skills/adam-studio in the repo): its editing rules are generated from rules.ts,
// the same text the studio sends to Claude, so the skill and the studio never drift apart. `npm run skill` writes
// the file and installs the skill in ~/.claude/skills/adam-studio.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { REPO } from "./paths";
import { GENERAL_RULES, STEP_RULES } from "./rules";

const STEP_ORDER = ["cuts", "structure", "captions", "hook", "beats", "visuals", "sound", "look"];

export function editingRulesMarkdown(): string {
  const steps = STEP_ORDER.filter((s) => STEP_RULES[s]).map((s) => STEP_RULES[s]!);
  return [
    "# Editing rules",
    "",
    "Generated from packages/web/server/rules.ts (`npm run skill`): the rules the studio sends with every request.",
    "Distilled from open-source editing skills (cut-video, favstash, ghost-editor, claude-shorts, naive-video-skill,",
    "claude-youtube-editor; MIT and Apache-2.0), credited in rules.ts.",
    "",
    "## General",
    "",
    GENERAL_RULES,
    "",
    "## Per step",
    "",
    steps.join("\n\n"),
    "",
  ].join("\n");
}

export const SKILL_DIR = join(REPO, "skills", "adam-studio");

/** Writes the generated rules into the repo's skill, then copies the skill to Claude Code's user skills. */
export function buildSkill(home = homedir()): { repo: string; installed: string } {
  writeFileSync(join(SKILL_DIR, "references", "editing-rules.md"), editingRulesMarkdown());
  const installed = join(home, ".claude", "skills", "adam-studio");
  rmSync(installed, { recursive: true, force: true });
  mkdirSync(installed, { recursive: true });
  cpSync(SKILL_DIR, installed, { recursive: true });
  return { repo: SKILL_DIR, installed };
}

if (process.argv[1] && /skill\.ts$/.test(process.argv[1])) {
  const r = buildSkill();
  console.log(`adam-studio skill written in ${r.repo} and installed in ${r.installed}`);
}
