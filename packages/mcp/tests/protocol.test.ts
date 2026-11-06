import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { TSX } from "@adam-studio/web/server/paths";
import { makeSynthetic } from "../../render/tests/e2e/synthetic";

describe("MCP server over stdio", () => {
  it("lists its tools, reads, refuses a bad write and shows a still", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adam mcp proto-"));
    makeSynthetic(dir, { withProposal: true });
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [TSX, join(import.meta.dirname, "..", "src", "server.ts")], stderr: "inherit" }));
    try {
      const names = (await client.listTools()).tools.map((t) => t.name).sort();
      expect(names).toEqual(["add_rushes", "apply_patch", "close_step", "create_project", "decide", "get_project", "get_reference", "get_transcript",
        "apply_series", "list_projects", "list_series", "propose", "run", "save_series", "set_value", "still", "undo", "update_item",
        "search_assets", "look_at", "import_asset", "first_pass"].sort());
      const summary = await client.callTool({ name: "get_project", arguments: { project: dir } });
      expect((summary.content as { text: string }[])[0]!.text).toContain('"durationMs"');
      const bad = await client.callTool({ name: "set_value", arguments: { project: dir, pointer: "/canvas/fps", value: "fast" } });
      expect(bad.isError).toBe(true);
      const kinds = await client.callTool({ name: "get_reference", arguments: { topic: "kinds" } });
      expect((kinds.content as { text: string }[])[0]!.text).toContain("image");
      const still = await client.callTool({ name: "still", arguments: { project: dir, atMs: [2300], variant: "p1:A" } });
      const image = (still.content as { type: string; data?: string; mimeType?: string }[]).find((c) => c.type === "image");
      expect(still.isError, JSON.stringify(still.content).slice(0, 500)).toBeFalsy();
      expect(image?.mimeType).toBe("image/jpeg");
      expect(image!.data!.length).toBeGreaterThan(1000);
    } finally {
      await client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
  it("keeps the AI inside the media folders and away from any other address", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adam mcp guard-"));
    makeSynthetic(dir, {});
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [TSX, join(import.meta.dirname, "..", "src", "server.ts")], stderr: "inherit" }));
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = await client.callTool({ name, arguments: args });
      return { isError: r.isError, text: (r.content as { text?: string }[])[0]?.text ?? "" };
    };
    try {
      expect(await call("look_at", { source: "C:\Windows\win.ini" })).toMatchObject({ isError: true, text: expect.stringContaining("Inspiration") });
      expect(await call("look_at", { source: "https://evil.example/a.png?secret=1" })).toMatchObject({ isError: true, text: expect.stringContaining("online libraries") });
      expect(await call("import_asset", { project: dir, source: { path: "C:\Windows\win.ini", kind: "image" } })).toMatchObject({ isError: true, text: expect.stringContaining("Inspiration") });
      expect(await call("import_asset", { project: dir, source: { url: "https://evil.example/a.png" } })).toMatchObject({ isError: true, text: expect.stringContaining("online libraries") });
      expect(await call("import_asset", { project: dir, source: { url: "https://pixabay.com/a.png" }, id: "..\..\evil" })).toMatchObject({ isError: true, text: expect.stringContaining("asset id") });
    } finally {
      await client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("opens what the creator wrote in their request, and only that", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adam mcp words-")), picture = join(dir, "logo.png");
    writeFileSync(picture, "x");
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [TSX, join(import.meta.dirname, "..", "src", "server.ts")], stderr: "inherit", env: { ...(process.env as Record<string, string>), ADAM_CREATOR_WORDS: `regarde ${picture} merci` } }));
    const look = async (source: string) => ((await client.callTool({ name: "look_at", arguments: { source } })).content as { text?: string }[])[0]?.text ?? "";
    try {
      // Past the guard: the file is opened, and ffmpeg says it is not a real picture.
      expect(await look(picture)).not.toContain("Inspiration");
      expect(await look(join(dir, "other.png"))).toContain("Inspiration");
    } finally {
      await client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
