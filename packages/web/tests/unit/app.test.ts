import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { JobManager } from "../../server/jobs";
import { setProjectsRoot } from "../../server/settings";

let server: Server; let port: number; let root: string; const jobs = new JobManager();

function call(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) {
  return new Promise<{ status: number; json: any; text: string }>((res) => {
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { "content-type": "application/json" } : {}), ...opts.headers } }, (r) => {
      let text = ""; r.on("data", (c) => (text += c)); r.on("end", () => { let json; try { json = JSON.parse(text); } catch { json = undefined; } res({ status: r.statusCode!, json, text }); });
    });
    if (data) req.write(data);
    req.end();
  });
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "adam app-"));
  const dir = join(root, "projet démo");
  mkdirSync(join(dir, "renders"), { recursive: true });
  writeFileSync(join(dir, "project.json"), JSON.stringify({ version: 1, name: "projet démo", canvas: { format: "9:16", fps: 30 }, style: "style.json", assets: [{ id: "c01", kind: "video", path: "C:/r/a.mp4", meta: { durationMs: 2000, width: 1080, height: 1920, hasAudio: true } }], story: [{ id: "s1", asset: "c01", inMs: 0, outMs: 2000 }] }));
  writeFileSync(join(dir, "renders", "a b.mp4"), "0123456789");
  writeFileSync(join(root, "secret.txt"), "secret");
  const settingsFile = join(root, "ui.json");
  setProjectsRoot(root, settingsFile);
  // A home of its own, so the tests never read the real ~/.claude.json or skills.
  const home = join(root, "home");
  mkdirSync(join(home, ".claude", "skills", "pm-kinator"), { recursive: true });
  writeFileSync(join(home, ".claude", "skills", "pm-kinator", "SKILL.md"), "---\nname: pm-kinator\ndescription: interview\n---\n");
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ mcpServers: { blender: { command: "uvx", args: ["blender-mcp"] } } }));
  server = createApp({ settingsFile, jobs, capcutPython: () => null, dist: join(root, "no-dist"), home }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => { jobs.stopAll(); server.close(); });

const P = `/api/projects/${encodeURIComponent("projet démo")}`;

describe("app", () => {
  it("answers ping and lists projects", async () => {
    expect((await call("GET", "/api/ping")).json).toEqual({ app: "adam-studio" });
    expect((await call("GET", "/api/projects")).json.map((p: { name: string }) => p.name)).toEqual(["projet démo"]);
    expect((await call("GET", P)).json).toMatchObject({ name: "projet démo", ok: true, renders: [{ file: "renders/a b.mp4" }], jobs: [] });
  });

  it("refuses foreign hosts and origins", async () => {
    expect((await call("GET", "/api/projects", { headers: { host: "evil.com" } })).status).toBe(403);
    expect((await call("POST", `${P}/jobs`, { body: { action: "render" }, headers: { origin: "http://evil.com" } })).status).toBe(403);
  });

  it("serves project files and never outside the project", async () => {
    const ok = await call("GET", `${P}/files/renders/${encodeURIComponent("a b.mp4")}`);
    expect(ok).toMatchObject({ status: 200, text: "0123456789" });
    expect((await call("GET", `${P}/files/..%2Fsecret.txt`)).status).toBe(404);
    expect((await call("GET", `${P}/files/%2e%2e/secret.txt`)).status).toBe(404);
    expect((await call("GET", `/api/projects/..%2F/files/secret.txt`)).status).toBe(404);
  });

  it("validates input", async () => {
    expect((await call("GET", "/api/projects/nope")).status).toBe(404);
    expect((await call("POST", `${P}/jobs`, { body: { action: "decide", options: { decision: "Z" } } })).status).toBe(400);
    expect((await call("POST", `${P}/jobs`, { body: { action: "capcut", options: {} } })).json.error).toMatch(/CapCut environment is missing/);
    expect((await call("POST", "/api/projects", { body: { name: "a/b", videos: [], format: "9:16" } })).status).toBe(400);
    expect((await call("POST", "/api/projects", { body: { name: "projet démo", videos: [join(root, "x.mp4")], format: "9:16" } })).status).toBe(409);
    expect((await call("POST", `${P}/jobs`, { text: "x" } as never)).status).toBe(400);
  });

  it("refuses a second job on a busy project", async () => {
    const j = jobs.start("projet démo", { cmd: process.execPath, args: ["-e", "setTimeout(() => {}, 5000)"], label: "Render" });
    const r = await call("POST", `${P}/jobs`, { body: { action: "review", options: {} } });
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/Render is running/);
    expect((await call("GET", `/api/jobs/${j.id}`)).json.state).toBe("running");
    expect((await call("POST", `/api/jobs/${j.id}/stop`)).status).toBe(200);
  });

  it("lists folders and keeps settings", async () => {
    expect((await call("GET", `/api/fs?path=${encodeURIComponent(root)}`)).json.folders).toContain(join(root, "projet démo"));
    expect((await call("GET", "/api/settings")).json).toMatchObject({ projectsRoot: root });
    expect((await call("PUT", "/api/settings", { body: { projectsRoot: "relative" } })).status).toBe(400);
  });

  it("says how to build the page when it is missing", async () => {
    const r = await call("GET", "/");
    expect(r.status).toBe(503);
    expect(r.text).toMatch(/npm run build -w packages\/web/);
  });
});

