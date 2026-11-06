import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { kindOf } from "./local";

/**
 * What the AI may touch through look_at and import_asset. It reads text written by strangers (captions, web pages,
 * references), so a hidden instruction must not be able to read any file of the machine or send data to any address.
 */

// The online libraries of search_assets: nothing else is downloaded, so a URL cannot carry data out of the machine.
const LIBRARY_HOSTS = ["pixabay.com", "freesound.org"];

export function libraryUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return LIBRARY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** https to a public address: never this machine or its local network. */
export function publicUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return !/^(localhost|.*\.local|.*\.localhost|0\.0\.0\.0|127\.[\d.]+|10\.[\d.]+|192\.168\.[\d.]+|172\.(1[6-9]|2\d|3[01])\.[\d.]+|169\.254\.[\d.]+|::1?|f[cd][0-9a-f:]*|fe80:[0-9a-f:]*)$/.test(h);
}

/**
 * What the creator wrote in their request, set by the panel for that one request. A link or a path they typed may be
 * opened, exactly as typed: a hidden instruction cannot lengthen it to carry data, nor name another one.
 */
export const creatorWords = () => process.env.ADAM_CREATOR_WORDS ?? "";
const said = (value: string, words: string) => words.length > 0 && value.length > 0 && words.includes(value);

/** The real location: a link inside an allowed folder must not lead out of it. */
function real(path: string): string {
  try { return realpathSync.native(path); } catch { return resolve(path); }
}

/** A media file inside one of the folders: never a document, a key or a network share. */
export function allowedFile(path: string, roots: string[], words = ""): boolean {
  if (!isAbsolute(path) || path.startsWith("\\\\") || path.startsWith("//")) return false;
  const file = real(path);
  if (!kindOf(file)) return false;
  if (said(path, words)) return true;
  return roots.some((root) => {
    const r = relative(real(root), file);
    return Boolean(r) && !r.startsWith("..") && !isAbsolute(r);
  });
}

/** Throws what the creator can act on; a path or URL that passes is safe to open. */
export function checkSource(source: { path?: string; url?: string }, roots: string[], words = creatorWords()): void {
  if (source.url !== undefined && !libraryUrl(source.url) && !(said(source.url, words) && publicUrl(source.url))) throw new Error("only the online libraries and the links the creator wrote can be downloaded from: ask the creator for the link, or to drop this file in their library");
  if (source.path !== undefined && !allowedFile(source.path, roots, words)) throw new Error("only media files of the project and the Inspiration folder, or a path the creator wrote, can be opened: ask the creator to drop this file in their library");
}

/** Where a download may end up: a file host often redirects a link the creator gave, a library result stays in the library. */
export const landing = (url: string) => (libraryUrl(url) ? libraryUrl : publicUrl);

/** look_at takes one string, a path or a URL. */
export function checkLook(source: string, roots: string[], words = creatorWords()): void {
  checkSource(/^[a-z][a-z0-9+.-]*:\/\//i.test(source) ? { url: source } : { path: source }, roots, words);
}
