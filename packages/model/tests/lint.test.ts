import { describe, expect, it } from "vitest";
import { lint, type LintOptions } from "../src/lint";
import { resolve } from "../src/resolve";
import type { ProjectInput } from "../src/schema/project";
import { makeProject, makeStyle, words } from "./helpers";

const style = makeStyle();
/** 15.1 s, speech at 100 ms, 300 ms gaps, a caption at the start: lint-clean. */
const clean: Partial<ProjectInput> = {
  story: [{ id: "c1", asset: "a", inMs: 900, outMs: 16000 }],
  captions: [{ words: ["a.w0", "a.w1"], text: "zero un" }],
};
function run(over: Partial<ProjectInput> = {}, opts: LintOptions = {}) {
  const p = makeProject({ ...clean, ...over });
  return lint(p, resolve(p, style), opts);
}
const rules = (ws: ReturnType<typeof run>) => ws.map((w) => w.rule);

describe("lint", () => {
  it("passes a clean project", () => {
    expect(run()).toEqual([]);
  });

  it("flags speech that starts after 500 ms", () => {
    const ws = run({ story: [{ id: "c1", asset: "a", inMs: 0, outMs: 16000 }] });
    expect(ws).toContainEqual({ rule: "hook.first3s", severity: "warning", message: "Speech starts at 1000 ms (more than 500 ms)", ids: ["a.w0"] });
  });

  it("flags a missing text hook in the first 3 seconds", () => {
    expect(rules(run({ captions: [] }))).toContain("hook.first3s");
  });

  it("flags pauses longer than the style limit", () => {
    const ws = run({ styleOverrides: { lint: { "9:16": { maxPauseMs: 200 } } } });
    expect(ws.filter((w) => w.rule === "pace.pauses")).toHaveLength(9);
  });

  it("flags single and two-word fillers that were kept", () => {
    const ws = run({ transcript: { lang: "fr", words: { a: words("a", ["euh", "un", "du", "coup", "quatre", "cinq", "six", "sept", "huit", "neuf"]) } } });
    const fillers = ws.filter((w) => w.rule === "pace.fillers");
    expect(fillers.map((w) => w.ids)).toEqual([["a.w0"], ["a.w2", "a.w3"]]);
  });

  it("flags a duration outside the format range", () => {
    expect(rules(run({ story: [{ id: "c1", asset: "a", inMs: 900, outMs: 5000 }] }))).toContain("duration.range");
  });

  it("checks beats against the framework", () => {
    const missing = run({ structure: { framework: "soar", beats: [{ role: "situation", from: "a.w0", to: "a.w2" }] } });
    expect(missing).toContainEqual(expect.objectContaining({ rule: "structure.beats", message: "Missing beats for soar: obstacle, action, results" }));
    const unknown = run({ structure: { framework: "xyz", beats: [] } });
    expect(unknown).toContainEqual(expect.objectContaining({ rule: "structure.beats", severity: "error" }));
    const disordered = run({ structure: { framework: "bab", beats: [
      { role: "after", from: "a.w0", to: "a.w2" }, { role: "before", from: "a.w3", to: "a.w5" }, { role: "bridge", from: "a.w6", to: "a.w9" },
    ] } });
    expect(disordered).toContainEqual(expect.objectContaining({ rule: "structure.beats", message: "Beats are not in the order of bab" }));
  });

  it("flags a hook beat longer than its limit", () => {
    const ws = run({ structure: { framework: "hrst", beats: [
      { role: "hook", from: "a.w0", to: "a.w5" }, { role: "relatable", from: "a.w6", to: "a.w6" },
      { role: "show", from: "a.w7", to: "a.w7" }, { role: "takeaway", from: "a.w8", to: "a.w9" },
    ] } });
    expect(ws).toContainEqual(expect.objectContaining({ rule: "structure.beats", message: "Beat hook lasts 4500 ms (limit 3000 ms)" }));
  });

  it("reports orphans", () => {
    const ws = run({ story: [{ id: "c1", asset: "a", inMs: 900, outMs: 2000 }, { id: "c2", asset: "a", inMs: 5000, outMs: 19000 }],
      elements: [{ id: "e1", kind: "text.behindSubject", anchor: { word: "a.w3" }, durationMs: 500, props: { text: "X" } }] });
    expect(ws).toContainEqual(expect.objectContaining({ rule: "elements.orphans", ids: ["e1"] }));
  });

  it("checks files with Windows paths and names the analysis step", () => {
    const exists = new Set(["C:\\media\\a.mp4", "D:/p/cache/a/edit.mp4"]);
    const ws = run(
      { assets: [{ id: "a", kind: "video", path: "C:\\media\\a.mp4", meta: { durationMs: 30000 } }],
        story: [{ id: "c1", asset: "a", inMs: 900, outMs: 16000, transitionOut: { kind: "subjectSlide", durationMs: 540 } }] },
      { projectDir: "D:/p", fileExists: (f) => exists.has(f) },
    );
    const missing = ws.filter((w) => w.rule === "assets.missing").map((w) => w.message);
    expect(missing).toEqual([
      'Missing subject.webm for asset "a": run the matting analysis step',
      'Missing plate.png for asset "a": run the clean plate analysis step',
    ]);
  });

  it("blocks export while proposals are pending", () => {
    const ws = run({ proposals: [{ id: "p1", step: "cuts", variants: [] }] });
    expect(ws).toContainEqual({ rule: "proposals.pending", severity: "error", message: "1 proposal(s) still pending", ids: ["p1"] });
  });
});

