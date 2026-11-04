// Adam Studio as a connector of the creator's own Claude Desktop: Claude runs in Anthropic's app on the creator's
// subscription, and calls the adam-studio tools; the studio shows the proposals and does the rest.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hostAppData, hostHome, localAppInstalled } from "./local-apps";

/** Where Claude Desktop keeps its config on this computer. */
export function claudeDesktopConfig(): string {
  const base = process.platform === "win32" ? hostAppData() : join(hostHome(), "Library", "Application Support");
  return join(base, "Claude", "claude_desktop_config.json");
}

/** Whether Claude Desktop is installed (its folder exists) and already lists the adam-studio server. */
export function claudeDesktopStatus(file = claudeDesktopConfig(), refresh = false): { app: boolean; connected: boolean } {
  const app = existsSync(dirname(file)) || (file === claudeDesktopConfig() && localAppInstalled("claude", { refresh }));
  if (!app || !existsSync(file)) return { app, connected: false };
  try { return { app, connected: Boolean(JSON.parse(readFileSync(file, "utf8")).mcpServers?.["adam-studio"]) }; } catch { return { app, connected: false }; }
}

/** Adds (or updates) the adam-studio server; every other setting stays, and the file is backed up first. */
export function connectClaudeDesktop(file: string, server: { command: string; args: string[] }): void {
  if (!existsSync(dirname(file)) && file === claudeDesktopConfig() && localAppInstalled("claude")) mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(dirname(file))) throw new Error("Claude Desktop is not installed on this computer: install it from claude.ai/download, open it once, then connect.");
  let config: Record<string, any> = {};
  if (existsSync(file)) {
    config = JSON.parse(readFileSync(file, "utf8"));
    copyFileSync(file, `${file}.before-adam-studio-${Date.now()}`);
  }
  config.mcpServers = { ...(config.mcpServers ?? {}), "adam-studio": server };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

/** Where Codex keeps its config (the CLI and the desktop app share it). */
export function codexConfig(): string {
  return join(process.env.ADAM_HOST_CODEX_HOME || (process.env.ADAM_HOST_HOME ? join(hostHome(), ".codex") : process.env.CODEX_HOME) || join(hostHome(), ".codex"), "config.toml");
}

const SECTION = "[mcp_servers.adam-studio]";

export function codexStatus(file = codexConfig(), refresh = false): { app: boolean; connected: boolean } {
  const app = existsSync(dirname(file)) || (file === codexConfig() && localAppInstalled("codex", { refresh }));
  return { app, connected: app && existsSync(file) && readFileSync(file, "utf8").includes(SECTION) };
}

// TOML literal strings ('...') keep Windows backslashes as they are.
const lit = (s: string) => `'${s.replace(/'/g, "")}'`;

/** Adds (or replaces) the adam-studio section of Codex's config.toml; the rest stays, the file is backed up first. */
export function connectCodex(file: string, server: { command: string; args: string[] }): void {
  if (!existsSync(dirname(file)) && file === codexConfig() && localAppInstalled("codex")) mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(dirname(file))) throw new Error("Codex is not installed on this computer: install the Codex app or CLI, sign in once, then connect.");
  let text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (text) copyFileSync(file, `${file}.before-adam-studio-${Date.now()}`);
  // Drop an earlier adam-studio section: from its header to the next section header.
  text = text.replace(/\[mcp_servers\.adam-studio\][\s\S]*?(?=\n\[|$)/, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  const block = [SECTION, `command = ${lit(server.command)}`, `args = [${server.args.map(lit).join(", ")}]`, "startup_timeout_sec = 60",
    // Its tools only change Adam Studio projects, and every change can be undone: no prompt for each call.
    'default_tools_approval_mode = "approve"'].join("\n");
  writeFileSync(file, `${text ? `${text}\n\n` : ""}${block}\n`);
}

type Server = { command: string; args: string[] };
// An update installs into a new app-x.y.z folder, and Squirrel removes the old one. Only what this installed app wrote
// matches: a connector pointing at a development checkout belongs to the developer.
const INSTALLED = /[\\/]AdamStudio[\\/]app-[^\\/]+[\\/]/;
const stale = (command: unknown, server: Server) => typeof command === "string" && INSTALLED.test(command) && command !== server.command;

export const connectorFiles = () => ({
  claude: claudeDesktopConfig(),
  codex: codexConfig(),
  claudeCode: join(process.env.CLAUDE_CONFIG_DIR || hostHome(), ".claude.json"),
});

/** After an update, moves the connectors the creator already has to this version. Adds none, and a broken file is left as it is. */
export function refreshConnectors(server: Server, files: { claude: string; codex: string; claudeCode: string }, runClaude: (args: string[]) => void): string[] {
  const done: string[] = [];
  const attempt = (name: string, step: () => boolean) => {
    try { if (step()) done.push(name); } catch (error) { console.error(`Connector ${name}:`, (error as Error).message); }
  };
  attempt("Claude Desktop", () => {
    if (!existsSync(files.claude) || !stale(JSON.parse(readFileSync(files.claude, "utf8")).mcpServers?.["adam-studio"]?.command, server)) return false;
    connectClaudeDesktop(files.claude, server);
    return true;
  });
  attempt("Codex", () => {
    if (!existsSync(files.codex)) return false;
    const section = readFileSync(files.codex, "utf8").match(/\[mcp_servers\.adam-studio\][\s\S]*?(?=\n\[|$)/)?.[0] ?? "";
    if (!stale(section.match(/^command\s*=\s*['"](.*)['"]\s*$/m)?.[1], server)) return false;
    connectCodex(files.codex, server);
    return true;
  });
  attempt("Claude Code", () => {
    if (!existsSync(files.claudeCode) || !stale(JSON.parse(readFileSync(files.claudeCode, "utf8")).mcpServers?.["adam-studio"]?.command, server)) return false;
    runClaude(["mcp", "remove", "--scope", "user", "adam-studio"]);
    runClaude(["mcp", "add", "--scope", "user", "adam-studio", "--", server.command, ...server.args]);
    return true;
  });
  return done;
}
