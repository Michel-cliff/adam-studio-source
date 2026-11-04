import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
const pending = new Map<string, Promise<string | null>>();
let active = 0;
const queue: (() => void)[] = [];
async function encode(src: string, out: string): Promise<void> {
  if (active >= 2) await new Promise<void>(r => queue.push(r));
  else active++;
  try {
    await new Promise<void>((resolve, reject) => execFile("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-threads", "2", "-i", src, "-frames:v", "1", "-vf", "scale=360:-2", "-threads", "2", out], { windowsHide: true, timeout: 30_000 }, e => e ? reject(e) : resolve()));
  } finally { const next = queue.shift(); if (next) next(); else active--; }
}
/** Shared, bounded background work: FFmpeg never blocks the HTTP event loop. */
export function thumbnail(dir: string): Promise<string | null> {
  const out = join(dir, "renders", ".thumb.jpg");
  if (existsSync(out)) return Promise.resolve(out);
  if (pending.has(dir)) return pending.get(dir)!;
  const task = (async () => {
    const cache = join(dir, "cache"); if (!existsSync(cache)) return null;
    for (const asset of readdirSync(cache).sort()) for (const f of ["proxy.mp4", "edit.mp4"]) {
      const src = join(cache, asset, f); if (!existsSync(src) || statSync(src).size === 0) continue;
      const tmp = join(dir, "renders", `.thumb-${randomUUID()}.jpg`);
      try { mkdirSync(dirname(out), { recursive: true }); await encode(src, tmp); if (!existsSync(out)) renameSync(tmp, out); return out; }
      catch { /* try the next completed input */ }
      finally { rmSync(tmp, { force: true }); }
    }
    return null;
  })().finally(() => pending.delete(dir));
  pending.set(dir, task); return task;
}
