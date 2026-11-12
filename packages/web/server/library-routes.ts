import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, extname, join, relative } from "node:path";
import { limitBytes } from "@adam-studio/library/src/public-network";
import { libraryUrl } from "@adam-studio/library/src/access";
import { importAsset, type ImportSource } from "@adam-studio/library/src/importer";
import { inspirationRoot, kindOf, REFERENCE_FOLDERS, scanInspiration, searchLocal, type LibraryKind, type ReferenceFolder } from "@adam-studio/library/src/local";
import { searchOnline } from "@adam-studio/library/src/online";
import { serveFile } from "./files";
import { realInside, safeName } from "./guards";
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
  return Boolean(realInside(inspirationRoot(), path));
}

const digest = (file: string) => createHash("sha1").update(readFileSync(file)).digest("hex");
/** Another file of the Inspiration folder with exactly the same bytes, whatever its name or folder. */
function sameFile(file: string): string | null {
  const size = statSync(file).size;
  let mine: string | null = null;
  for (const item of scanInspiration()) {
    if (item.path === file || !existsSync(item.path) || statSync(item.path).size !== size) continue;
    mine ??= digest(file);
    if (digest(item.path) === mine) return item.path;
  }
  return null;
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
  // A file dragged onto another folder: moved there with its .txt notes, renamed rather than overwriting.
  if (path === "/api/library/move" && method === "POST") {
    const b = await c.body();
    const file = String(b.path ?? "");
    const rel = relative(inspirationRoot(), file);
    if (!insideInspiration(file) || !existsSync(file) || rel.split(/[\\/]/)[0]!.startsWith(".")) { send(404, { error: "not in the Inspiration folder" }); return true; }
    const category = folderParam(String(b.category ?? "")) ?? "other";
    const folder = category !== "other" ? join(inspirationRoot(), "references", category) : join(inspirationRoot(), "Uploads");
    mkdirSync(folder, { recursive: true });
    const name = basename(file), ext = extname(name), stem = basename(name, ext);
    if (dirname(file) === folder) { send(200, { moved: file }); return true; }
    let moved = join(folder, name);
    for (let i = 2; existsSync(moved); i++) moved = join(folder, `${stem} (${i})${ext}`);
    renameSync(file, moved);
    if (existsSync(`${file}.txt`)) renameSync(`${file}.txt`, `${moved}.txt`);
    send(200, { moved });
    return true;
  }
  // A dropped file: saved in its reference folder, or Inspiration/Uploads (never over an existing one), and imported
  // into a project if one is named.
  if (path === "/api/library/upload" && method === "POST") {
    const name = basename(url.searchParams.get("name") ?? "").replace(/[<>:"|?*\u0000-\u001f]/g, "_");
    const kind = kindOf(name);
    if (!name || !kind) throw new ToolError(`cannot use ${name || "this file"}: drop a video, image, sound, font or Lottie file`);
    const project = url.searchParams.get("project");
    if (project && (!safeName(project) || !realInside(c.root, join(c.root, project, "project.json")))) throw new ToolError(`no project "${project}"`);
    const category = folderParam(url.searchParams.get("category"));
    const folder = category && category !== "other" ? join(inspirationRoot(), "references", category) : join(inspirationRoot(), "Uploads");
    mkdirSync(folder, { recursive: true });
    if (!realInside(inspirationRoot(), folder)) throw new ToolError("Invalid library folder.");
    const ext = extname(name), stem = basename(name, ext);
    let saved = join(folder, name);
    for (let i = 2; existsSync(saved); i++) saved = join(folder, `${stem} (${i})${ext}`);
    let owned = false;
    const stream = createWriteStream(saved, { flags: "wx" });
    stream.once("open", () => { owned = true; });
    try { await pipeline(c.req, limitBytes(300 * 1024 ** 2), stream); }
    catch (e) { if (owned) rmSync(saved, { force: true }); throw new ToolError(`upload failed: ${(e as Error).message}`); }
    const twin = sameFile(saved);
    if (twin) { rmSync(saved, { force: true }); send(409, { error: `already in your library: ${relative(inspirationRoot(), twin)}`, existing: twin }); return true; }
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
    if (!safeName(project) || !realInside(c.root, join(c.root, project, "project.json"))) throw new ToolError(`no project "${project}"`);
    const source = (b.source ?? {}) as ImportSource;
    if (source.path && !insideInspiration(source.path)) throw new ToolError("local imports come from the Inspiration folder");
    if (source.url && !libraryUrl(source.url)) throw new ToolError("only results of the online libraries can be downloaded");
    const dir = join(c.root, project);
    let imported;
    try { imported = await importAsset(dir, source, b.id || undefined, libraryUrl); } catch (e) { throw new ToolError((e as Error).message); }
    if (imported.kind === "font") { send(200, { imported, message: `font copied to ${imported.path}: use it in the style (fonts.caption or fonts.title)` }); return true; }
    send(200, { imported, ...addAssetIn(dir, { id: imported.id, kind: imported.kind, path: imported.path }) });
    return true;
  }
  return false;
}
