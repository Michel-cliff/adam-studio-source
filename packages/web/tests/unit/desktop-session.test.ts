import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createApp } from "../../server/app";

it("requires the private desktop session on static files and API requests", async () => {
  const root = mkdtempSync(join(tmpdir(), "adam-desktop-session-"));
  const settingsFile = join(root, "ui.json");
  writeFileSync(settingsFile, JSON.stringify({ projectsRoot: root }));
  const server = createApp({ settingsFile, home: root, sessionToken: "isolated-test-secret", ai: async () => "unused" });
  server.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    expect((await fetch(base + "/api/ping")).status).toBe(403);
    expect((await fetch(base + "/")).status).toBe(403);
    expect((await fetch(base + "/api/ping", { headers: { "x-adam-desktop-token": "wrong" } })).status).toBe(403);
    const res = await fetch(base + "/api/ping", { headers: { "x-adam-desktop-token": "isolated-test-secret" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: "adam-studio" });
    expect(server.hasActiveWork()).toBe(false);
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});
