import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listDAs, readDA, useDA, withDA } from "@adam-studio/render/src/lib/da";
import { createApp } from "../../server/app";
import { learnedFor } from "../../server/stats";
import { setProjectsRoot, setUiLang } from "../../server/settings";

let server: Server, base: string, dir: string;
let badAnswer = false, calls = 0, receivedImages: string[] = [];
const request = (path: string, body: unknown, method = "POST") => fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "adam-da-import-"));
  const settings = join(dir, "ui.json"); setProjectsRoot(join(dir, "projects"), settings); setUiLang("fr", settings);
  server = createApp({ settingsFile: settings, dist: join(dir, "no-dist"), ai: async (q) => {
    calls++; receivedImages = q.images ?? [];
    expect(q.prompt).toContain("French");
    return badAnswer ? '{"summary":"incomplete"}' : JSON.stringify({ summary: "Une signature éditoriale sobre.", guidance: ["Titres courts et contrastés"], uncertainties: ["Police exacte inconnue", "Son non analysé"], accent: "#123456", captions: "bold", motion: "default" });
  } }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120000);
afterAll(() => server.close());

describe("art direction onboarding and reference import", () => {
  const ids: string[] = [];
  it("offers the two entrances once and honours doing it later", async () => {
    expect((await fetch(base + "/api/da").then((r) => r.json())).needsSetup).toBe(true);
    await request("/api/da/onboarding", {});
    expect((await fetch(base + "/api/da").then((r) => r.json())).needsSetup).toBe(false);
  });
  it("refuses invalid batches and names before invoking AI", async () => {
    for (const ids of [[], ["../escape", "b", "c"], Array(6).fill("x")]) expect((await request("/api/da/import", { name: "References", ids })).status).toBe(400);
    expect((await request("/api/da/import", { name: "../escape", ids: ["a", "b", "c"] })).status).toBe(400);
    expect((await request("/api/da/references?name=notes.txt", {})).status).toBe(400);
    expect(calls).toBe(0); expect(listDAs(dir).active).toBe("default");
  });
  it("uploads three videos, samples real frames, persists a usable DA, without inventing motion", async () => {
    for (const colour of ["red", "green", "blue"]) {
      const file = join(dir, colour + ".mp4");
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${colour}:s=180x320:d=1`, "-c:v", "libx264", "-pix_fmt", "yuv420p", file], { windowsHide: true });
      const response = await fetch(base + `/api/da/references?name=${colour}.mp4`, { method: "POST", body: readFileSync(file) });
      expect(response.status).toBe(200); ids.push((await response.json()).id);
    }
    const r = await request("/api/da/import", { name: "Ma signature", ids }); expect(r.status).toBe(200);
    const out = await r.json(); expect(out.list.active).toBe("Ma signature"); expect(out.da.motion).toBeUndefined();
    expect(out.da.reference.sources).toHaveLength(3); expect(receivedImages).toHaveLength(12);
    expect(receivedImages.every(existsSync)).toBe(true);
    expect(readDA(dir).accent).toBe("#123456");
    expect(withDA({ styleOverrides: {} } as never, readDA(dir)).styleOverrides).toMatchObject({ colors: { accent: "#123456" } });
  }, 120000);
  it("rejects repeated video content even when uploaded under another name", async () => {
    const response = await fetch(base + "/api/da/references?name=other.mp4", { method: "POST", body: readFileSync(join(dir, "red.mp4")) });
    const duplicate = (await response.json()).id;
    const before = calls;
    expect((await request("/api/da/import", { name: "Duplicate", ids: [ids[0], ids[1], duplicate] })).status).toBe(400);
    expect(calls).toBe(before); expect(listDAs(dir).active).toBe("Ma signature");
  });
  it("leaves the active DA intact on incomplete analysis and permits a retry", async () => {
    badAnswer = true;
    expect((await request("/api/da/import", { name: "Retry", ids })).status).toBe(400);
    expect(listDAs(dir).active).toBe("Ma signature"); expect(listDAs(dir).names).not.toContain("Retry");
    badAnswer = false;
    expect((await request("/api/da/import", { name: "Retry", ids })).status).toBe(200);
  }, 120000);
  it("switches complete profiles including notes and exclusions without leaking across them", async () => {
    await request("/api/da/notes", { text: "Style A" }, "PUT");
    await request("/api/da/donts", { text: "Pas de rose" }, "PUT");
    expect(learnedFor(dir, "look")).toContain("Pas de rose");
    await request("/api/da/use", { name: "Ma signature" });
    expect(readDA(dir).notes).toBeUndefined(); expect(learnedFor(dir, "look")).not.toContain("Pas de rose");
    await request("/api/da/use", { name: "Retry" });
    expect(readDA(dir).notes).toBe("Style A"); expect(learnedFor(dir, "look")).toContain("Pas de rose");
    await request("/api/da/donts", { text: "" }, "PUT"); expect(learnedFor(dir, "look")).not.toContain("Pas de rose");
    expect((await request("/api/da/use", { name: "../escape" })).status).toBe(400);
    useDA(dir, "default"); expect(readDA(dir).reference).toBeUndefined();
  });
});
