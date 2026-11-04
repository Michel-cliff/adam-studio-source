// One question to the AI the creator picked, outside the edit: the statistics chat, a stats screenshot to read,
// a reference to describe. No adam-studio tools; pictures are read from disk (Claude's Read tool, Codex's -i).
import { spawn, spawnSync } from "node:child_process";
import { claudeBin } from "./claude";
import { codexBin } from "./codex";
import { readEvent } from "../app/feed";
import type { Engine } from "./settings";

export type AskAI = (q: { prompt: string; images?: string[]; signal?: AbortSignal }) => Promise<string>;

/** The command line for one plain question; exported for the tests. */
export function aiCommand(engine: Engine, model: string, prompt: string, images: string[] = []): { cmd: string; args: string[] } {
  if (engine === "codex") {
    return { cmd: codexBin(), args: ["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "-c", 'approval_policy="never"',
      ...(model === "default" ? [] : ["-m", model]), ...images.flatMap((i) => ["-i", i]),
      // -i takes several files: without the separator Codex swallows the prompt as one more image ("No prompt provided").
      ...(images.length ? ["--"] : []), prompt] };
  }
  const see = images.length ? `\n\nRead these files first with the Read tool:\n${images.map((i) => `- ${i}`).join("\n")}` : "";
  return { cmd: claudeBin(), args: ["-p", prompt + see, "--output-format", "stream-json", "--verbose", ...(model === "default" ? [] : ["--model", model]),
    "--max-turns", String(images.length ? images.length + 3 : 2), "--disable-slash-commands", "--setting-sources", "",
    ...(images.length ? ["--tools", "Read", "--allowedTools", "Read"] : ["--tools", ""])] };
}

/** What the AI said last, from its event stream (both formats). */
export function lastSaid(output: string): string {
  let say = "";
  for (const line of output.split("\n")) {
    if (!line.startsWith("{")) continue;
    try { const r = readEvent(JSON.parse(line)); if (r.say) say = r.say; } catch { /* not an event */ }
  }
  return say;
}

/** The first JSON object in a text (the AI may wrap it in prose or a code fence). */
export function jsonIn<T>(text: string): T | null {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as T; } catch { return null; }
}

export function aiRunner(engine: () => Engine, model: () => string, timeoutMs = 240_000, env: () => Record<string, string> = () => ({})): AskAI {
  return ({ prompt, images = [], signal }) => new Promise((done, fail) => {
    if (signal?.aborted) { fail(signal.reason); return; }
    const { cmd, args } = aiCommand(engine(), model(), prompt, images);
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32", env: { ...process.env, ...env() } });
    let out = "", err = "";
    const terminate = () => {
      if (!p.pid) return;
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true });
      else { try { process.kill(-p.pid, "SIGTERM"); } catch { p.kill(); } }
    };
    const abort = () => { terminate(); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const kill = setTimeout(() => { terminate(); fail(new Error("the AI took too long to answer")); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(kill); signal?.removeEventListener("abort", abort); fail(new Error(`could not start the AI: ${e.message}`)); });
    p.on("close", () => {
      clearTimeout(kill); signal?.removeEventListener("abort", abort);
      if (signal?.aborted) { fail(signal.reason); return; }
      // lastSaid keeps the whole answer here: the feed's short form is for the activity line only.
      const full = fullAnswer(out);
      if (full) done(full); else fail(new Error(lastSaid(out) || err.trim().split("\n").pop() || "the AI gave no answer"));
    });
  });
}

/** The whole final answer (Claude's result, or Codex's last message), not shortened. */
export function fullAnswer(output: string): string {
  let text = "";
  for (const line of output.split("\n")) {
    if (!line.startsWith("{")) continue;
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "result" && !e.is_error && typeof e.result === "string") text = e.result;
    if (e.type === "item.completed" && e.item?.type === "agent_message") text = String(e.item.text ?? "");
  }
  return text.trim();
}
