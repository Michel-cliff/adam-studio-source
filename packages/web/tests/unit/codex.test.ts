import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codexAskCommand, parseCodexUsage } from "../../server/codex";
import { codexModel, engine, setCodexModel, setEngine } from "../../server/settings";

const arg = (args: string[], key: string) => args.filter((a, i) => args[i - 1] === "-c").find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1);

describe("asking Codex", () => {
  it("runs codex exec headless, JSON events, read-only, no approvals, with the adam-studio tools", () => {
    const c = codexAskCommand("ep 1", "hook", "A bold question");
    expect(c.label).toBe("Codex: hook");
    expect(c.args[0]).toBe("exec");
    expect(c.args).toEqual(expect.arrayContaining(["--json", "--skip-git-repo-check", "--ephemeral"]));
    expect(c.args[c.args.indexOf("--sandbox") + 1]).toBe("read-only");
    expect(arg(c.args, "approval_policy")).toBe('"never"');
    expect(arg(c.args, "mcp_servers.adam-studio.command")).toMatch(/node(\.exe)?"$/i);
    expect(arg(c.args, "mcp_servers.adam-studio.args")).toMatch(/^\[".*tsx.*", ".*server\.ts"\]$/);
    expect(c.args).not.toContain("-m");
  });

  it("puts the editing brief and the creator's request in the one prompt", () => {
    const c = codexAskCommand("ep 1", "hook", "A bold question");
    const prompt = c.input!;
    expect(prompt).toMatch(/Project: "ep 1"/);
    expect(prompt).toMatch(/id "ask\.hook\./);
    expect(prompt).toMatch(/Hook, rules/);
    expect(prompt).toMatch(/# The creator's request\nA bold question$/);
    expect(() => codexAskCommand("ep 1", "wrap", "x")).toThrow(/unknown step/);
    expect(() => codexAskCommand("ep 1", "hook", " ")).toThrow(/write what you want/);
  });

  it("uses the chosen model, the creator's connectors, and says when it acts directly", () => {
    const c = codexAskCommand("ep 1", "visuals", "x", "gpt-5.5", null, {
      mode: "do",
      servers: { blender: { type: "stdio", command: "uvx", args: ["blender-mcp"] }, higgsfield: { type: "http", url: "https://mcp.higgsfield.ai/mcp" } },
      tools: ["mcp__blender", "mcp__higgsfield"],
    });
    expect(c.args[c.args.indexOf("-m") + 1]).toBe("gpt-5.5");
    expect(arg(c.args, "mcp_servers.blender.command")).toBe('"uvx"');
    expect(arg(c.args, "mcp_servers.blender.args")).toBe('["blender-mcp"]');
    expect(arg(c.args, "mcp_servers.higgsfield.url")).toBe('"https://mcp.higgsfield.ai/mcp"');
    expect(c.input).toMatch(/apply_patch/);
    expect(c.label).toBe("Codex: visuals (do)");
  });

  it("reads the tokens of a run from its JSON events", () => {
    const out = [
      '{"type":"thread.started","thread_id":"t"}',
      '{"type":"item.completed","item":{"id":"i1","type":"mcp_tool_call","server":"adam-studio","tool":"propose","status":"completed"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":800,"output_tokens":300}}',
    ].join("\n");
    expect(parseCodexUsage(out)).toEqual({ costUsd: 0, tokens: { input: 1200, output: 300 }, model: null, durationMs: null, limits: null });
    expect(parseCodexUsage('{"type":"turn.started"}')).toBeNull();
  });
});

describe("which AI the studio asks", () => {
  it("is Claude until the creator picks Codex, with Codex's own model", () => {
    const file = join(mkdtempSync(join(tmpdir(), "adam engine-")), "ui.json");
    expect(engine(file)).toBe("claude");
    setEngine("codex", file);
    expect(engine(file)).toBe("codex");
    expect(() => setEngine("gemini-ultra", file)).toThrow(/claude, codex/);
    expect(codexModel(file)).toBe("default");
    setCodexModel("gpt-5.5", file);
    expect(codexModel(file)).toBe("gpt-5.5");
    expect(() => setCodexModel("x; rm -rf", file)).toThrow(/model/);
  });

  it("lets Adam's tools and the connectors the creator turned on run: with no approvals, Codex refuses them otherwise", () => {
    const c = codexAskCommand("ep 1", "hook", "x", "default", null, { servers: { probe: { command: "node", args: ["p"] }, web: { url: "https://x.y/mcp" } } });
    for (const name of ["adam-studio", "probe", "web"]) expect(arg(c.args, `mcp_servers.${name}.default_tools_approval_mode`)).toBe('"approve"');
  });
  it("carries the installed app's environment to its server, which Codex would not pass on", () => {
    const before = { ...process.env };
    Object.assign(process.env, { ADAM_PACKAGED: "1", ADAM_APP_ROOT: "C:/app/payload", ADAM_BROWSER_EXECUTABLE: "C:/app/chrome.exe" });
    try {
      const c = codexAskCommand("ep 1", "hook", "x");
      expect(arg(c.args, "mcp_servers.adam-studio.env.ADAM_APP_ROOT")).toBe('"C:/app/payload"');
      expect(arg(c.args, "mcp_servers.adam-studio.env.ADAM_BROWSER_EXECUTABLE")).toBe('"C:/app/chrome.exe"');
    } finally {
      for (const k of ["ADAM_PACKAGED", "ADAM_APP_ROOT", "ADAM_BROWSER_EXECUTABLE"]) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; }
    }
  });
});
