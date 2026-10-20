import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addConnector, askServers, listConnectors, removeConnector, setEnabled } from "../../server/connectors";
import { listSkills } from "../../server/skills";

function home() {
  const h = mkdtempSync(join(tmpdir(), "home-"));
  writeFileSync(join(h, ".claude.json"), JSON.stringify({ mcpServers: {
    blender: { type: "stdio", command: "uvx", args: ["blender-mcp"], env: { SECRET: "x" } },
    motion: { type: "http", url: "https://motion.example/mcp", headers: { Authorization: "Bearer y" } },
    "adam-studio": { command: "node", args: ["server.ts"] },
  } }));
  const skill = (dir: string, name: string, description: string) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`);
  };
  skill(join(h, ".claude", "skills", "pm-kinator"), "pm-kinator", "Product manager interview");
  skill(join(h, ".claude", "skills", "synced", "abc", "editorial-film-edit"), "editorial-film-edit", "Archival editorial edit");
  const plugin = join(h, ".claude", "plugins", "cache", "official", "superpowers", "6.4.1");
  skill(join(plugin, "skills", "brainstorming"), "brainstorming", "Ideas into designs");
  mkdirSync(join(h, ".claude", "plugins"), { recursive: true });
  writeFileSync(join(h, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "superpowers@official": [{ installPath: plugin }] } }));
  return h;
}

describe("connectors", () => {
  it("lists Claude Code's MCP servers without their secrets, Adam Studio's own one aside", () => {
    const h = home();
    const list = listConnectors(h, join(h, "connectors.json"));
    expect(list).toEqual([
      { name: "blender", type: "stdio", source: "claude-code", enabled: false },
      { name: "motion", type: "http", source: "claude-code", enabled: false },
    ]);
    expect(JSON.stringify(list)).not.toMatch(/SECRET|Bearer/);
  });

  it("gives an ask the enabled servers with their full config, and their tools", () => {
    const h = home(), file = join(h, "connectors.json");
    setEnabled(["blender"], h, file);
    const s = askServers(h, file);
    expect(s.servers.blender).toEqual({ type: "stdio", command: "uvx", args: ["blender-mcp"], env: { SECRET: "x" } });
    expect(s.servers.motion).toBeUndefined();
    expect(s.tools).toEqual(["mcp__blender"]);
  });

  it("adds a server by URL (Higgsfield), refuses bad names and keeps it until removed", () => {
    const h = home(), file = join(h, "connectors.json");
    addConnector({ name: "higgsfield", url: "https://mcp.example/higgsfield" }, file);
    expect(listConnectors(h, file).find((c) => c.name === "higgsfield")).toEqual({ name: "higgsfield", type: "http", source: "added", enabled: true });
    expect(askServers(h, file).servers.higgsfield).toEqual({ type: "http", url: "https://mcp.example/higgsfield" });
    expect(() => addConnector({ name: "bad name!", url: "https://x.y" }, file)).toThrow(/name/);
    expect(() => addConnector({ name: "web", url: "ftp://x" }, file)).toThrow(/https/);
    removeConnector("higgsfield", file);
    expect(listConnectors(h, file).some((c) => c.name === "higgsfield")).toBe(false);
  });
});

describe("skills", () => {
  it("lists the skills Claude Code has, named as Claude Code calls them", () => {
    expect(listSkills(home())).toEqual([
      { name: "anthropic-skills:editorial-film-edit", description: "Archival editorial edit" },
      { name: "pm-kinator", description: "Product manager interview" },
      { name: "superpowers:brainstorming", description: "Ideas into designs" },
    ]);
  });
});