describe("the art direction's checks", () => {
  const withDa = (da: object, over: Partial<ProjectInput> = {}) => {
    const p = makeProject({ ...clean, ...over });
    const s = makeStyle({ lint: { "9:16": { minDurationMs: 15000, maxDurationMs: 60000, da }, "16:9": { minDurationMs: 30000, maxDurationMs: 1200000 } } });
    return lint(p, resolve(p, s));
  };
  const da = (ws: ReturnType<typeof run>) => ws.filter((w) => w.rule.startsWith("da."));
  const title = (id: string, atMs: number, textColor = "text") =>
    ({ id, kind: "title", anchor: { atMs }, durationMs: 1500, props: { textColor, phases: [{ startMs: 0, endMs: 1500, lines: [{ text: "X" }] }] } });
  const zoom = (id: string, atMs: number) => ({ id, kind: "camera.zoom", anchor: { atMs }, durationMs: 2000, props: { scale: 1.05 } });
  const win = (id: string, atMs: number) => ({ id, kind: "camera.window", anchor: { atMs }, durationMs: 2000, props: {} });

  it("checks nothing the art direction does not set", () => {
    expect(da(run())).toEqual([]);
    expect(da(withDa({}))).toEqual([]);
  });

  it("finds the longest stretch without a change of scale or dress", () => {
    expect(da(withDa({ maxShotMs: 5000 }))).toEqual([expect.objectContaining({ rule: "da.shot", message: "15.1 s without a change of scale or dress (0.0 s to 15.1 s, limit 5 s)" })]);
    const dressed = { elements: [zoom("z", 5000), title("t", 10000)] };
    expect(da(withDa({ maxShotMs: 5200 }, dressed))).toEqual([]);
    // A title dresses the frame but does not change its scale.
    expect(da(withDa({ maxScaleGapMs: 7000 }, dressed))).toEqual([expect.objectContaining({ rule: "da.scale", message: "8.1 s without a change of scale (7.0 s to 15.1 s, limit 7 s)" })]);
  });

  it("counts the 4:3 windows against the range", () => {
    expect(da(withDa({ windows: { min: 2 } })).map((w) => w.message)).toEqual(["0 4:3 window(s), the art direction asks for at least 2"]);
    expect(da(withDa({ windows: { min: 0, max: 1 } }, { elements: [win("w1", 3000), win("w2", 9000)] })))
      .toEqual([expect.objectContaining({ rule: "da.windows", ids: ["w1", "w2"] })]);
  });

  it("keeps a colour rare, by hex or by the style colour that resolves to it", () => {
    const ws = da(withDa({ rareColors: [{ color: "#FF6B35", max: 1 }] }, { elements: [title("t1", 3000, "#ff6b35"), title("t2", 8000, "accent"), title("t3", 12000)] }));
    expect(ws).toEqual([expect.objectContaining({ rule: "da.rareColor", message: "#FF6B35 is used 2 times (at most 1)", ids: ["t1", "t2"] })]);
  });

  it("flags long captions, animated transitions, early music and shake", () => {
    expect(da(withDa({ maxCaptionWords: 1 })).map((w) => w.rule)).toEqual(["da.captionWords"]);
    const whip = { story: [{ id: "c1", asset: "a", inMs: 900, outMs: 8000, transitionOut: { kind: "whip" as const, durationMs: 300 } }, { id: "c2", asset: "a", inMs: 8000, outMs: 16000 }] };
    expect(da(withDa({ cutsOnly: true }, whip))).toEqual([expect.objectContaining({ rule: "da.cutsOnly", ids: ["c1"] })]);
    const music = {
      assets: [{ id: "a", kind: "video" as const, path: "a.mp4", meta: { durationMs: 30000, hasAudio: true } }, { id: "m", kind: "audio" as const, path: "m.mp3", meta: { durationMs: 20000 } }],
      elements: [{ id: "bed", kind: "sfx", anchor: { atMs: 0 }, durationMs: 12000, props: { asset: "m", volume: 0.1 } }],
    };
    expect(da(withDa({ musicFromMs: 3000 }, music)).map((w) => w.rule)).toEqual(["da.music"]);
    const p = makeProject(clean);
    const shaky = makeStyle({ motion: { speed: 1, stable: false }, lint: { "9:16": { minDurationMs: 15000, maxDurationMs: 60000, da: { noShake: true } }, "16:9": { minDurationMs: 30000, maxDurationMs: 1200000 } } });
    expect(da(lint(p, resolve(p, shaky))).map((w) => w.rule)).toEqual(["da.noShake"]);
  });
});