function upload(path: string, data: Buffer) {
  return new Promise<{ status: number; json: any }>((res) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", path, headers: { host: `127.0.0.1:${port}`, "content-type": "application/octet-stream", "content-length": data.length } }, (r) => {
      let text = ""; r.on("data", (c) => (text += c)); r.on("end", () => res({ status: r.statusCode!, json: JSON.parse(text) }));
    });
    req.end(data);
  });
}

describe("studio tools", () => {
  it("keeps the Claude model with the projects folder", async () => {
    expect((await call("GET", "/api/settings")).json).toMatchObject({ projectsRoot: root, claudeModel: "default", models: ["default", "opus", "sonnet", "haiku"] });
    expect((await call("PUT", "/api/settings", { body: { claudeModel: "opus" } })).status).toBe(200);
    expect((await call("GET", "/api/settings")).json).toMatchObject({ projectsRoot: root, claudeModel: "opus" });
    expect((await call("PUT", "/api/settings", { body: { claudeModel: "gpt" } })).status).toBe(400);
  });

  it("keeps the look applied to every video, among the Inspiration folder's looks", async () => {
    process.env.ADAM_INSPIRATION = join(root, "inspiration");
    mkdirSync(join(root, "inspiration", "looks", "editorial-archival"), { recursive: true });
    writeFileSync(join(root, "inspiration", "looks", "editorial-archival", "LOOK.md"), "---\ntitle: Editorial archival\n---\nSoft archival.\n");
    const s = (await call("GET", "/api/settings")).json;
    expect(s.look).toBe("editorial-archival");
    expect(s.looks).toEqual([{ name: "editorial-archival", title: "Editorial archival", for: "" }]);
    expect((await call("PUT", "/api/settings", { body: { look: "" } })).json.look).toBe("");
    expect((await call("PUT", "/api/settings", { body: { look: "nope" } })).status).toBe(400);
    expect((await call("PUT", "/api/settings", { body: { look: "editorial-archival" } })).json.look).toBe("editorial-archival");
  });

  it("lists Claude Code's skills and manages the connectors without showing their secrets", async () => {
    expect((await call("GET", "/api/skills")).json).toEqual([{ name: "pm-kinator", description: "interview" }]);
    expect((await call("GET", "/api/connectors")).json).toEqual([{ name: "blender", type: "stdio", source: "claude-code", enabled: false }, { name: "savee", type: "http", source: "built-in", enabled: false }]);
    expect((await call("PUT", "/api/connectors", { body: { enabled: ["blender"] } })).json[0].enabled).toBe(true);
    const added = await call("POST", "/api/connectors", { body: { name: "higgsfield", url: "https://mcp.example/h" } });
    expect(added.json.map((c: { name: string }) => c.name)).toEqual(["blender", "savee", "higgsfield"]);
    expect((await call("POST", "/api/connectors", { body: { name: "x", url: "http://plain" } })).status).toBe(400);
    expect((await call("DELETE", "/api/connectors/higgsfield")).json.map((c: { name: string }) => c.name)).toEqual(["blender", "savee"]);
  });

  it("says what Claude used, even before the first ask", async () => {
    expect((await call("GET", "/api/usage")).json).toMatchObject({ today: { asks: 0 }, limits: null });
  });

  it("drops a file into Inspiration and straight into the video", async () => {
    process.env.ADAM_INSPIRATION = join(root, "inspiration");
    // Importing validates the whole project, style included.
    const font = { family: "Arial", file: "C:/Windows/Fonts/arialbd.ttf" };
    writeFileSync(join(root, "projet démo", "style.json"), JSON.stringify({ name: "t", fonts: { caption: font, title: font }, colors: { text: "#FFFFFF", highlight: "#FFD100", accent: "#FF6B35", ink: "#0E0C0A" },
      caption: { size: 0.052 }, slots: { "9:16": { caption: { x: 0.5, y: 0.76 }, title: { x: 0.5, y: 0.3 }, center: { x: 0.5, y: 0.5 } }, "16:9": { caption: { x: 0.5, y: 0.86 }, title: { x: 0.5, y: 0.22 }, center: { x: 0.5, y: 0.5 } } },
      lint: { "9:16": { minDurationMs: 0, maxDurationMs: 60000 }, "16:9": { minDurationMs: 0, maxDurationMs: 1200000 } } }));
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const r = await upload(`/api/library/upload?name=${encodeURIComponent("logo final.png")}&project=${encodeURIComponent("projet démo")}`, png);
    expect(r.status).toBe(200);
    expect(r.json.saved).toMatch(/inspiration.Uploads.logo final[.]png$/);
    expect(r.json.imported).toMatchObject({ id: "logo_final", kind: "image", path: "assets/logo_final.png" });
    expect((await call("GET", P)).json.assets).toEqual([{ id: "logo_final", kind: "image", path: "assets/logo_final.png" }]);
    // A second drop of the same name (other bytes) does not overwrite the first.
    const again = await upload(`/api/library/upload?name=${encodeURIComponent("logo final.png")}`, Buffer.concat([png, Buffer.from("v2")]));
    expect(again.json.saved).toMatch(/logo final [(]2[)][.]png$/);
    expect((await upload("/api/library/upload?name=virus.exe", png)).status).toBe(400);
  });

  it("keeps a video dropped on New video in the projects folder's rushes, once", async () => {
    const send = (name: string, body: string) => new Promise<{ status: number; json: any }>((done) => {
      const req = request({ host: "127.0.0.1", port, method: "POST", path: `/api/rushes?name=${encodeURIComponent(name)}`, headers: { host: `127.0.0.1:${port}` } }, (r) => {
        let t = ""; r.on("data", (c) => (t += c)); r.on("end", () => done({ status: r.statusCode!, json: JSON.parse(t) }));
      });
      req.end(body);
    });
    const a = await send("take 1.mp4", "video bytes");
    expect(a.status).toBe(200);
    expect(a.json.path).toMatch(/rushes[\\/]take 1\.mp4$/);
    expect(readFileSync(a.json.path, "utf8")).toBe("video bytes");
    // The same video dropped again is the same file; another one with that name gets its own.
    expect((await send("take 1.mp4", "video bytes")).json.path).toBe(a.json.path);
    expect((await send("take 1.mp4", "other take")).json.path).toMatch(/take 1 \(2\)\.mp4$/);
    expect((await send("notes.txt", "x")).status).toBe(400);
    expect((await send("../evil.mp4", "x")).json.path).toMatch(/rushes[\\/]evil\.mp4$/);
  });

  it("deletes an Inspiration file into the folder's trash, and nothing outside the folder", async () => {
    process.env.ADAM_INSPIRATION = join(root, "inspiration");
    const r = await upload(`/api/library/upload?name=${encodeURIComponent("to drop.png")}`, Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("to drop")]));
    writeFileSync(`${r.json.saved}.txt`, "notes");
    const del = await call("DELETE", `/api/library/file?path=${encodeURIComponent(r.json.saved)}`);
    expect(del.status).toBe(200);
    expect(existsSync(r.json.saved)).toBe(false);
    expect(existsSync(`${r.json.saved}.txt`)).toBe(false);
    expect(existsSync(del.json.trashed)).toBe(true);
    expect(del.json.trashed).toMatch(/inspiration.\.trash/);
    expect((await call("DELETE", `/api/library/file?path=${encodeURIComponent(join(root, "secret.txt"))}`)).status).toBe(404);
  });

  it("removes an unused asset from the video, and refuses one the edit still uses", async () => {
    const used = await call("DELETE", `${P}/assets/c01`);
    expect(used.status).toBe(409);
    expect(used.json.error).toMatch(/c01.*used/);
    const del = await call("DELETE", `${P}/assets/logo_final`);
    expect(del.status).toBe(200);
    expect((await call("GET", P)).json.assets).toEqual([]);
    expect(existsSync(join(root, "projet démo", "assets", "logo_final.png"))).toBe(false);
    expect((await call("DELETE", `${P}/assets/nope`)).status).toBe(404);
  });

  it("moves a deleted project to the trash, never while it works", async () => {
    const dir = join(root, "old one");
    mkdirSync(dir);
    writeFileSync(join(dir, "project.json"), "{}");
    expect((await call("DELETE", `/api/projects/${encodeURIComponent("old one")}`)).status).toBe(200);
    expect((await call("GET", "/api/projects")).json.map((p: { name: string }) => p.name)).not.toContain("old one");
    expect(readdirSync(join(root, ".trash")).some((d) => d.startsWith("old one "))).toBe(true);
    expect((await call("DELETE", `/api/projects/${encodeURIComponent("nope")}`)).status).toBe(404);
  });
});
