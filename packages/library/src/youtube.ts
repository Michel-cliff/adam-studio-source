import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { publicUrl } from "./access";
import { withReferenceProxy } from "./reference-proxy";

const run = promisify(execFile);
export function isYoutube(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password && !u.port &&
    ["youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname); } catch { return false; }
}

/** A creator-supplied YouTube page, downloaded through the same public-only tunnel as references. */
export async function youtubeVideo<T>(url: string, use: (file: string) => Promise<T>, range?: { startMs?: number; endMs?: number }): Promise<T> {
  if (!isYoutube(url) || !publicUrl(url)) throw new Error("An HTTPS YouTube link is required.");
  const start = range?.startMs ?? 0, end = range?.endMs;
  if (!Number.isFinite(start) || start < 0 || (end !== undefined && (!Number.isFinite(end) || end <= start)))
    throw new Error("The clip end must be after its start, in milliseconds.");
  const folder = mkdtempSync(join(tmpdir(), "adam-youtube-"));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(path|pathext|systemroot|windir|comspec|temp|tmp|home|userprofile|appdata|localappdata|programfiles(?:\(x86\))?)$/i.test(key)));
  try {
    return await withReferenceProxy(async proxy => {
      await run("yt-dlp", ["--ignore-config", "--no-plugin-dirs", "--proxy", proxy, "--downloader", "native",
        "--no-playlist", "--no-progress", "-f", "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]",
        "--merge-output-format", "mp4", "--max-filesize", "300M", "-o", join(folder, "source.%(ext)s"), "--", url],
        { timeout: 300_000, windowsHide: true, env, maxBuffer: 1 << 20 });
      const name = readdirSync(folder).find(file => /^source\.(mp4|mkv|webm|mov)$/.test(file));
      if (!name) throw new Error("YouTube did not return a usable video. The video may be private or unavailable.");
      const source = join(folder, name);
      if (statSync(source).size > 300 * 1024 * 1024) throw new Error("This file exceeds the allowed size.");
      const { stdout } = await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration", "-of", "csv=p=0", source], { windowsHide: true, timeout: 30_000 });
      const duration = Number(stdout.trim()) * 1000;
      if (!Number.isFinite(duration) || duration <= 0 || start >= duration || (end !== undefined && end > duration + 100))
        throw new Error("The requested clip lies outside the video.");
      const file = join(folder, "clip.mp4");
      await run("ffmpeg", ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-ss", String(start / 1000), "-i", source,
        ...(end === undefined ? [] : ["-t", String((end - start) / 1000)]), "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "fast",
        "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", file], { windowsHide: true, timeout: 300_000, maxBuffer: 1 << 20 });
      return await use(file);
    });
  } finally { rmSync(folder, { recursive: true, force: true, maxRetries: 3 }); }
}
