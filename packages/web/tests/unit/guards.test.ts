import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hostAllowed, inside, originAllowed, safeName } from "../../server/guards";
import { setProjectsRoot } from "../../server/settings";

describe("guards", () => {
  it("accepts only the panel's own host", () => {
    expect(hostAllowed("127.0.0.1:4317", 4317)).toBe(true);
    expect(hostAllowed("localhost:4317", 4317)).toBe(true);
    expect(hostAllowed("evil.com:4317", 4317)).toBe(false);
    expect(hostAllowed("127.0.0.1:80", 4317)).toBe(false);
    expect(hostAllowed(undefined, 4317)).toBe(false);
  });

  it("refuses state changes from other origins", () => {
    expect(originAllowed("GET", "http://evil.com", 4317)).toBe(true);
    expect(originAllowed("POST", undefined, 4317)).toBe(true);
    expect(originAllowed("POST", "http://127.0.0.1:4317", 4317)).toBe(true);
    expect(originAllowed("POST", "http://localhost:4317", 4317)).toBe(true);
    expect(originAllowed("POST", "http://evil.com", 4317)).toBe(false);
    expect(originAllowed("PUT", "null", 4317)).toBe(false);
  });

  it("takes plain folder names only", () => {
    expect(safeName("projet démo")).toBe(true);
    expect(safeName("1015")).toBe(true);
    for (const bad of ["", ".", "..", "a/b", "a\\b", "c:", " x", "x ", "a*b"]) expect(safeName(bad), bad).toBe(false);
  });

  it("keeps paths inside their root", () => {
    const root = resolve("/tmp/p");
    expect(inside(root, "renders/a.mp4")).toBe(join(root, "renders", "a.mp4"));
    expect(inside(root, "../x")).toBeNull();
    expect(inside(root, "renders/../../x")).toBeNull();
    expect(inside(root, "")).toBeNull();
    expect(inside(root, resolve("/etc/passwd"))).toBeNull();
  });
});

describe("the AI's server for one request", () => {
  it("carries what the creator wrote, to Claude and to Codex, and the connected apps never get it", async () => {
    const { adamServer, askCommand } = await import("../../server/claude");
    const { codexAskCommand } = await import("../../server/codex");
    const root = mkdtempSync(join(tmpdir(), "adam-words-"));
    const settings = join(root, "s.json");
    setProjectsRoot(root, settings);
    mkdirSync(join(root, "p"));
    writeFileSync(join(root, "p", "project.json"), "{}");
    const prompt = "mets https://cdn.example.com/a.png";
    const claude = askCommand(join(root, "p"), "visuals", prompt);
    expect(JSON.parse(claude.args[claude.args.indexOf("--mcp-config") + 1]!).mcpServers["adam-studio"].env.ADAM_CREATOR_WORDS).toBe(prompt);
    expect(codexAskCommand(join(root, "p"), "visuals", prompt).args.join(" ")).toContain("env.ADAM_CREATOR_WORDS=");
    expect(JSON.stringify(adamServer())).not.toContain("ADAM_CREATOR_WORDS");
  });
});
