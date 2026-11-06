import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { takeSessionToken } from "../../server/guards";
import { setProjectsRoot } from "../../server/settings";

async function withApp(fn: (base: string) => Promise<void>) {
  const home = mkdtempSync(join(tmpdir(), "adam-files-")), settingsFile = join(home, "settings.json"), root = join(home, "p"), dist = join(home, "dist");
  mkdirSync(join(root, "demo", "assets"), { recursive: true });
  mkdirSync(join(dist, "assets"), { recursive: true });
  setProjectsRoot(root, settingsFile);
  writeFileSync(join(root, "demo", "project.json"), JSON.stringify({ name: "demo" }));
  for (const f of ["evil.html", "evil.js", "evil.css", "evil.svg", "photo.png"]) writeFileSync(join(root, "demo", "assets", f), "<script>alert(1)</script>");
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>panel</title>");
  writeFileSync(join(dist, "assets", "app.js"), "1");
  const app = createApp({ settingsFile, dist, home });
  await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
  try { await fn(`http://127.0.0.1:${(app.address() as AddressInfo).port}`); } finally { app.closeAllConnections(); app.close(); }
}

describe("what the server lets a file do", () => {
  it("runs the panel under a policy that refuses scripts from elsewhere", async () => {
    await withApp(async (base) => {
      const page = await fetch(`${base}/`);
      expect(page.headers.get("content-type")).toContain("text/html");
      const csp = page.headers.get("content-security-policy")!;
      expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toMatch(/script-src[^;]*('unsafe-inline'|'unsafe-eval'|https:)/);
      expect((await fetch(`${base}/assets/app.js`)).headers.get("content-type")).toBe("text/javascript");
    });
  });

  it("never serves a project's page or script as one", async () => {
    await withApp(async (base) => {
      for (const f of ["evil.html", "evil.js", "evil.css"]) {
        const r = await fetch(`${base}/api/projects/demo/files/assets/${f}`);
        expect(r.status, f).toBe(200);
        expect(r.headers.get("content-type"), f).toBe("application/octet-stream");
        expect(r.headers.get("x-content-type-options"), f).toBe("nosniff");
        expect(r.headers.get("content-security-policy"), f).toContain("sandbox");
      }
    });
  });

  it("keeps a project's pictures usable, sandboxed when opened alone", async () => {
    await withApp(async (base) => {
      const svg = await fetch(`${base}/api/projects/demo/files/assets/evil.svg`);
      expect(svg.headers.get("content-type")).toBe("image/svg+xml");
      expect(svg.headers.get("content-security-policy")).toContain("sandbox");
      expect((await fetch(`${base}/api/projects/demo/files/assets/photo.png`)).headers.get("content-type")).toBe("image/png");
    });
  });
});

describe("the session token", () => {
  it("leaves the environment the moment it is read, so no child process inherits it", () => {
    const env: NodeJS.ProcessEnv = { ADAM_DESKTOP_TOKEN: "secret", PATH: "x" };
    expect(takeSessionToken(env)).toBe("secret");
    expect(env).toEqual({ PATH: "x" });
    expect(takeSessionToken(env)).toBeUndefined();
  });
});
