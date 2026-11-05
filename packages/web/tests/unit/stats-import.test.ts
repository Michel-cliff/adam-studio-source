import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyImport, diskName, importPrompt } from "../../server/stats-import";
import { addRule, readStats } from "../../server/stats";

describe("importing the stats of other videos", () => {
  it("adds each video with its numbers and advice, adds the new rules and turns off the contradicted ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam import-"));
    const old = addRule(dir, { topic: "hook", text: "Start with a question", source: "YOU" });
    const r = applyImport(dir, {
      say: "Your list videos hold best.",
      videos: [
        { name: "Morning routine", metrics: { views: "12.4K", kept3s: "61%", bogus: "1" }, advice: "Cut the 4 s intro." },
        { name: "", metrics: { views: "3K" }, advice: "nameless" },
      ],
      rules: [{ topic: "hook", text: "Open on the result, not a question" }, { topic: "nonsense", text: "Keep captions two lines" }],
      off: [old.id, "unknown"],
    });
    const s = readStats(dir);
    expect(r.videos).toEqual(["Morning routine"]);
    expect(s.videos["Morning routine"]).toMatchObject({ metrics: { views: "12.4K", kept3s: "61%" }, source: "IMPORTED" });
    expect(s.videos["Morning routine"]!.chat.at(-1)).toMatchObject({ who: "ai", text: "Cut the 4 s intro." });
    expect(s.rules.find((x) => x.id === old.id)!.on).toBe(false);
    expect(s.rules.filter((x) => x.on).map((x) => x.text)).toEqual(["Open on the result, not a question", "Keep captions two lines"]);
    expect(r.off).toEqual([old.id]);
  });
  it("gives the AI the file's text and the rules with their ids", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam import-"));
    const rule = addRule(dir, { topic: "captions", text: "Two lines max", source: "YOU" });
    const p = importPrompt(readStats(dir), "Title,Views\nMy video,1200");
    expect(p).toContain("My video,1200");
    expect(p).toContain(rule.id);
    expect(p).toMatch(/"videos"/);
  });
});

describe("the name a dropped file gets on disk", () => {
  // Windows mangles accents on the command line the AI gets: "août" became "aoÃ»t" and the file was not found.
  it("keeps only plain letters, digits, dots and dashes, and the extension", () => {
    expect(diskName("Statistiques du reel pour cliff.iscurious - 16 août 2026 - 27 oct. 2026.pdf"))
      .toBe("Statistiques_du_reel_pour_cliff.iscurious_-_16_aout_2026_-_27_oct._2026.pdf");
    expect(diskName("../../été 🎬.PNG")).toBe("ete_.PNG");
    expect(diskName("")).toBe("");
  });
});

it("attaches imported statistics to the selected project without creating an external video", () => {
  const dir = mkdtempSync(join(tmpdir(), "adam-own-import-"));
  const result = applyImport(dir, { videos: [{ name: "A title from Instagram", metrics: { views: "1200" } }] }, "My project");
  expect(result.videos).toEqual(["My project"]);
  expect(Object.keys(readStats(dir).videos)).toEqual(["My project"]);
  expect(readStats(dir).videos["My project"]!.source).not.toBe("IMPORTED");
  expect(() => applyImport(dir, { videos: [{name:"one"},{name:"two"}] }, "My project")).toThrow(/one video/);
  expect(Object.keys(readStats(dir).videos)).toEqual(["My project"]);
});
