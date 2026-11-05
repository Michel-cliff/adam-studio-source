import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/app";
import { setProjectsRoot } from "../../server/settings";
import { makeSynthetic } from "../../../render/tests/e2e/synthetic";
let server: Server, base: string, dir: string;
const call = (path: string, data: unknown, method = "POST") => fetch(base + path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const edit = (b: unknown) => call("/api/projects/demo/edit", b);
const raw = () => JSON.parse(readFileSync(join(dir, "project.json"), "utf8"));
beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "adam-inspector-")); dir = join(root, "demo"); mkdirSync(dir); makeSynthetic(dir);
  const settingsFile = join(root, "ui.json"); setProjectsRoot(root, settingsFile);
  server = createApp({ settingsFile }).listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120000);
afterAll(() => server.close());
it("saves transformations and free positioning atomically, resolves them for rendering and undoes both", async () => {
  const before = raw(), e = before.elements.find((e: any) => !e.kind.startsWith("camera."));
  const value = { ...e, position: { x: .25, y: .35 }, scale: .75, rotation: -12, opacity: .6 };
  const r = await edit({ op: "inspect", kind: "element", id: e.id, value, style: { textLayout: "free" } }); expect(r.status).toBe(200);
  const p = await (await fetch(base + "/api/projects/demo/preview")).json();
  expect(p.timeline.elements.find((v: any) => v.id === e.id)).toMatchObject({ x: .25, y: .35, scale: .75, rotation: -12, opacity: .6 });
  expect(raw().styleOverrides.textLayout).toBe("free"); expect((await edit({ op: "undo" })).status).toBe(200); expect(raw()).toEqual(before);
});
it("refuses invalid transformations, renamed ids and invalid global styles without a partial write", async () => {
  const before = raw(), e = before.elements[0];
  for (const value of [{ ...e, opacity: 5 }, { ...e, id: "renamed" }]) expect((await edit({ op: "inspect", kind: "element", id: e.id, value, style: { textLayout: "free" } })).status).toBe(400);
  expect((await edit({ op: "inspect", kind: "style", style: { grade: { brightness: 8 } } })).status).toBe(400);
  expect(raw()).toEqual(before);
});
it("splits source timing and preserves the ending transition, with a reversible edit", async () => {
  const before = raw(), clip = before.story[0], midpoint = Math.round((clip.outMs - clip.inMs) / 2);
  expect((await edit({ op: "split", id: clip.id, offsetMs: midpoint })).status).toBe(200);
  const after = raw(); expect(after.story.length).toBe(before.story.length + 1);
  expect(after.story[0].outMs).toBe(after.story[1].inMs); expect(after.story[1].transitionOut).toEqual(clip.transitionOut);
  expect(after.story[1].outMs).toBe(clip.outMs);
  await edit({ op: "undo" }); expect(raw()).toEqual(before);
  expect((await edit({ op: "split", id: clip.id, offsetMs: 0 })).status).toBe(400);
});
it("persists tour completion and rejects unsupported uploads", async () => {
  expect(await (await fetch(base + "/api/onboarding")).json()).toMatchObject({ completed: false });
  expect((await call("/api/onboarding", { reason: "finished" }, "PUT")).status).toBe(200);
  expect(await (await fetch(base + "/api/onboarding")).json()).toMatchObject({ completed: true });
  expect((await fetch(base + "/api/editor/fonts?name=bad.ttf", { method: "POST", body: "invalid" })).status).toBe(400);
  const font = readFileSync("C:/Windows/Fonts/arial.ttf");
  expect((await fetch(base + "/api/editor/fonts?name=MyFont.ttf", { method: "POST", body: font })).status).toBe(200);
  const list = await (await fetch(base + "/api/editor/fonts")).json(); expect(list.fonts.some((f: any) => f.family === "MyFont")).toBe(true);
});
