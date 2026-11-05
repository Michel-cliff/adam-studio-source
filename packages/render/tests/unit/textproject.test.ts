import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { textCommand } from "../../src/commands/text";

const seconds = (file: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }));

describe("a text-only project", () => {
  it("is made from a script: cards on a silent ink background as long as they are", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "adam-text-")), "Cards");
    const script = join(dir, "..", "script.txt");
    writeFileSync(script, "Most people quit too early\nTalent vs habit\nConsistency.");
    textCommand(dir, { script });
    const p = JSON.parse(readFileSync(join(dir, "project.json"), "utf8"));
    expect(p.format).toBe("text");
    expect(p.elements.map((e: { props: { archetype: string } }) => e.props.archetype)).toEqual(["statement", "opposition", "breath"]);
    const total = p.story[0].outMs;
    expect(total).toBe(2350 + 1600 + 1600);
    const bg = join(dir, "cache", "bg", "edit.mp4");
    expect(existsSync(bg)).toBe(true);
    expect(Math.abs(seconds(bg) - total / 1000)).toBeLessThan(0.1);
    expect(JSON.parse(readFileSync(join(dir, "script.json"), "utf8")).text).toContain("Talent vs habit");
  }, 60000);

  it("rebuilds from its own script, keeping the music and the other elements", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "adam-text-")), "Cards");
    const script = join(dir, "..", "script.txt");
    writeFileSync(script, "One\nTwo three");
    textCommand(dir, { script });
    const file = join(dir, "project.json");
    const p = JSON.parse(readFileSync(file, "utf8"));
    p.assets.push({ id: "m", kind: "audio", path: "music.mp3" });
    p.elements.push({ id: "bed", kind: "sfx", anchor: { atMs: 0 }, untilEnd: true, props: { asset: "m" } });
    writeFileSync(file, JSON.stringify(p));
    writeFileSync(join(dir, "script.json"), JSON.stringify({ text: "One\nTwo three\nFour five six", by: "you" }));
    textCommand(dir, {});
    const q = JSON.parse(readFileSync(file, "utf8"));
    expect(q.elements.filter((e: { kind: string }) => e.kind === "card")).toHaveLength(3);
    expect(q.elements.some((e: { id: string }) => e.id === "bed")).toBe(true);
    expect(q.assets.map((a: { id: string }) => a.id)).toEqual(["bg", "m"]);
  }, 60000);
});
