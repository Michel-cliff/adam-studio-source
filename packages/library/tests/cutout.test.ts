import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importAsset } from "../src/importer";

describe("importing an image as a paper cut-out", () => {
  it("keeps the object alone on a transparent PNG, the original is not kept", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adam-cut-"));
    const src = join(dir, "disc.jpg");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=0xEEEEEE:s=320x240", "-vf", "drawbox=x=110:y=70:w=100:h=100:color=0xC0261D:t=fill", "-frames:v", "1", src]);
    const a = await importAsset(dir, { path: src, cutout: true }, "disc");
    expect(a.path).toBe("assets/disc.png");
    expect(existsSync(join(dir, "assets", "disc.jpg"))).toBe(false);
    const fmt = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=pix_fmt,width", "-of", "csv=p=0", a.file], { encoding: "utf8" }).trim();
    expect(fmt).toMatch(/rgba/);
    expect(Number(fmt.split(",")[0])).toBeLessThan(320);
  }, 120000);
});

describe("in the installed app", () => {
  it("says plainly that cut-outs are not available, before copying anything", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adam-cut-"));
    const src = join(dir, "disc.jpg");
    process.env.ADAM_PACKAGED = "1";
    try {
      await expect(importAsset(dir, { path: src, cutout: true }, "disc")).rejects.toThrow(/not available in the installed app/);
      expect(existsSync(join(dir, "assets"))).toBe(false);
    } finally { delete process.env.ADAM_PACKAGED; }
  });
});
