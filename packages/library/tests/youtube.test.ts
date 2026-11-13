import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as { args: string[]; env: Record<string, string> }[]);
vi.mock("../src/reference-proxy", () => ({ withReferenceProxy: (run: (proxy: string) => unknown) => run("http://127.0.0.1:12345") }));
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const execFile = (cmd: string, args: string[], opts: any, callback: any) => {
    if (cmd !== "yt-dlp") return actual.execFile(cmd, args, opts, callback);
    calls.push({ args, env: opts.env });
    const file = args[args.indexOf("-o") + 1]!.replace("%(ext)s", "mp4");
    actual.execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x284:rate=10:duration=3", "-pix_fmt", "yuv420p", file]);
    callback(null, "", "");
  };
  (execFile as any)[Symbol.for("nodejs.util.promisify.custom")] = (cmd: string, args: string[], opts: any) =>
    new Promise((resolve, reject) => execFile(cmd, args, opts, (error: Error | null, stdout: string, stderr: string) => error ? reject(error) : resolve({stdout, stderr})));
  return { ...actual, execFile };
});
import { importAsset, lookAt } from "../src/importer";
import { isYoutube, youtubeVideo } from "../src/youtube";
import { checkSource } from "../src/access";
const folder = mkdtempSync(join(tmpdir(), "adam-youtube-test-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));
const url = "https://youtu.be/YUYeHMsqbmY?si=cV9KpLiCC3_fgKze";

it("imports the selected excerpt, records its real source, and previews the YouTube video", async () => {
  expect(() => checkSource({url}, [], "prends des extraits de " + url)).not.toThrow();
  expect(() => checkSource({url}, [], "")).toThrow();
  const asset = await importAsset(folder, {url, startMs: 500, endMs: 1500}, "youtube-excerpt", () => true);
  expect(asset.kind).toBe("video");
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", asset.file], {encoding:"utf8"}));
  expect(duration).toBeGreaterThanOrEqual(0.9);
  expect(duration).toBeLessThan(1.2);
  expect(readFileSync(join(folder,"assets/CREDITS.md"),"utf8")).toContain(url);
  const preview = await lookAt(url, () => true);
  expect(preview.kind).toBe("video");
  expect(preview.jpeg.length).toBeGreaterThan(1000);
  const download = calls[0]!;
  expect(download.args).toContain("--ignore-config");
  expect(download.args).toContain("--no-playlist");
  expect(download.args[download.args.indexOf("--proxy") + 1]).toMatch(/^http:\/\/127/);
  expect(download.env).not.toHaveProperty("HTTP_PROXY");
  expect(download.env).not.toHaveProperty("ADAM_CREATOR_WORDS");
}, 30000);

it("rejects invalid URLs, denied sources and reversed or out-of-range excerpts without adding an asset", async () => {
  expect(isYoutube("https://youtube.com.attacker.example/watch?v=x")).toBe(false);
  expect(isYoutube("https://youtube.com@127.0.0.1/watch")).toBe(false);
  const before = calls.length;
  await expect(importAsset(folder, {url}, "denied", () => false)).rejects.toThrow(/not allowed/);
  await expect(youtubeVideo(url, async () => {}, {startMs:2000, endMs:1000})).rejects.toThrow(/end/);
  expect(calls.length).toBe(before);
  await expect(importAsset(folder, {url, startMs:10000, endMs:12000}, "outside", () => true)).rejects.toThrow(/outside/);
  expect(existsSync(join(folder,"assets/outside.mp4"))).toBe(false);
}, 30000);
