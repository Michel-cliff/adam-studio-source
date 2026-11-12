import { isAbsolute, relative, resolve } from "node:path";
export { realInside } from "@adam-studio/render/src/project-paths";

/** The session token, taken out of the environment: everything this process starts (the AI among them) inherits it otherwise. */
export function takeSessionToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = env.ADAM_DESKTOP_TOKEN;
  delete env.ADAM_DESKTOP_TOKEN;
  return token;
}

export function hostAllowed(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** Reads are open to any origin (they change nothing); writes only from the panel itself. */
export function originAllowed(method: string, origin: string | undefined, port: number): boolean {
  if (method === "GET" || method === "HEAD" || origin === undefined) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

export function safeName(name: string): boolean {
  return name.length > 0 && name.length <= 120 && name.trim() === name && name !== "." && name !== ".." && !/^[.]/.test(name) && !/[\\/:*?"<>|\u0000-\u001f]/.test(name) && !name.endsWith(".") && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name);
}

/** The absolute path of rel inside root, or null when it would leave root (or is root itself). */
export function inside(root: string, rel: string): string | null {
  if (!rel || isAbsolute(rel) || /[:\u0000]/.test(rel)) return null;
  const full = resolve(root, rel);
  const r = relative(resolve(root), full);
  return r === "" || r === ".." || r.startsWith("../") || r.startsWith("..\\") || isAbsolute(r) ? null : full;
}
