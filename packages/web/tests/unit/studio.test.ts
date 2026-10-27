import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSynthetic } from "../../../render/tests/e2e/synthetic";
import { createApp } from "../../server/app";
import { askCommand } from "../../server/claude";
import { setProjectsRoot } from "../../server/settings";

let server: Server; let base: string; let dir: string;
const P = `/api/projects/${encodeURIComponent("studio test")}`;
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "adam studio-"));
  dir = join(root, "studio test");
  mkdirSync(dir);
  makeSynthetic(dir, { withProposal: true });
  const settingsFile = join(root, "ui.json");
  setProjectsRoot(root, settingsFile);
  server = createApp({ settingsFile, dist: join(root, "no-dist") }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120000);
afterAll(() => server.close());

describe("asking Claude", () => {
  it("runs Claude Code headless with the adam-studio tools only, for one proposal of the step", () => {
    const c = askCommand("ep 1", "hook", "A bold question");
    expect(c.label).toBe("Claude: hook");
    expect(c.args.slice(0, 2)).toEqual(["-p", "A bold question"]);
    expect(c.args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--allowedTools", "mcp__adam-studio", "--output-format", "stream-json"]));
    const system = c.args[c.args.indexOf("--append-system-prompt") + 1]!;
    expect(system).toMatch(/Project: "ep 1"/);
    expect(system).toMatch(/id "ask\.hook\./);
    expect(() => askCommand("ep 1", "wrap", "x")).toThrow(/unknown step/);
    expect(() => askCommand("ep 1", "hook", "  ")).toThrow(/write what you want/);
  });

  it("sends the editing rules of the step, asks for a why per variant, and uses the chosen model", () => {
    const hook = askCommand("ep 1", "hook", "x");
    const system = hook.args[hook.args.indexOf("--append-system-prompt") + 1]!;
    expect(system).toMatch(/Hook, rules/);
    expect(system).toMatch(/curiosity gap/);
    expect(system).not.toMatch(/Cuts, rules/);
    expect(system).toMatch(/a why \(what changes/);
    expect(hook.args).not.toContain("--model");
    const opus = askCommand("ep 1", "cuts", "x", "opus");
    expect(opus.args[opus.args.indexOf("--model") + 1]).toBe("opus");
  });

  it("lets Claude use the enabled connectors and the skills the creator picked", () => {
    const c = askCommand("ep 1", "visuals", "x", "default", null, {
      servers: { blender: { type: "stdio", command: "uvx", args: ["blender-mcp"] } }, tools: ["mcp__blender"], skills: ["anthropic-skills:editorial-film-edit"],
    });
    const mcp = JSON.parse(c.args[c.args.indexOf("--mcp-config") + 1]!);
    expect(Object.keys(mcp.mcpServers)).toEqual(["adam-studio", "blender"]);
    const allowed = c.args[c.args.indexOf("--allowedTools") + 1]!;
    expect(allowed.split(",")).toEqual(["mcp__adam-studio", "mcp__blender", "Skill", "Read", "Glob", "Grep"]);
    const system = c.args[c.args.indexOf("--append-system-prompt") + 1]!;
    expect(system).toMatch(/Skill tool: anthropic-skills:editorial-film-edit/);
    expect(c.args[c.args.indexOf("--tools") + 1]).toBe("Skill,Read,Glob,Grep");
    expect(c.args).not.toContain("--disable-slash-commands");
    const plain = askCommand("ep 1", "visuals", "x");
    expect(plain.args[plain.args.indexOf("--allowedTools") + 1]).toBe("mcp__adam-studio");
    // Without skills, Claude Code's own tools, skill list and plugin hooks stay out of the context.
    expect(plain.args[plain.args.indexOf("--tools") + 1]).toBe("");
    expect(plain.args).toContain("--disable-slash-commands");
    expect(plain.args[plain.args.indexOf("--setting-sources") + 1]).toBe("");
  });

  it("does an explicit request directly: no proposal, no still, few turns", () => {
    const c = askCommand("ep 1", "hook", "Make the title bigger", "default", null, { mode: "do" });
    const system = c.args[c.args.indexOf("--append-system-prompt") + 1]!;
    expect(system).toMatch(/apply_patch/);
    expect(system).not.toMatch(/propose tool/);
    expect(system).toMatch(/Do not call still/);
    expect(Number(c.args[c.args.indexOf("--max-turns") + 1])).toBeLessThanOrEqual(12);
    expect(c.label).toBe("Claude: hook (do)");
  });

  it("sends the step's context with the ask, so Claude starts at once, and caps a proposal's turns and stills", () => {
    const c = askCommand("ep 1", "hook", "x", "default", null, { context: "## Transcript\nc01.w1 0.0 Bonjour" });
    const system = c.args[c.args.indexOf("--append-system-prompt") + 1]!;
    expect(system).toMatch(/c01\.w1 0\.0 Bonjour/);
    expect(system).toMatch(/only if something you need is missing/);
    expect(system).toMatch(/at most one still/);
    expect(Number(c.args[c.args.indexOf("--max-turns") + 1])).toBeLessThanOrEqual(24);
  });

  it("sends the chosen look so every proposal follows its style guide", () => {
    const c = askCommand("ep 1", "visuals", "x", "default", "Look \"editorial-archival\"\n\nInserts in soft black and white.");
    const system = c.args[c.args.indexOf("--append-system-prompt") + 1]!;
    expect(system).toMatch(/The video's look \(it wins over generic defaults/);
    expect(system).toMatch(/Inserts in soft black and white/);
    const none = askCommand("ep 1", "visuals", "x");
    expect(none.args[none.args.indexOf("--append-system-prompt") + 1]).not.toMatch(/The video's look/);
  });
});

describe("studio routes", () => {
  it("previews a variant and tells the project's workflow and variant summaries", async () => {
    const v = await (await fetch(`${base}${P}`)).json();
    expect(v.proposals[0].variants[0].summary).toMatch(/1 image/);
    const a = await (await fetch(`${base}${P}/preview?proposal=p1&variant=A`)).json();
    const now = await (await fetch(`${base}${P}/preview`)).json();
    expect(a.timeline.elements.length).toBe(now.timeline.elements.length + 1);
    expect((await fetch(`${base}${P}/preview?proposal=p1&variant=Z`)).status).toBe(400);
  });

  it("decides and skips steps through the edit route", async () => {
    expect((await post(`${P}/edit`, { op: "decide", proposal: "p1", decision: "A" })).status).toBe(200);
    expect(JSON.parse(readFileSync(join(dir, "project.json"), "utf8")).proposals[0].status).toEqual({ accepted: "A" });
    expect((await post(`${P}/edit`, { op: "decide", proposal: "p1", decision: "maybe" })).status).toBe(400);
  });
});
