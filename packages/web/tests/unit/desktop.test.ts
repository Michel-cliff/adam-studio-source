import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codexStatus, connectClaudeDesktop, claudeDesktopStatus, connectCodex } from "../../server/desktop";

describe("connecting Adam Studio to Claude Desktop", () => {
  it("adds the adam-studio server to the config, keeps everything else, and backs the file up", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "adam desk-")), "Claude");
    mkdirSync(dir);
    const file = join(dir, "claude_desktop_config.json");
    writeFileSync(file, JSON.stringify({ preferences: { x: 1 }, mcpServers: { blender: { command: "uvx" } } }));
    expect(claudeDesktopStatus(file)).toEqual({ app: true, connected: false });
    connectClaudeDesktop(file, { command: "node", args: ["tsx", "server.ts"] });
    const j = JSON.parse(readFileSync(file, "utf8"));
    expect(j.preferences).toEqual({ x: 1 });
    expect(j.mcpServers.blender).toEqual({ command: "uvx" });
    expect(j.mcpServers["adam-studio"]).toEqual({ command: "node", args: ["tsx", "server.ts"] });
    expect(readdirSync(dir).some((f) => f.startsWith("claude_desktop_config.json.before-adam-studio"))).toBe(true);
    expect(claudeDesktopStatus(file)).toEqual({ app: true, connected: true });
  });
  it("says when Claude Desktop is not installed, and creates the config when the app has none yet", () => {
    const none = join(mkdtempSync(join(tmpdir(), "adam desk-")), "Claude", "claude_desktop_config.json");
    expect(claudeDesktopStatus(none)).toEqual({ app: false, connected: false });
    expect(() => connectClaudeDesktop(none, { command: "node", args: [] })).toThrow(/Claude Desktop/);
    const dir = join(mkdtempSync(join(tmpdir(), "adam desk-")), "Claude");
    mkdirSync(dir);
    connectClaudeDesktop(join(dir, "claude_desktop_config.json"), { command: "node", args: [] });
    expect(existsSync(join(dir, "claude_desktop_config.json"))).toBe(true);
  });
  it("adds the adam-studio server to Codex's config.toml once, keeping the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam codex-"));
    const file = join(dir, "config.toml");
    writeFileSync(file, ["[windows]", 'sandbox = "elevated"', "", "[mcp_servers.node_repl]", "command = 'x.exe'", ""].join("\n"));
    expect(codexStatus(file)).toEqual({ app: true, connected: false });
    const server = { command: String.raw`C:\node.exe`, args: [String.raw`C:\tsx\cli.mjs`, String.raw`C:\mcp\server.ts`] };
    connectCodex(file, server);
    connectCodex(file, server);
    const t = readFileSync(file, "utf8");
    expect(t.split("[mcp_servers.adam-studio]")).toHaveLength(2);
    expect(t).toContain(["[mcp_servers.adam-studio]", String.raw`command = 'C:\node.exe'`, String.raw`args = ['C:\tsx\cli.mjs', 'C:\mcp\server.ts']`].join("\n"));
    expect(t).toContain("[mcp_servers.node_repl]\ncommand = 'x.exe'");
    expect(t).toMatch(/sandbox = "elevated"/);
    expect(codexStatus(file)).toEqual({ app: true, connected: true });
  });
});
