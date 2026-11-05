import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeAddArgs, connectCodex, refreshConnectors } from "../../server/desktop";

const OLD = "C:\\Users\\x\\AppData\\Local\\AdamStudio\\app-0.1.0\\resources\\payload\\bin\\node.exe";
const NEW = { command: "C:\\Users\\x\\AppData\\Local\\AdamStudio\\app-0.1.1\\resources\\payload\\bin\\node.exe", args: ["tsx", "server.ts"] };
const DEV = "C:\\Program Files\\nodejs\\node.exe";

function files() {
  const dir = mkdtempSync(join(tmpdir(), "adam-conn-"));
  return { claude: join(dir, "claude_desktop_config.json"), codex: join(dir, "config.toml"), claudeCode: join(dir, ".claude.json") };
}

describe("after an update, the AI apps keep finding Adam", () => {
  it("rewrites what pointed at the previous version, and keeps the rest", () => {
    const f = files();
    writeFileSync(f.claude, JSON.stringify({ theme: "dark", mcpServers: { other: { command: "x" }, "adam-studio": { command: OLD, args: ["a"] } } }));
    writeFileSync(f.codex, `model = "gpt"\n\n[mcp_servers.adam-studio]\ncommand = '${OLD}'\nargs = ['a']\n\n[mcp_servers.other]\ncommand = 'y'\n`);
    const done = refreshConnectors(NEW, f, () => {});
    expect(done).toEqual(["Claude Desktop", "Codex"]);
    const c = JSON.parse(readFileSync(f.claude, "utf8"));
    expect(c.mcpServers["adam-studio"]).toEqual(NEW);
    expect(c.theme).toBe("dark");
    expect(c.mcpServers.other).toEqual({ command: "x" });
    const t = readFileSync(f.codex, "utf8");
    expect(t).toContain(`command = '${NEW.command}'`);
    expect(t).not.toContain("app-0.1.0");
    expect(t).toContain("[mcp_servers.other]");
    expect(t).toContain('model = "gpt"');
  });
  it("re-registers Claude Code through its own command", () => {
    const f = files();
    writeFileSync(f.claudeCode, JSON.stringify({ mcpServers: { "adam-studio": { command: OLD, args: [] } } }));
    const calls: string[][] = [];
    expect(refreshConnectors(NEW, f, (args) => { calls.push(args); })).toEqual(["Claude Code"]);
    expect(calls).toEqual([["mcp", "remove", "--scope", "user", "adam-studio"], ["mcp", "add", "--scope", "user", "adam-studio", "--", NEW.command, ...NEW.args]]);
  });
  it("leaves alone a connector that is up to date, or that is not the installed app's", () => {
    const f = files();
    writeFileSync(f.claude, JSON.stringify({ mcpServers: { "adam-studio": { command: DEV, args: ["dev"] } } }));
    writeFileSync(f.codex, `[mcp_servers.adam-studio]\ncommand = '${NEW.command}'\n`);
    const before = [readFileSync(f.claude, "utf8"), readFileSync(f.codex, "utf8")];
    expect(refreshConnectors(NEW, f, () => { throw new Error("must not run"); })).toEqual([]);
    expect([readFileSync(f.claude, "utf8"), readFileSync(f.codex, "utf8")]).toEqual(before);
  });
  it("gives the AI apps what the installed server needs to find its own files", () => {
    const f = files(), server = { ...NEW, env: { ADAM_APP_ROOT: "C:\\app\\payload", PATH: "C:\\app\\bin" } };
    writeFileSync(f.codex, `[other]\nx = 1\n`);
    connectCodex(f.codex, server);
    const t = readFileSync(f.codex, "utf8");
    expect(t).toContain("env = { ADAM_APP_ROOT = 'C:\\app\\payload', PATH = 'C:\\app\\bin' }");
    expect(t).toContain("[other]");
    expect(claudeAddArgs(server)).toEqual(["mcp", "add", "--scope", "user", "adam-studio", "-e", "ADAM_APP_ROOT=C:\\app\\payload", "-e", "PATH=C:\\app\\bin", "--", NEW.command, ...NEW.args]);
  });
  it("adds no connector the creator never asked for, and survives a broken file", () => {
    const f = files();
    expect(refreshConnectors(NEW, f, () => {})).toEqual([]);
    writeFileSync(f.claude, "{ not json");
    expect(refreshConnectors(NEW, f, () => {})).toEqual([]);
  });
});
