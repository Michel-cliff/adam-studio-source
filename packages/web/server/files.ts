import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname } from "node:path";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".jpg": "image/jpeg", ".png": "image/png",
  ".json": "application/json", ".svg": "image/svg+xml",
};
// Only the application's own files run as a page or a script: the same names in a project are plain data.
const APP_TYPES: Record<string, string> = { ...TYPES, ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };

/** What the panel may load. Styles stay inline-capable (the interface sets them per element); no script from elsewhere. */
export const APP_CSP = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com", "img-src 'self' data: blob: https://*.pixabay.com https://pixabay.com",
  "media-src 'self' data: blob: https://*.pixabay.com https://*.freesound.org", "connect-src 'self' data: blob:", "worker-src 'self' blob:",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join("; ");
// A file of a project or a library, opened directly: no script, and a page of its own origin, unable to reach the panel.
const DATA_CSP = "sandbox; script-src 'none'";

export function serveFile(req: IncomingMessage, res: ServerResponse, file: string, opts: { app?: boolean } = {}): void {
  let size: number, mtime: number;
  try { const s = statSync(file); if (!s.isFile()) throw new Error("not a file"); size = s.size; mtime = s.mtimeMs; } catch { res.writeHead(404).end(); return; }
  const type = (opts.app ? APP_TYPES : TYPES)[extname(file).toLowerCase()] ?? "application/octet-stream";
  // A validator, so a step shown again does not download its videos again: the browser asks, an unchanged file is a 304.
  const etag = `"${size.toString(36)}-${Math.floor(mtime).toString(36)}"`;
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache", ETag: etag, "Last-Modified": new Date(mtime).toUTCString(), "X-Content-Type-Options": "nosniff", "Content-Security-Policy": opts.app ? APP_CSP : DATA_CSP };
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, base).end(); return; }
  const m = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    const end = m[1] !== "" && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }).end(); return; }
    res.writeHead(206, { ...base, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...base, "Content-Length": size });
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(file).pipe(res);
}
