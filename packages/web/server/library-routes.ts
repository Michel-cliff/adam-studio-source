import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, extname, join, relative, isAbsolute } from "node:path";
import { importAsset, type ImportSource } from "@adam-studio/library/src/importer";
import { inspirationRoot, kindOf, REFERENCE_FOLDERS, scanInspiration, searchLocal, type LibraryKind, type ReferenceFolder } from "@adam-studio/library/src/local";
import { searchOnline } from "@adam-studio/library/src/online";
import { serveFile } from "./files";
import { safeName } from "./guards";
import { addAssetIn, ToolError } from "./store";

const KINDS = new Set(["video", "image", "audio", "font", "lottie"]);

/** A reference folder named in a query (or none); an unknown one is refused, so it never becomes a path. */
function folderParam(v: string | null): ReferenceFolder | undefined {
  if (!v) return undefined;
  if (v !== "other" && !REFERENCE_FOLDERS.some((f) => f.id === v)) throw new ToolError(`unknown folder "${v}"`);
  return v as ReferenceFolder;
}

type Ctx = {
  req: IncomingMessage; res: ServerResponse; url: URL; method: string; port: number; root: string;
  send: (status: number, body: unknown) => void; body: () => Promise<Record<string, any>>;
};

function insideInspiration(path: string): boolean {
  const r = relative(inspirationRoot(), path);
  return Boolean(r) && !r.startsWith("..") && !isAbsolute(r);
}

/** Library routes; returns false when the path is not one of them. */
export async function libraryRoute(c: Ctx): Promise<boolean> {
  const { url, method, send } = c;
  const path = url.pathname;
  // The reference folders with how many files each holds, plus everything else as "other".
  if (path === "/api/library/folders" && method === "GET") {
    const items = scanInspiration();
    const count = (id: string) => items.filter((i) => i.category === id).length;
    send(200, { root: inspirationRoot(), folders: [...REFERENCE_FOLDERS.map((f) => ({ ...f, count: count(f.id) })), { id: "other", title: "Other", count: count("other") }] });
    return true;
  }
  if (path === "/api/library/search" && method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const kind = url.searchParams.get("kind") || undefined;
    if (kind && !KINDS.has(kind)) throw new ToolError(`unknown kind "${kind}"`);
    const category = folderParam(url.searchParams.get("category"));
    const local = searchLocal(q, kind as LibraryKind | undefined, inspirationRoot(), category);
    const online = url.searchParams.get("online") === "1" && q && kind ? await searchOnline(q, kind as LibraryKind) : { items: [], notes: [] };
    send(200, { root: inspirationRoot(), local, online: online.items, notes: online.notes });
    return true;
  }
  if (path === "/api/library/file" && method === "GET") {
    const file = url.searchParams.get("path") ?? "";
    if (!insideInspiration(file) || !existsSync(file)) { send(404, { error: "not in the Inspiration folder" }); return true; }
    serveFile(c.req, c.res, file);
    return true;
  }
  // Deleting an Inspiration file moves it (and its .txt notes) to Inspiration/.trash, keeping its folders: recoverable.
  if (path === "/api/library/file" && method === "DELETE") {
    const file = url.searchParams.get("path") ?? "";
    const rel = relative(inspirationRoot(), file);
    if (!insideInspiration(file) || !existsSync(file) || rel.split(/[\\/]/)[0]!.startsWith(".")) { send(404, { error: "not in the Inspiration folder" }); return true; }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const trashed = join(inspirationRoot(), ".trash", stamp, rel);
    mkdirSync(dirname(trashed), { recursive: true });
    renameSync(file, trashed);
    if (existsSync(`${file}.txt`)) renameSync(`${file}.txt`, `${trashed}.txt`);
    send(200, { trashed });
    return true;
  }
  // A dropped file: saved in its reference folder, or Inspiration/Uploads (never over an existing one), and imported
  // into a project if one is named.
  if (path === "/api/library/upload" && method === "POST") {
    const name = basename(url.searchParams.get("name") ?? "").replace(/[<>:"|?*\u0000-\u001f]/g, "_");
    const kind = kindOf(name);
    if (!name || !kind) throw new ToolError(`cannot use ${name || "this file"}: drop a video, image, sound, font or Lottie file`);
    const project = url.searchParams.get("project");
    if (project && (!safeName(project) || !existsSync(join(c.root, project, "project.json")))) throw new ToolError(`no project "${project}"`);
    const category = folderParam(url.searchParams.get("category"));
    const folder = category && category !== "other" ? join(inspirationRoot(), "references", category) : join(inspirationRoot(), "Uploads");
    mkdirSync(folder, { recursive: true });
    const ext = extname(name), stem = basename(name, ext);
    let saved = join(folder, name);
    for (let i = 2; existsSync(saved); i++) saved = join(folder, `${stem} (${i})${ext}`);
    try { await pipeline(c.req, createWriteStream(saved, { flags: "wx" })); }
    catch (e) { rmSync(saved, { force: true }); throw new ToolError(`upload failed: ${(e as Error).message}`); }
    if (!project) { send(200, { saved, kind }); return true; }
    const dir = join(c.root, project);
    let imported;
    try { imported = await importAsset(dir, { path: saved, kind }); } catch (e) { throw new ToolError((e as Error).message); }
    if (imported.kind !== "font") addAssetIn(dir, { id: imported.id, kind: imported.kind, path: imported.path });
    send(200, { saved, kind, imported: { id: imported.id, kind: imported.kind, path: imported.path } });
    return true;
  }
  if (path === "/api/library/import" && method === "POST") {
    const b = await c.body();
    const project = String(b.project ?? "");
    if (!safeName(project) || !existsSync(join(c.root, project, "project.json"))) throw new ToolError(`no project "${project}"`);
    const source = (b.source ?? {}) as ImportSource;
    if (source.path && !insideInspiration(source.path)) throw new ToolError("local imports come from the Inspiration folder");
    if (source.url && !/^https:\/\//.test(source.url)) throw new ToolError("only https downloads");
    const dir = join(c.root, project);
    let imported;
    try { imported = await importAsset(dir, source, b.id || undefined); } catch (e) { throw new ToolError((e as Error).message); }
    if (imported.kind === "font") { send(200, { imported, message: `font copied to ${imported.path}: use it in the style (fonts.caption or fonts.title)` }); return true; }
    send(200, { imported, ...addAssetIn(dir, { id: imported.id, kind: imported.kind, path: imported.path }) });
    return true;
  }
  return false;
}
