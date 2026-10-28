// The creator's own API keys for the AI (Anthropic, OpenAI), kept in ~/.adam-studio/.env on this computer only and
// handed to Claude Code or Codex when they start. A key, when set, is used before any subscription sign-in.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VARS = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" } as const;
export type Provider = keyof typeof VARS;

function read(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    for (const line of readFileSync(join(dir, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out.set(m[1]!, m[2]!.replace(/^["']|["']$/g, ""));
    }
  } catch { /* no file yet */ }
  return out;
}

/** Which keys are set, shown as their last four characters only. */
export function keyStatus(dir: string): Record<Provider, string | null> {
  const env = read(dir);
  const show = (v?: string) => (v ? `…${v.slice(-4)}` : null);
  return { anthropic: show(env.get(VARS.anthropic)), openai: show(env.get(VARS.openai)) };
}

/** Sets or (with "") removes a key; other lines of the file are kept as they are. */
export function setKey(dir: string, provider: Provider, value: string): void {
  const v = value.trim();
  if (v && provider === "anthropic" && !/^sk-ant-[\w-]{20,}$/.test(v)) throw new Error("an Anthropic key starts with sk-ant-");
  if (v && provider === "openai" && !/^sk-[\w-]{20,}$/.test(v)) throw new Error("an OpenAI key starts with sk-");
  const name = VARS[provider];
  let lines: string[] = [];
  try { lines = readFileSync(join(dir, ".env"), "utf8").split(/\r?\n/).filter((l) => !new RegExp(`^\\s*${name}\\s*=`).test(l)); } catch { /* new file */ }
  if (v) lines.push(`${name}=${v}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".env"), `${lines.filter((l, i) => l || i < lines.length - 1).join("\n").trim()}\n`, { mode: 0o600 });
}

/** The environment the AI's command starts with: the keys that are set (Codex reads either name). */
export function aiEnv(dir: string): Record<string, string> {
  const env = read(dir), out: Record<string, string> = {};
  const a = env.get(VARS.anthropic), o = env.get(VARS.openai);
  if (a) out.ANTHROPIC_API_KEY = a;
  if (o) { out.OPENAI_API_KEY = o; out.CODEX_API_KEY = o; }
  return out;
}
