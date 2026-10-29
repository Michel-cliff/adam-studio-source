import { describe, expect, it } from "vitest";
import { parseProject, parseStyle, resolve } from "@adam-studio/model";
import { captionChunks, findFillers, findRetakes, findStutters, firstPass, keptWords } from "../../server/firstpass";
import { projectInput, styleInput } from "../../../model/tests/helpers";

/** "Alors euh je voulais vous dire je voulais vous parler du projet. Ben voilà." with a long pause before "Ben". */
const TEXT = ["Alors", "euh", "je", "voulais", "vous", "dire", "je", "voulais", "vous", "parler", "du", "projet.", "Ben", "voilà."];
/** A 0.6 s hesitation before the restart (word 6) and 1.5 s of dead air before "Ben" (word 12). */
const shift = (i: number) => (i >= 6 ? 600 : 0) + (i >= 12 ? 1500 : 0);
const words = TEXT.map((text, i) => ({ id: `a.w${i}`, text, startMs: 500 + i * 500 + shift(i), endMs: 850 + i * 500 + shift(i) }));

function setup() {
  const p = parseProject({ ...projectInput(), transcript: { lang: "fr", words: { a: words } }, story: [{ id: "c1", asset: "a", inMs: 0, outMs: 10000 }] });
  const s = parseStyle(styleInput);
  if (!p.ok || !s.ok) throw new Error(JSON.stringify(!p.ok && p.errors));
  return { project: p.value, style: s.value };
}

describe("first pass pieces", () => {
  it("finds fillers of the language, one and two words long", () => {
    expect(findFillers(words, ["euh", "ben", "du coup"])).toEqual(["a.w1", "a.w12"]);
    expect(findFillers([{ id: "x.w0", text: "Du", startMs: 0, endMs: 1 }, { id: "x.w1", text: "coup,", startMs: 2, endMs: 3 }], ["du coup"])).toEqual(["x.w0", "x.w1"]);
  });

  it("finds a restarted sentence and keeps the last attempt", () => {
    expect(findRetakes(words)).toEqual([{ from: "a.w2", to: "a.w5", ids: ["a.w2", "a.w3", "a.w4", "a.w5"] }]);
    expect(findRetakes(words.slice(6))).toEqual([]);
  });

  it("chunks captions at punctuation, pauses and line length", () => {
    const chunks = captionChunks(words.slice(6), 22, true);
    expect(chunks.map((c) => c.text)).toEqual(["je voulais vous parler", "du projet.", "Ben voilà."]);
    expect(chunks[0]!.highlight).toEqual(["voulais"]);
    expect(chunks[0]!.words).toEqual(["a.w6", "a.w9"]);
  });
});

describe("retakes on real speech", () => {
  const take = (asset: string, text: string) => text.split(" ").map((x, i) => ({ id: `${asset}.w${i}`, text: x, startMs: 300 + i * 300, endMs: 550 + i * 300 }));
  it("finds a restart across two takes, measured in edit time", () => {
    const a = take("c02", "et depuis je galère. Et parce que je voulais...");
    const b = take("c03", "parce que je voulais un outil pour m'aider");
    const at = new Map([...a.map((w, i) => [w.id, i * 300] as const), ...b.map((w, i) => [w.id, (a.length + i) * 300] as const)]);
    expect(findRetakes([...a, ...b], (w) => at.get(w.id)!)).toEqual([{ from: "c02.w5", to: "c02.w8", ids: ["c02.w5", "c02.w6", "c02.w7", "c02.w8"] }]);
  });
  it("ignores short common phrases, far repeats and huge spans", () => {
    const w = take("c01", "je me suis dit que oui et je me suis dit que non");
    expect(findRetakes(w, (x) => x.startMs)).toEqual([]);
    const far = take("c01", "je voulais vous dire bonjour " + "bla ".repeat(60) + "je voulais vous dire merci");
    expect(findRetakes(far, (x) => x.startMs)).toEqual([]);
  });
});

describe("captions across takes", () => {
  it("never spans two takes or goes back in time", () => {
    const two = [{ id: "a.w0", text: "un", startMs: 0, endMs: 200 }, { id: "a.w1", text: "deux", startMs: 250, endMs: 400 },
      { id: "b.w0", text: "trois", startMs: 300, endMs: 500 }, { id: "b.w1", text: "quatre", startMs: 550, endMs: 700 }];
    for (const c of captionChunks(two, 40, false)) expect(c.words[0].split(".w")[0]).toBe(c.words[1].split(".w")[0]);
  });
});

