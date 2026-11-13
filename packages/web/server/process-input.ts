import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "./actions";

/** Keep large requests off Windows command lines and close stdin after the one request. */
export function spawnCommand(c: Pick<Command, "cmd" | "args" | "env" | "input">) {
  const args = [...c.args];
  let folder: string | undefined;
  const cleanup = () => { if (folder) { rmSync(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); folder = undefined; } };
  try {
    const index = args.indexOf("--append-system-prompt");
    if (index >= 0) {
      folder = mkdtempSync(join(tmpdir(), "adam-ai-"));
      const file = join(folder, "system.txt");
      writeFileSync(file, args[index + 1]!, { mode: 0o600 });
      args.splice(index, 2, "--append-system-prompt-file", file);
    }
    const child = spawn(c.cmd, args, { stdio: [c.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true, detached: process.platform !== "win32", env: { ...process.env, ...c.env } });
    child.once("error", cleanup);
    child.once("close", cleanup);
    // An early exit can close the pipe before the request finishes writing.
    child.stdin?.on("error", () => {});
    if (c.input !== undefined) child.stdin?.end(c.input);
    return child;
  } catch (error) { cleanup(); throw error; }
}
