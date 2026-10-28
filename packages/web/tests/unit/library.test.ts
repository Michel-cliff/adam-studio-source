import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSynthetic } from "../../../render/tests/e2e/synthetic";
import { createApp } from "../../server/app";
import { setProjectsRoot } from "../../server/settings";

let server: Server; let base: string; let root: string; let inspi: string; const prev = process.env.ADAM_INSPIRATION;
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  inspi = mkdtempSync(join(tmpdir(), "adam lib inspi-"));
  process.env.ADAM_INSPIRATION = inspi;
  mkdirSync(join(inspi, "Sons"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=500:duration=0.3", join(inspi, "Sons", "boom.wav")]);
  root = mkdtempSync(join(tmpdir(), "adam lib projects-"));
  mkdirSync(join(root, "ep1"));
  makeSynthetic(join(root, "ep1"));
  writeFileSync(join(root, "secret.wav"), "x");
  const settingsFile = join(root, "ui.json");
  setProjectsRoot(root, settingsFile);
  server = createApp({ settingsFile, dist: join(root, "no-dist") }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120000);
afterAll(() => { server.close(); if (prev === undefined) delete process.env.ADAM_INSPIRATION; else process.env.ADAM_INSPIRATION = prev; });

describe("library routes", () => {
  it("searches the Inspiration folder and imports into a project", async () => {
    const s = await (await fetch(`${base}/api/library/search?q=boom`)).json();
    expect(s.local.map((i: { title: string }) => i.title)).toEqual(["boom"]);
    expect((await fetch(`${base}/api/library/file?path=${encodeURIComponent(s.local[0].path)}`)).status).toBe(200);
    const r = await post("/api/library/import", { project: "ep1", source: { path: s.local[0].path } });
    expect(r.status).toBe(200);
    const project = JSON.parse(readFileSync(join(root, "ep1", "project.json"), "utf8"));
    expect(project.assets.find((a: { id: string }) => a.id === "boom")).toMatchObject({ kind: "audio", path: "assets/boom.wav" });
  });

  it("lists the four reference folders, takes a drop into one, and searches one folder at a time", async () => {
    const f = await (await fetch(`${base}/api/library/folders`)).json();
    expect(f.folders.map((x: { id: string }) => x.id)).toEqual(["typo", "plans", "sous-titres", "images-textures-palettes", "sons", "interdits", "other"]);
    const up = await fetch(`${base}/api/library/upload?name=yellow.png&category=sous-titres`, { method: "POST", body: "x" });
    expect((await up.json()).saved).toMatch(/references[\\/]sous-titres[\\/]yellow\.png$/);
    const s = await (await fetch(`${base}/api/library/search?q=&category=sous-titres`)).json();
    expect(s.local.map((i: { title: string; category: string }) => [i.title, i.category])).toEqual([["yellow", "sous-titres"]]);
    const after = await (await fetch(`${base}/api/library/folders`)).json();
    expect(after.folders.find((x: { id: string }) => x.id === "sous-titres").count).toBe(1);
    expect((await fetch(`${base}/api/library/upload?name=a.png&category=../x`, { method: "POST", body: "x" })).status).toBe(400);
  });

  it("moves a file and its notes from one folder to another, never over an existing file", async () => {
    mkdirSync(join(inspi, "references", "plans"), { recursive: true });
    writeFileSync(join(inspi, "references", "plans", "grain.png"), "old");
    const up = await (await fetch(`${base}/api/library/upload?name=grain.png&category=sous-titres`, { method: "POST", body: "new" })).json();
    writeFileSync(`${up.saved}.txt`, "soft grain");
    const r = await post("/api/library/move", { path: up.saved, category: "plans" });
    expect(r.status).toBe(200);
    const { moved } = await r.json();
    expect(moved).toMatch(/references[\\/]plans[\\/]grain \(2\)\.png$/);
    expect(readFileSync(moved, "utf8")).toBe("new");
    expect(readFileSync(`${moved}.txt`, "utf8")).toBe("soft grain");
    expect(readFileSync(join(inspi, "references", "plans", "grain.png"), "utf8")).toBe("old");
    const s = await (await fetch(`${base}/api/library/search?q=grain&category=sous-titres`)).json();
    expect(s.local).toEqual([]);
    expect((await post("/api/library/move", { path: moved, category: "../x" })).status).toBe(400);
    expect((await post("/api/library/move", { path: join(root, "secret.wav"), category: "plans" })).status).toBe(404);
  });

  it("refuses a dropped file that is already in the library, whatever its name or folder", async () => {
    const first = await fetch(`${base}/api/library/upload?name=bulb.png&category=sons`, { method: "POST", body: "same bytes" });
    expect(first.status).toBe(200);
    const again = await fetch(`${base}/api/library/upload?name=bulb-copy.png&category=plans`, { method: "POST", body: "same bytes" });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch(/already.*bulb\.png/);
    const f = await (await fetch(`${base}/api/library/search?q=bulb&category=plans`)).json();
    expect(f.local).toEqual([]);
    expect((await fetch(`${base}/api/library/upload?name=bulb.png&category=sons`, { method: "POST", body: "other bytes" })).status).toBe(200);
  });

  it("never reads or imports outside the Inspiration folder", async () => {
    expect((await fetch(`${base}/api/library/file?path=${encodeURIComponent(join(root, "secret.wav"))}`)).status).toBe(404);
    expect((await post("/api/library/import", { project: "ep1", source: { path: join(root, "secret.wav") } })).status).toBe(400);
    expect((await post("/api/library/import", { project: "ep1", source: { url: "http://example.com/a.mp3" } })).status).toBe(400);
    expect((await post("/api/library/import", { project: "../x", source: { path: join(inspi, "Sons", "boom.wav") } })).status).toBe(400);
  });
});
