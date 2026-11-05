import { describe, expect, it } from "vitest";
import { resolve } from "../src/resolve";
import { findHighlights, joinWords, normalizeWord, tidyText, wrapCaption } from "../src/text";
import { makeProject, makeStyle } from "./helpers";

const style = makeStyle();
const cut = { story: [{ id: "c1", asset: "a", inMs: 0, outMs: 2000 }, { id: "c2", asset: "a", inMs: 5000, outMs: 10000 }] };

describe("wrapCaption", () => {
  it("keeps short text on one line", () => {
    expect(wrapCaption("here in France", 22)).toBe("here in France");
  });
  it("splits long text into two balanced lines", () => {
    expect(wrapCaption("I just started my first company", 22)).toBe("I just started\nmy first company");
  });
  it("leaves text that already has a line break alone", () => {
    expect(wrapCaption("one\ntwo three four five six seven", 22)).toBe("one\ntwo three four five six seven");
  });
});

describe("findHighlights", () => {
  it("finds a phrase split by the line break", () => {
    expect(findHighlights("selling these\nskills now", ["these skills"])).toEqual({ ranges: [[8, 20]], missing: [] });
  });
  it("reports a missing phrase instead of failing", () => {
    expect(findHighlights("hello", ["bye"])).toEqual({ ranges: [], missing: ["bye"] });
  });
});

describe("normalizeWord", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeWord("Euh,")).toBe("euh");
  });
});

describe("resolve: captions", () => {
  it("splits a caption that straddles a cut into one piece per kept range (lead before the first, tail after the last)", () => {
    const tl = resolve(makeProject({ ...cut, captions: [{ words: ["a.w1", "a.w5"], text: "un deux trois quatre cinq" }] }), style);
    expect(tl.captions.map((c) => [c.id, c.fromFrame, c.durationFrames])).toEqual([["cap0.0", 52, 8], ["cap0.1", 60, 19]]);
  });

  it("orphans a caption whose words were all cut", () => {
    const tl = resolve(makeProject({ ...cut, captions: [{ words: ["a.w2", "a.w3"], text: "deux trois" }] }), style);
    expect(tl.captions).toEqual([]);
    expect(tl.orphans).toEqual(["caption:0"]);
  });

  it("wraps text with the style limit and computes highlight ranges on the wrapped text", () => {
    const tl = resolve(makeProject({
      captions: [{ words: ["a.w0", "a.w3"], text: "I just started my first company", highlight: ["first company"] }],
    }), style);
    expect(tl.captions[0]).toMatchObject({ id: "cap0", text: "I just started\nmy first company", highlightRanges: [[18, 31]], x: 0.5, y: 0.76 });
  });

  it("warns when a highlight is not in the caption", () => {
    const tl = resolve(makeProject({ captions: [{ words: ["a.w0", "a.w1"], text: "zero un", highlight: ["deux"] }] }), style);
    expect(tl.captions).toHaveLength(1);
    expect(tl.warnings).toContain('caption 0: highlight "deux" not found in "zero un"');
  });
});

describe("resolve: beats", () => {
  it("turns beats into frame ranges and orphans a beat on a cut word", () => {
    const tl = resolve(makeProject({
      ...cut,
      structure: { framework: "soar", beats: [
        { role: "situation", from: "a.w0", to: "a.w2" },
        { role: "obstacle", from: "a.w5", to: "a.w6" },
      ] },
    }), style);
    expect(tl.beats).toEqual([{ role: "obstacle", fromFrame: 60, toFrame: 99 }]);
    expect(tl.orphans).toEqual(["beat:situation"]);
  });
});

describe("words joined back as they are written", () => {
  it("glues elisions, hyphenated words and domains the transcript splits", () => {
    expect(joinWords(["je", "n", "'ai", "pas"])).toBe("je n'ai pas");
    expect(joinWords(["est", "-ce", "que", "j", "’utilise"])).toBe("est-ce que j’utilise");
    expect(joinWords(["ma", "micro", "-entreprise"])).toBe("ma micro-entreprise");
    expect(joinWords(["jobless", ".fr,", "ma"])).toBe("jobless.fr, ma");
    expect(joinWords(["24", "-", "25"])).toBe("24 - 25");
  });
  it("tidies a caption already written with those spaces", () => {
    expect(tidyText("est -ce que j 'utilise jobless .fr dans ma")).toBe("est-ce que j'utilise jobless.fr dans ma");
    expect(tidyText("bon - ok")).toBe("bon - ok");
  });
});

describe("caption timing, as the default art direction sets it", () => {
  // Words a.w0 = 1000-1500, a.w1 = 1800-2300, a.w2 = 2600-3100 ... (800 ms apart, 500 ms long), 30 fps, story 0-10 s.
  const at = (captions: { words: [string, string]; text: string }[]) => resolve(makeProject({ captions }), makeStyle()).captions;

  it("appears 60 ms before the first word and leaves 120 ms after the last", () => {
    const [c] = at([{ words: ["a.w1", "a.w2"], text: "un deux" }]);
    expect(c!.fromFrame).toBe(Math.round((1800 - 60) * 0.03));
    expect(c!.fromFrame + c!.durationFrames).toBe(Math.round((3100 + 120) * 0.03));
  });
  it("stays at least 0.8 s, never over the next caption, and at most 3.5 s", () => {
    const [a, b] = at([{ words: ["a.w0", "a.w0"], text: "zéro" }, { words: ["a.w1", "a.w1"], text: "un" }]);
    expect(a!.fromFrame + a!.durationFrames).toBeLessThanOrEqual(b!.fromFrame);
    const [one] = at([{ words: ["a.w5", "a.w5"], text: "cinq" }]);
    expect(one!.durationFrames).toBe(24);
    const [long] = at([{ words: ["a.w0", "a.w5"], text: "zéro un deux trois quatre cinq" }]);
    expect(long!.durationFrames).toBe(105);
  });
  it("drops the final period, keeps question and exclamation marks", () => {
    expect(at([{ words: ["a.w1", "a.w2"], text: "un deux." }])[0]!.text).toBe("un deux");
    expect(at([{ words: ["a.w1", "a.w2"], text: "un deux ?" }])[0]!.text).toBe("un deux ?");
  });
});
