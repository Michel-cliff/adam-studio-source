import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";

const randomToken = () => randomBytes(32).toString("hex");
const tokenPattern = /^[a-f0-9]{64}$/;
const matches = (actual: string | undefined, expected: string) =>
  typeof actual === "string" && tokenPattern.test(actual) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));

export function launcherKey(profile: string, port: number, role = "launch"): string {
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  const file = join(profile, "browser-" + role + "-" + port + ".key");
  try { writeFileSync(file, randomToken(), { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const key = readFileSync(file, "utf8");
  if (!tokenPattern.test(key)) throw new Error("Invalid Adam Studio browser launcher key");
  return key;
}

export const launchProof = (key: string, challenge: string) => createHmac("sha256", key).update("adam-launch:" + challenge).digest("hex");

export function browserSession(launcher: string, port: number, mcpKey?: string) {
  const usedLaunches = new Map<string, number>();
  const session = randomToken();
  const cookie = "adam_studio_" + port;
  const tickets = new Map<string, number>();
  const issue = () => {
    const now = Date.now();
    for (const [key, expires] of tickets) if (expires <= now) tickets.delete(key);
    if (tickets.size >= 16) tickets.delete(tickets.keys().next().value!);
    const ticket = randomToken();
    tickets.set(ticket, now + 120_000);
    return ticket;
  };
  const authorize = (req: IncomingMessage, res: ServerResponse, actualPort: number): boolean => {
    const path = (req.url ?? "").split("?", 1)[0] ?? "";
    const method = req.method;
    const site = req.headers["sec-fetch-site"];
    const origin = "http://127.0.0.1:" + actualPort;
    const deny = () => {
      res.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "application/json" }).end('{"error":"Open Adam Studio from its local launcher."}');
      return false;
    };
    if (req.headers.host !== "127.0.0.1:" + actualPort) return deny();
    if (path === "/__adam/launch") {
      const header = req.headers["x-adam-launcher"];
      const nonce = req.headers["x-adam-challenge"];
      const now = Date.now();
      for (const [key, expires] of usedLaunches) if (expires <= now) usedLaunches.delete(key);
      if (method !== "POST" || req.headers.origin !== undefined || site !== undefined ||
          typeof nonce !== "string" || !/^\d{13}\.[a-f0-9]{64}$/.test(nonce) ||
          Math.abs(now - Number(nonce.slice(0, 13))) > 30_000 || usedLaunches.has(nonce) ||
          typeof header !== "string" || !matches(header, launchProof(launcher, nonce))) return deny();
      usedLaunches.set(nonce, now + 60_000);
      res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "text/plain" }).end(issue());
      return false;
    }
    if (path.startsWith("/__adam/open/")) {
      const ticket = path.slice("/__adam/open/".length);
      if (method !== "GET" || (site && site !== "none" && site !== "same-origin") ||
          (tickets.get(ticket) ?? 0) <= Date.now()) return deny();
      tickets.delete(ticket);
      res.writeHead(303, {
        Location: "/", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        "Set-Cookie": cookie + "=" + session + "; Path=/; HttpOnly; SameSite=Strict",
      }).end();
      return false;
    }
    if (mcpKey && !site && req.headers.origin === undefined &&
        matches(req.headers["x-adam-mcp"] as string | undefined, mcpKey)) {
      if ((method === "GET" && (path === "/api/ping" || /^\/api\/jobs\/[^/]+$/.test(path))) ||
          (method === "POST" && /^\/api\/projects\/[^/]+\/jobs$/.test(path))) return true;
      return deny();
    }
    const value = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookie + "="))?.slice(cookie.length + 1);
    if (!matches(value, session) || (site && site !== "same-origin" && site !== "none")) return deny();
    if (method !== "GET" && method !== "HEAD" && req.headers.origin !== origin) return deny();
    return true;
  };
  return { issue, authorize };
}
export type BrowserSession = ReturnType<typeof browserSession>;
