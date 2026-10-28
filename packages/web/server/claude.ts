import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "./actions";
import { ActionError } from "./actions";
import { REPO, TSX } from "./paths";
import { rulesFor } from "./rules";
import type { ClaudeModel } from "./settings";

/** Claude Code's executable: ADAM_CLAUDE, the npm install's claude.exe on Windows, or `claude` on the PATH. */
export function claudeBin(): string {
  if (process.env.ADAM_CLAUDE) return process.env.ADAM_CLAUDE;
  const npmExe = process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe") : "";
  return npmExe && existsSync(npmExe) ? npmExe : "claude";
}

export const STEP_BRIEFS: Record<string, string> = {
  cuts: "Cuts: what stays. Remove dead air, fillers, failed takes, tangents; keep the strongest version of each idea.",
  structure: "Story: the order and the narrative framework (setStructure with beats on word ids, setStory to reorder).",
  captions: "Captions: words on screen (addCaptions; caption font and colors go through setStyle).",
  hook: "Hook: the first 3 seconds. A title at 0 ms, a tighter or reordered opening, a bold first frame.",
  beats: "Beats: what marks each change of idea (text.behindSubject with the key word, camera.zoom punch-ins, transitions).",
  visuals: "Visuals: images, HUD panels and stats, Lottie where the speech names something showable (Inspiration folder first).",
  sound: "Sound: sound effects on reveals and key cuts (search_assets kind audio, import_asset).",
  look: "Look: fonts (setStyle fonts.title / fonts.caption with family and file), colors, grade, animation speed (motion.speed).",
};

/**
 * Asks Claude Code (headless, the creator's subscription) to write one proposal for a step, through the
 * adam-studio MCP tools only. Its stream-json output is the job's log; the panel turns it into an activity feed.
 */
/** Beyond Adam Studio's tools: the connectors the creator turned on and the skills picked for this ask. */
/**
 * `mode`: "propose" writes A/B/C variants for the creator to choose from; "do" applies an explicit request directly.
 * `context`: the step's context (stepContext), sent up front so Claude does not explore the project tool by tool.
 */
export type AskExtras = { servers?: Record<string, unknown>; tools?: string[]; skills?: string[]; mode?: "do" | "propose"; context?: string; learned?: string };

// Turn caps: most of an ask's time and tokens went into exploring (26 to 80 turns, the context re-read each turn).
const MAX_TURNS = { do: 10, propose: 22 };

/** What any AI gets for an ask: the brief of the step (its rules, the look, the context) and how to answer. */
export function askBrief(project: string, step: string, prompt: string, look: string | null = null, extras: AskExtras = {}): { system: string; mode: "do" | "propose" } {
  if (!STEP_BRIEFS[step]) throw new ActionError(`unknown step "${step}"`);
  if (!prompt.trim()) throw new ActionError("write what you want first");
  const mode = extras.mode ?? "propose";
  const id = `ask.${step}.${Date.now().toString(36)}`;
  const task = mode === "do"
    ? [
      "The creator's request is explicit: apply it directly with apply_patch, update_item or set_value, no proposal.",
      "Make the smallest change that does what is asked, anchored on word ids. Do not call still, run, propose or decide: the creator watches the preview.",
    ]
    : [
      `Write exactly ONE proposal with the propose tool: id "${id}", step "${step}", two or three variants (A, B, C) that are genuinely different,`,
      "each with a label (at most 60 characters, what the creator will see), a why (what changes, where, what the viewer gets) and the patch,",
      "plus a one-sentence reason for the proposal. Labels, why and reason in the transcript's language. Anchor on word ids.",
      "search_assets / look_at / import_asset for media; look at most one still of your boldest variant. Never call decide or run.",
    ];
  const system = [
    "You are the editor inside Adam Studio, working for the creator through the adam-studio tools only.",
    `Project: "${project}" (pass it as the project argument). Current step: ${step}. ${STEP_BRIEFS[step]}`,
    ...task,
    extras.context
      ? "Everything the step needs is in the context below: call get_project, get_transcript or get_reference only if something you need is missing."
      : "Check get_project first (its proposal history holds the creator's past choices); get_reference gives the schemas.",
    // Each turn re-reads this whole brief and the tool list: fewer turns is the main saving, on every computer.
    "Work in as few turns as possible: call independent tools together in the same turn, write the whole proposal in one call, never read twice what you already have.",
    "",
    ...(extras.context ? ["# Context of the step", extras.context, ""] : []),
    rulesFor(step),
    "",
    ...(extras.learned ? [extras.learned, ""] : []),
    ...(look ? ["The video's look (it wins over generic defaults; say plainly what the renderer cannot do yet):", look, ""] : []),
    ...(extras.skills?.length ? [`The creator asked for these skills: invoke each with the Skill tool: ${extras.skills.join(", ")}.`,
      "Apply their rules through the adam-studio tools (the proposal is still written with propose); read their files when they point to them.", ""] : []),
    ...(extras.tools?.length ? [`Connected tools you may also use: ${extras.tools.join(", ")}.`, ""] : []),
    "End with ONE short plain sentence (under 30 words) for the creator, in the language of the transcript: no markdown, no ids, no list.",
  ].join("\n");
  return { system, mode };
}

/** The adam-studio MCP server, as a command any AI can start. */
export const adamServer = () => ({ command: process.execPath, args: [TSX, join(REPO, "packages", "mcp", "src", "server.ts")] });

export function askCommand(project: string, step: string, prompt: string, model: ClaudeModel = "default", look: string | null = null, extras: AskExtras = {}): Command {
  const { system, mode } = askBrief(project, step, prompt, look, extras);
  const mcp = JSON.stringify({ mcpServers: { "adam-studio": adamServer(), ...(extras.servers ?? {}) } });
  // A skill is read with Skill, then its files with Read, Glob and Grep: no shell, no writes outside the tools.
  const allowed = ["mcp__adam-studio", ...(extras.tools ?? []), ...(extras.skills?.length ? ["Skill", "Read", "Glob", "Grep"] : [])];
  return {
    cmd: claudeBin(),
    args: ["-p", prompt, "--append-system-prompt", system, ...(model === "default" ? [] : ["--model", model]), "--output-format", "stream-json", "--verbose",
      "--max-turns", String(MAX_TURNS[mode]), "--strict-mcp-config", "--mcp-config", mcp, "--allowedTools", allowed.join(","),
      // Claude Code's own tools, skill list and the user's plugin hooks weigh tens of thousands of tokens re-read
      // every turn: an ask without skills goes without them (the adam-studio tools come from --mcp-config).
      ...(extras.skills?.length ? ["--tools", "Skill,Read,Glob,Grep"] : ["--tools", "", "--disable-slash-commands", "--setting-sources", ""])],
    label: mode === "do" ? `Claude: ${step} (do)` : `Claude: ${step}`,
  };
}
