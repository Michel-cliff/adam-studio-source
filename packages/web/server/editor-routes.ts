import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { basename, extname, join } from "node:path";
import { fontsDir } from "@adam-studio/render/src/lib/da";
import { ToolError } from "./store";

const hostFontsDir = () => { const saved = process.env.ADAM_FONTS; delete process.env.ADAM_FONTS; try { return fontsDir(); } finally { if (saved !== undefined) process.env.ADAM_FONTS = saved; } };
type Ctx = { req: IncomingMessage; url: URL; method: string; dir: string; send: (s: number, b: unknown) => void; body: () => Promise<Record<string, any>> };
const fontList = (dir: string) => [...new Set([fontsDir(), hostFontsDir(), join(dir, "editor-fonts")])].flatMap(folder => !existsSync(folder) ? [] : readdirSync(folder).filter(n => /\.(ttf|otf)$/i.test(n)).map(n => ({ family: basename(n, extname(n)).replace(/-[a-f\d]{12}$/, ""), file: join(folder, n) })))
  .sort((a, b) => a.family.localeCompare(b.family));

export async function editorRoute(c: Ctx): Promise<boolean> {
  const { method, url, dir, send } = c;
  if (url.pathname === "/api/editor/fonts") {
    if (method === "GET") { send(200, { fonts: fontList(dir) }); return true; }
    if (method !== "POST") return false;
    const name = basename(url.searchParams.get("name") ?? "").replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 160);
    if (!/\.(ttf|otf)$/i.test(name)) throw new ToolError("choose a TTF or OTF font");
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of c.req) { size += chunk.length; if (size > 12 * 1024 * 1024) throw new ToolError("font exceeds 12 MB"); chunks.push(Buffer.from(chunk)); }
    const bytes = Buffer.concat(chunks), magic = bytes.subarray(0, 4).toString("hex");
    if (!["00010000", "4f54544f", "74727565"].includes(magic) || bytes.length < 12) throw new ToolError("not a TTF or OTF font");
    const folder = join(dir, "editor-fonts"); mkdirSync(folder, { recursive: true });
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const file = join(folder, `${basename(name, extname(name))}-${hash}${extname(name).toLowerCase()}`);
    if (!existsSync(file)) writeFileSync(file, bytes, { flag: "wx" });
    send(200, { fonts: fontList(dir) }); return true;
  }
  if (url.pathname === "/api/onboarding") {
    const file = join(dir, "onboarding.json");
    if (method === "GET") {
      let completed = false;
      try { const v = JSON.parse(readFileSync(file, "utf8")); completed = v.version === 1 && Boolean(v.completedAt); } catch { /* first start */ }
      send(200, { version: 1, completed }); return true;
    }
    if (method === "PUT") {
      const b = await c.body();
      if (!["finished", "skipped"].includes(b.reason)) throw new ToolError("unknown onboarding state");
      mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ version: 1, completedAt: new Date().toISOString(), reason: b.reason }));
      send(200, { completed: true }); return true;
    }
  }
  return false;
}
