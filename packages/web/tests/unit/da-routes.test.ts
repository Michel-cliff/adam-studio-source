import { mkdirSync, mkdtempSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSynthetic } from "../../../render/tests/e2e/synthetic";
import { createApp } from "../../server/app";
import { readStats } from "../../server/stats";
import { setProjectsRoot, setUiLang } from "../../server/settings";

let server: Server; let base: string; let root: string;
const put = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "adam da-"));
  mkdirSync(join(root, "demo"));
  makeSynthetic(join(root, "demo"));
  const settingsFile = join(root, "ui.json");
  setProjectsRoot(root, settingsFile);
  setUiLang("fr", settingsFile);
  server = createApp({ settingsFile, dist: join(root, "no-dist") }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120000);
afterAll(() => server.close());

describe("the guided art direction path", () => {
  it("saves a step at once, and says which lines are set", async () => {
    const r = await put("/api/da/motion", { value: "light" });
    expect(r.da.motion).toBe("light");
    expect(r.status.find((s: { step: string }) => s.step === "motion").set).toBe(true);
    expect((await fetch(`${base}/api/da/motion`, { method: "PUT", body: JSON.stringify({ value: "wild" }) })).status).toBe(400);
  });

  it("writes the don'ts as rules Adam already follows", async () => {
    await put("/api/da/donts", { text: "Pas de musique triste\nJamais de texte jaune" });
    const rules = readStats(root).rules.filter((r) => r.topic === "donts").map((r) => r.text);
    expect(rules).toEqual(["Pas de musique triste", "Jamais de texte jaune"]);
  });

  it("gives a step's options in the creator's language, with what Adam derived", async () => {
    const r = await fetch(`${base}/api/projects/demo/da/rhythm`).then((x) => x.json());
    expect(r.options.map((o: { value: string }) => o.value)).toEqual(["calm", "standard", "tight"]);
    expect(r.say).toMatch(/respirations/);
    expect(r.options[0].label).toMatch(/Posé/);
  });
});
