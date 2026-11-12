import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { expect, it } from "vitest";
import { browserSession, launchProof } from "../../server/browser-session";

it("requires a browser session and accepts each launch proof and ticket only once", async () => {
  const launcher = randomBytes(32).toString("hex");
  const session = browserSession(launcher, 4317);
  const server = createServer((req, res) => {
    const address = server.address();
    if (address && typeof address !== "string" && session.authorize(req, res, address.port)) res.end("authorized");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local test address");
  const origin = "http://127.0.0.1:" + address.port;
  const request = (path: string, options?: RequestInit) => fetch(origin + path, { ...options, redirect: "manual" });
  try {
    expect((await request("/api/projects")).status).toBe(403);

    const challenge = Date.now() + "." + randomBytes(32).toString("hex");
    const headers = { "x-adam-challenge": challenge, "x-adam-launcher": launchProof(launcher, challenge) };
    const launch = await request("/__adam/launch", { method: "POST", headers });
    expect(launch.status).toBe(200);
    const ticket = await launch.text();
    expect((await request("/__adam/launch", { method: "POST", headers })).status).toBe(403);

    const open = await request("/__adam/open/" + ticket);
    expect(open.status).toBe(303);
    expect(open.headers.get("location")).toBe("/");
    const setCookie = open.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly; SameSite=Strict");
    const cookie = setCookie.split(";")[0]!;
    expect((await request("/__adam/open/" + ticket)).status).toBe(403);
    expect((await request("/api/projects", { headers: { cookie } })).status).toBe(200);
    expect((await request("/api/projects/example", { method: "DELETE", headers: { cookie } })).status).toBe(403);
    expect((await request("/api/projects/example", { method: "DELETE", headers: { cookie, origin: "https://example.com" } })).status).toBe(403);
    expect((await request("/api/projects/example", { method: "DELETE", headers: { cookie, origin } })).status).toBe(200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