describe("firstPass", () => {
  it("labels its proposals in the creator's language", () => {
    const { project, style } = setup();
    const fr = firstPass(project, style, "fr").project.proposals;
    expect(fr.find((p) => p.id === "auto.cuts")!.variants[0]!.label).toMatch(/^serré : 2 hésitations/);
    expect(fr.find((p) => p.id === "auto.captions")!.variants[0]!.label).toMatch(/sous-titres, deux lignes/);
    expect(firstPass(project, style).project.proposals.find((p) => p.id === "auto.cuts")!.variants[0]!.label).toMatch(/^tight: 2 fillers/);
  });
  it("proposes cuts and captions that resolve, and re-runs without duplicates", () => {
    const { project, style } = setup();
    const { project: out, summary } = firstPass(project, style);
    expect(summary).toMatchObject({ fillers: 2, captions: expect.any(Number), proposals: ["auto.cuts", "auto.captions"] });
    expect(out.workflow?.current).toBe("cuts");
    const cuts = out.proposals.find((p) => p.id === "auto.cuts")!;
    expect(cuts.variants.map((v) => v.key)).toEqual(["A", "B"]);
    for (const v of cuts.variants) {
      const t = resolve(out, style, { apply: { proposal: "auto.cuts", variant: v.key } });
      expect(t.durationFrames).toBeLessThan(resolve(out, style).durationFrames);
    }
    const tight = keptWords({ ...out, story: cuts.variants[0]!.patch.setStory! }).map((w) => w.text);
    expect(tight).toEqual(["Alors", "je", "voulais", "vous", "parler", "du", "projet.", "voilà."]);
    expect(resolve(out, style, { apply: { proposal: "auto.captions", variant: "A" } }).captions.length).toBeGreaterThan(0);
    const again = firstPass(out, style).project;
    expect(again.proposals.filter((p) => p.id.startsWith("auto.")).length).toBe(2);
  });

  it("leaves decided proposals alone", () => {
    const { project, style } = setup();
    const out = firstPass(project, style).project;
    const decided = { ...out, proposals: out.proposals.map((p) => (p.id === "auto.cuts" ? { ...p, status: { accepted: "A" as const } } : p)) };
    const r = firstPass(decided, style);
    expect(r.summary.skipped.join()).toMatch(/auto.cuts/);
    expect(r.project.proposals.find((p) => p.id === "auto.cuts")!.status).toEqual({ accepted: "A" });
  });
});

describe("pauses and stutters, as the default art direction asks", () => {
  // Gaps between words: 0.5 s (breath, kept), 1.0 s (cut to 0.25 s), 3.5 s (cut to 0.25 s and flagged).
  const at = [[0, 400], [900, 1300], [2300, 2700], [6200, 6600], [6700, 6900], [7000, 7400]];
  const text = ["un", "deux", "trois", "quatre", "je", "je"];
  const ws = text.map((t, i) => ({ id: `a.w${i}`, text: t, startMs: at[i]![0]!, endMs: at[i]![1]! }));
  const proj = () => {
    const p = parseProject({ ...projectInput(), transcript: { lang: "fr", words: { a: ws } }, story: [{ id: "c1", asset: "a", inMs: 0, outMs: 7600 }] });
    const s = parseStyle(styleInput);
    if (!p.ok || !s.ok) throw new Error("bad fixture");
    return { project: p.value, style: s.value };
  };
  /** Where a source moment lands in the edit made of these clips. */
  const out = (story: { inMs: number; outMs: number }[], ms: number) => {
    let t = 0;
    for (const c of story) { if (ms >= c.inMs && ms <= c.outMs) return t + ms - c.inMs; t += c.outMs - c.inMs; }
    return NaN;
  };

  it("keeps breaths, brings long pauses down to 0.25 s, never to zero, and flags the very long ones", () => {
    const { project, style } = proj();
    const { project: o, summary } = firstPass(project, style);
    const story = o.proposals.find((p) => p.id === "auto.cuts")!.variants[0]!.patch.setStory!;
    const gap = (i: number) => out(story, ws[i + 1]!.startMs) - out(story, ws[i]!.endMs);
    expect(gap(0)).toBe(500);
    expect(gap(1)).toBe(250);
    expect(gap(2)).toBe(250);
    expect(summary.longPauses).toEqual([{ afterWord: "a.w2", ms: 3500 }]);
  });

  it("cuts a stutter (the same word again within 0.4 s) and keeps the last one", () => {
    expect(findStutters(ws)).toEqual(["a.w4"]);
    expect(findStutters([{ id: "b.w0", text: "très", startMs: 0, endMs: 300 }, { id: "b.w1", text: "très", startMs: 900, endMs: 1200 }])).toEqual([]);
  });
});
