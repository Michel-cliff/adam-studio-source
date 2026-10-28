import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "./actions";
import { adamServer, askBrief, type AskExtras } from "./claude";
import type { Usage } from "./usage";

/** Codex CLI's executable: ADAM_CODEX, the npm install's codex.exe on Windows, or `codex` on the PATH. */
export function codexBin(): string {
  if (process.env.ADAM_CODEX) return process.env.ADAM_CODEX;
  const npm = process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex") : "";
  const exe = npm && ["win32-x64", "win32-arm64"].map((p) => join(npm, "node_modules", "@openai", `codex-${p}`, "vendor", p === "win32-x64" ? "x86_64-pc-windows-msvc" : "aarch64-pc-windows-msvc", "bin", "codex.exe")).find(existsSync);
  return exe || "codex";
}

/** Whether a command can be started: an existing file, or a name the PATH resolves. */
export function installed(bin: string): boolean {
  if (/[\\/]/.test(bin)) return existsSync(bin);
  try { execFileSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "ignore", windowsHide: true }); return true; } catch { return false; }
}

// Values of -c overrides are TOML: strings and arrays of strings, quoted as JSON (a subset of TOML for these).
const toml = (v: unknown) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(String(x))).join(", ")}]` : JSON.stringify(String(v)));

function serverArgs(name: string, s: Record<string, any>): string[] {
  const out: string[] = [];
  const set = (k: string, v: unknown) => out.push("-c", `mcp_servers.${name}.${k}=${toml(v)}`);
  if (typeof s.url === "string") set("url", s.url);
  else if (typeof s.command === "string") {
    set("command", s.command);
    if (Array.isArray(s.args)) set("args", s.args);
    for (const [k, v] of Object.entries(s.env ?? {})) out.push("-c", `mcp_servers.${name}.env.${k}=${toml(v)}`);
  }
  return out;
}

/**
 * Asks Codex CLI (headless, the creator's ChatGPT sign-in or OpenAI key) the same thing as Claude: the step's brief
 * and the request in one prompt, the adam-studio tools over MCP, read-only for anything else, never waiting for approval.
 */
export function codexAskCommand(project: string, step: string, prompt: string, model = "default", look: string | null = null, extras: AskExtras = {}): Command {
  const { system, mode } = askBrief(project, step, prompt, look, { ...extras, skills: [] });
  const servers = { "adam-studio": adamServer(), ...(extras.servers ?? {}) } as Record<string, Record<string, any>>;
  return {
    cmd: codexBin(),
    args: ["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "-c", 'approval_policy="never"',
      ...Object.entries(servers).flatMap(([n, s]) => serverArgs(n, s)),
      ...(model === "default" ? [] : ["-m", model]),
      `${system}\n\n# The creator's request\n${prompt}`],
    label: mode === "do" ? `Codex: ${step} (do)` : `Codex: ${step}`,
  };
}

/** The tokens of one Codex run, from its JSON events (Codex reports no price); null when no turn completed. */
export function parseCodexUsage(output: string): Usage | null {
  let input = 0, out = 0, done = false;
  for (const line of output.split("\n")) {
    if (!line.startsWith("{")) continue;
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "turn.completed") { done = true; input += e.usage?.input_tokens ?? 0; out += e.usage?.output_tokens ?? 0; }
  }
  return done ? { costUsd: 0, tokens: { input, output: out }, model: null, durationMs: null, limits: null } : null;
}
