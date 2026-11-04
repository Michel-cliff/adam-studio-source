// The video's script: what the creator meant to say, part by part. Written by the creator, or drafted by the AI from
// the transcript and then edited. Kept next to project.json (script.json) and sent with every ask.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AskAI } from "./ai";
import { load, ToolError } from "./store";

export type Script = { text: string; by: "" | "you" | "ai"; at?: number };
const MAX = 30000;

export function readScript(dir: string): Script {
  try {
    const s = JSON.parse(readFileSync(join(dir, "script.json"), "utf8"));
    return { text: String(s.text ?? ""), by: s.by === "ai" ? "ai" : s.by === "you" ? "you" : "", ...(s.at ? { at: s.at } : {}) };
  } catch { return { text: "", by: "" }; }
}

export function saveScript(dir: string, text: string, by: "you" | "ai"): Script {
  const t = String(text ?? "").trim();
  if (t.length > MAX) throw new ToolError(`the script is too long (${t.length} characters, ${MAX} at most)`);
  const s: Script = { text: t, by, at: Date.now() };
  writeFileSync(join(dir, "script.json"), `${JSON.stringify(s, null, 2)}\n`);
  return s;
}

/** The AI writes the script from what is said in the edit, part by part, in the transcript's language. */
export async function draftScript(dir: string, ai: AskAI, signal?: AbortSignal): Promise<Script> {
  const { project } = load(dir);
  const said = Object.values(project.transcript.words).flat().map((w) => w.text).join(" ").trim();
  if (!said) throw new ToolError("no transcript yet: analyze the takes first");
  const text = await ai({ prompt: [
    "Here is what a creator says in a short talking-head video (automatic transcript, may contain retakes and fillers).",
    "Write its script as the creator meant it: the parts in order (HOOK, PROBLEM, STEPS or STORY, TWIST if any, CALL TO ACTION),",
    "each part as an uppercase heading line followed by one to three clean sentences in the creator's own words and language.",
    "Drop retakes, fillers and false starts; do not add ideas they do not say. Plain text only, no markdown, no commentary.",
    "", said.slice(0, 12000),
  ].join("\n"), signal });
  signal?.throwIfAborted();
  return saveScript(dir, text.replace(/^```\w*\n?|```$/g, "").trim(), "ai");
}
