import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Timeline } from "@adam-studio/model";
import { confidenceWarnings, wordConfidence } from "../../src/lib/confidence";

const project = () => {
  const dir = mkdtempSync(join(tmpdir(), "adam conf-"));
  mkdirSync(join(dir, "cache", "c01"), { recursive: true });
  const ws = [["bonjour", 0.95], ["bac", 0.48], ["plus", 0.79], ["le", 0.34], ["des", 0.38], ["un", 0.5], ["fin", 0.99]]
    .map(([text, p], i) => ({ text, startMs: 1000 + i * 500, endMs: 1400 + i * 500, p }));
  writeFileSync(join(dir, "cache", "c01", "transcript.json"), JSON.stringify({ lang: "fr", langProbability: 0.62, words: ws }));
  return dir;
};
const tl = { fps: 30, clips: [{ id: "c1", asset: "c01", fromFrame: 0, durationFrames: 300, sourceInMs: 0, sourceOutMs: 10000 }] } as unknown as Timeline;

describe("transcript confidence", () => {
  it("reads each word's confidence by its id", () => {
    const c = wordConfidence(project(), ["c01"]);
    expect(c.words["c01.w1"]).toBe(0.48);
    expect(c.lang.c01).toBe(0.62);
  });
  it("warns when more than 3 kept words are below 0.60, naming where, and when the language is unsure", () => {
    const w = confidenceWarnings(tl, wordConfidence(project(), ["c01"])).join("\n");
    expect(w).toMatch(/4 words heard with little confidence.*0:01\.5/);
    expect(w).toMatch(/language of c01 is unsure \(62 %\)/);
  });
});
