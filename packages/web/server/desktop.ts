// Adam Studio as a connector of the creator's own Claude Desktop: Claude runs in Anthropic's app on the creator's
// subscription, and calls the adam-studio tools; the studio shows the proposals and does the rest.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Where Claude Desktop keeps its config on this computer. */
export function claudeDesktopConfig(): string {
  const base = process.env.APPDATA ?? join(process.env.HOME ?? "", "Library", "Application Support");
  return join(base, "Claude", "claude_desktop_config.json");
}

/** Whether Claude Desktop is installed (its folder exists) and already lists the adam-studio server. */
export function claudeDesktopStatus(file = claudeDesktopConfig()): { app: boolean; connected: boolean } {
  const app = existsSync(dirname(file));
  if (!app || !existsSync(file)) return { app, connected: false };
  try { return { app, connected: Boolean(JSON.parse(readFileSync(file, "utf8")).mcpServers?.["adam-studio"]) }; } catch { return { app, connected: false }; }
}

/** Adds (or updates) the adam-studio server; every other setting stays, and the file is backed up first. */
export function connectClaudeDesktop(file: string, server: { command: string; args: string[] }): void {
  if (!existsSync(dirname(file))) throw new Error("Claude Desktop is not installed on this computer: install it from claude.ai/download, open it once, then connect.");
  let config: Record<string, any> = {};
  if (existsSync(file)) {
    config = JSON.parse(readFileSync(file, "utf8"));
    copyFileSync(file, `${file}.before-adam-studio-${Date.now()}`);
  }
  config.mcpServers = { ...(config.mcpServers ?? {}), "adam-studio": server };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}
