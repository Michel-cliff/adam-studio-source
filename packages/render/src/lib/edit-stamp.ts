// What a video was made from. A date cannot say it: a change made while the video renders is older than the finished
// file, and yet it is not in it.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** The edit as it stands: the same files give the same stamp. */
export function editStamp(dir: string): string {
  const hash = createHash("sha256");
  for (const name of ["project.json", "style.json"]) {
    const file = join(dir, name);
    if (existsSync(file)) hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 24);
}

const stampFile = (video: string) => join(dirname(video), `.${basename(video).replace(/\.mp4$/i, "")}.source`);

export function writeVideoStamp(video: string, stamp: string): void { writeFileSync(stampFile(video), stamp); }

/** The stamp a video was made from; null for a video made before stamps existed. */
export function videoStamp(video: string): string | null {
  try { return readFileSync(stampFile(video), "utf8").trim() || null; } catch { return null; }
}
