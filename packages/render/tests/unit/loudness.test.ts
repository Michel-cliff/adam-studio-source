import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { finishSound } from "../../src/commands/render";
import { audioGate, blackShare, measureLoudness, noiseFloor, normalizeLoudness, parseLoudnorm, peakTrim, silenceShare } from "../../src/lib/loudness";

describe("the loudness of a finished video", () => {
  it("reads ffmpeg's loudnorm report out of its log", () => {
    const log = 'frame=1\n[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-29.71",\n\t"input_tp" : "-27.04",\n\t"input_lra" : "0.00",\n\t"input_thresh" : "-39.71",\n\t"target_offset" : "0.10"\n}\n';
    expect(parseLoudnorm(log)).toEqual({ i: -29.71, tp: -27.04, lra: 0, thresh: -39.71, offset: 0.1 });
  });

  it("refuses an export outside -15 to -13 LUFS or with true peaks above -1 dBTP", () => {
    expect(audioGate({ i: -14.1, tp: -1.4, lra: 5, thresh: -24, offset: 0 })).toEqual([]);
    expect(audioGate({ i: -19, tp: -1.4, lra: 5, thresh: -29, offset: 0 }).join()).toMatch(/-19.0 LUFS/);
    expect(audioGate({ i: -14, tp: -0.2, lra: 5, thresh: -24, offset: 0 }).join()).toMatch(/true peak/);
  });

  it("brings a quiet video to -14 LUFS with true peaks under -1 dBTP, video stream untouched", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam loud-"));
    const file = join(dir, "v.mp4");
    // Ten seconds of a tone far too quiet (about -30 LUFS), over a black picture.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x568:r=30:d=10", "-f", "lavfi", "-i", "sine=frequency=330:duration=10",
      "-filter_complex", "[1]volume=-30dB[a]", "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-c:a", "aac", "-shortest", file]);
    expect(measureLoudness(file).i).toBeLessThan(-25);
    normalizeLoudness(file);
    const after = measureLoudness(file);
    expect(after.i).toBeGreaterThan(-15);
    expect(after.i).toBeLessThan(-13);
    expect(after.tp).toBeLessThanOrEqual(-1);
    expect(audioGate(after)).toEqual([]);
  }, 60_000);
});

describe("sound already mixed in", () => {
  it("never refuses an export: a loud floor is a note, the video is finished and kept", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam mixed-"));
    const file = join(dir, "m.mp4");
    // Ten seconds of steady noise at about -21 dBFS: far above the -35 dBFS floor that used to refuse the take.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=160x284:r=30:d=10", "-f", "lavfi", "-i", "anoisesrc=d=10:c=pink:a=0.2",
      "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-c:a", "aac", "-shortest", file]);
    expect(noiseFloor(file)).toBeGreaterThan(-35);
    expect(() => finishSound(file)).not.toThrow();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(file.replace(/\.mp4$/i, ".refused.mp4"))).toBe(false);
  }, 90_000);
});

