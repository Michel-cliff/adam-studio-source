import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSynthetic } from "../../../render/tests/e2e/synthetic";
import { createApp } from "../../server/app";
import { stepContext } from "../../server/context";
import { readScript, saveScript } from "../../server/script";
import { setProjectsRoot } from "../../server/settings";

let server: Server; let base: string; let root: string;
const asked: string[] = [];
const fake = async (q: { prompt: string }) => { asked.push(q.prompt); return "HOOK\nred blue\n\nPROBLEM\ngreen gray"; };
const call = (path: string, method = "GET", body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json() }));

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "adam script-"));
  mkdirSync(join(root, "ep"));
  makeSynthetic(join(root, "ep"));
  const settingsFile = join(root, "settings", "ui.json");
  setProjectsRoot(root, settingsFile);
  server = createApp({ settingsFile, dist: join(root, "no-dist"), home: join(root, "home"), ai: fake }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120000);
afterAll(() => server.close());

describe("the script of a video", () => {
  it("is empty until written, keeps who wrote it, and refuses a huge one", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam script-dir-"));
    expect(readScript(dir)).toEqual({ text: "", by: "" });
    saveScript(dir, "  My plan.  ", "you");
    expect(readScript(dir)).toMatchObject({ text: "My plan.", by: "you" });
    expect(() => saveScript(dir, "x".repeat(30001), "you")).toThrow(/too long/);
  });

  it("is drafted by the AI from the transcript, then edited by the creator", async () => {
    expect((await call("/api/projects/ep/script")).json).toEqual({ text: "", by: "" });
    const d = await call("/api/projects/ep/script/draft", "POST");
    expect(d.json).toMatchObject({ text: "HOOK\nred blue\n\nPROBLEM\ngreen gray", by: "ai" });
    expect(asked.at(-1)).toMatch(/red blue green gray/);
    const e = await call("/api/projects/ep/script", "PUT", { text: "HOOK\nred blue, louder" });
    expect(e.json).toMatchObject({ text: "HOOK\nred blue, louder", by: "you" });
  });

  it("goes with every ask, so the AI knows what the creator meant to say", () => {
    writeFileSync(join(root, "ep", "script.json"), JSON.stringify({ text: "HOOK\nThe result first.", by: "you", at: 1 }));
    expect(stepContext(join(root, "ep"), "structure")).toMatch(/## The creator's script\nHOOK\nThe result first\./);
  });
});