describe("what else blocks an export", () => {
  const make = (filter: string) => {
    const dir = mkdtempSync(join(tmpdir(), "adam floor-"));
    const file = join(dir, "a.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=160x284:r=30:d=6", "-f", "lavfi", "-i", filter, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-c:a", "aac", "-shortest", file]);
    return file;
  };
  it("measures the share of dead silence", () => {
    // 6 s: a tone for 3 s, then nothing.
    const file = make("sine=frequency=300:duration=6,volume='if(lt(t,3),0.5,0)':eval=frame");
    expect(silenceShare(file)).toBeGreaterThan(0.4);
    expect(silenceShare(make("sine=frequency=300:duration=6"))).toBe(0);
  }, 60_000);
  it("measures the noise floor: a hiss under the voice that no setting will save", () => {
    expect(noiseFloor(make("anoisesrc=d=6:c=white:a=0.2"))).toBeGreaterThan(-35);
    expect(noiseFloor(make("anoisesrc=d=6:c=white:a=0.001"))).toBeLessThan(-35);
  }, 60_000);
});

describe("real takes", () => {
  const make = (filter: string, seconds = 8) => {
    const dir = mkdtempSync(join(tmpdir(), "adam real-"));
    const file = join(dir, "r.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=black:s=160x284:r=30:d=${seconds}`, "-f", "lavfi", "-i", filter, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-c:a", "aac", "-shortest", file]);
    return file;
  };
  it("trims what the AAC encode adds over -1 dBTP, by just enough", () => {
    expect(peakTrim({ i: -14.5, tp: -0.6, lra: 4, thresh: -24, offset: 0 })).toBeCloseTo(-0.9, 5);
    expect(peakTrim({ i: -14.5, tp: -1.4, lra: 4, thresh: -24, offset: 0 })).toBe(0);
  });
  it("keeps true peaks under -1 dBTP when a plain gain would push sharp peaks over", () => {
    // A quiet voice-like tone with sharp clicks: the gain to -14 LUFS sends the clicks above 0 dBTP.
    const file = make("aevalsrc=exprs='0.02*sin(2*PI*220*t)+0.9*lt(mod(t,1),0.002)':s=48000:d=8");
    normalizeLoudness(file);
    const m = measureLoudness(file);
    expect(m.tp).toBeLessThanOrEqual(-1);
    expect(audioGate(m)).toEqual([]);
  }, 90_000);
  it("measures the room under the voice, not the instants of digital silence", () => {
    // A low hiss for 4 s, then 4 s of exact zero: the floor is the hiss, about -46 dBFS, not -120.
    const floor = noiseFloor(make("anoisesrc=d=8:c=white:a=0.01,volume='if(lt(t,4),1,0)':eval=frame"));
    expect(floor).toBeGreaterThan(-60);
    expect(floor).toBeLessThan(-35);
  }, 60_000);
});

describe("black picture", () => {
  it("checks real black gaps even without an audio track, while accepting a planned opening", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam silent gate-"));
    const file = join(dir, "silent.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=160x284:r=30:d=1", "-an", "-c:v", "libx264", file]);
    expect(() => finishSound(file, { expectedBlack: [{ start: 0, end: 0.4 }] })).toThrow(/black picture/);
    expect(existsSync(file)).toBe(false);
    const refused = file.replace(".mp4", ".refused.mp4");
    expect(existsSync(refused)).toBe(true);
    expect(() => finishSound(refused, { expectedBlack: [{ start: 0, end: 1 }] })).not.toThrow();
  }, 60000);

  it("accepts the planned black CRT opening without disabling the export gate", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam crt gate-"));
    const file = join(dir, "crt.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y",
      "-f", "lavfi", "-i", "color=c=black:s=160x284:r=30:d=0.233333",
      "-f", "lavfi", "-i", "color=c=gray:s=160x284:r=30:d=1",
      "-f", "lavfi", "-i", "sine=frequency=1000:duration=1.24:sample_rate=48000",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-map", "2:a",
      "-c:v", "libx264", "-c:a", "aac", "-shortest", file]);
    expect(blackShare(file)).toBeGreaterThan(0.2);
    expect(() => finishSound(file, { expectedBlack: [{ start: 0, end: 0.4 }] })).not.toThrow();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(file.replace(".mp4", ".refused.mp4"))).toBe(false);
  }, 60000);

  it("measures the seconds of black in a video", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam black-"));
    const file = join(dir, "b.mp4");
    // 1 s of grey, 0.5 s of black, 1 s of grey.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=160x284:r=30:d=1", "-f", "lavfi", "-i", "color=c=black:s=160x284:r=30:d=0.5",
      "-f", "lavfi", "-i", "color=c=gray:s=160x284:r=30:d=1", "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", "-c:v", "libx264", file]);
    expect(blackShare(file)).toBeCloseTo(0.5, 1);
    expect(blackShare(file, [{ start: 0, end: 0.4 }])).toBeCloseTo(0.5, 1);
    expect(blackShare(file, [{ start: 1, end: 1.25 }, { start: 1.1, end: 1.3 }])).toBeCloseTo(0.2, 1);
  }, 60_000);
});
