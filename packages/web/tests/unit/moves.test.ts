import { describe, expect, it } from "vitest";
import { parseProject, parseStyle, type Project, type Style } from "@adam-studio/model";
import { projectInput, styleInput } from "../../../render/tests/unit/helpers";
import { moveCaption, moveElement, moveStory } from "../../server/moves";

// Words of the synthetic take, in the edit: s.w0 at 200 ms, s.w1 at 1000, s.w2 at 2200, s.w3 at 3000.
const project = (over = {}): Project => { const p = parseProject(projectInput(over)); if (!p.ok) throw new Error(JSON.stringify(p.errors)); return p.value; };
const style: Style = (() => { const s = parseStyle(styleInput); if (!s.ok) throw new Error("style"); return s.value; })();

describe("dragging on the timeline", () => {
  it("moves an element onto the word said at the drop, keeping its offset into it", () => {
    const p = moveElement(project(), style, "beep", 2300);
    expect(p.elements.find((e) => e.id === "beep")!.anchor).toEqual({ word: "s.w2", offsetMs: 100 });
  });
  it("keeps an element pinned to a time on a time, and one dropped before any word on the first word", () => {
    expect(moveElement(project(), style, "behind", 1500).elements.find((e) => e.id === "behind")!.anchor).toEqual({ atMs: 1500 });
    expect(moveElement(project(), style, "beep", 50).elements.find((e) => e.id === "beep")!.anchor).toEqual({ word: "s.w0", offsetMs: -150 });
  });
  it("moves an element that lasts until a word as a whole: it keeps its length", () => {
    const p = project({ elements: [{ id: "t", kind: "image", anchor: { word: "s.w0" }, untilWord: "s.w1", props: { asset: "m" } }] });
    const t = moveElement(p, style, "t", 2200).elements[0]!;
    expect(t.anchor).toEqual({ word: "s.w2", offsetMs: 0 });
    expect(t.untilWord).toBeUndefined();
    expect(t.durationMs).toBe(1200);
  });
  it("moves a caption onto the words said at the drop, as many words as before", () => {
    const p = moveCaption(project(), style, 0, 2250);
    expect(p.captions[0]).toMatchObject({ words: ["s.w2", "s.w3"], text: "red blue" });
  });
  it("keeps all of a caption's words when its first word is cut from the edit", () => {
    // s.w0 is cut (the first clip starts at 700 ms): the caption still spans two words of the take.
    const p = project({ story: [{ id: "c1", asset: "s", inMs: 700, outMs: 2000 }, { id: "c2", asset: "s", inMs: 2000, outMs: 4000 }] });
    expect(moveCaption(p, style, 0, 1600).captions[0]!.words).toEqual(["s.w2", "s.w3"]);
  });
  it("snaps a caption onto the word nearest to where it is dropped", () => {
    expect(moveCaption(project(), style, 0, 2900).captions[0]!.words).toEqual(["s.w3", "s.w3"]);
    expect(moveCaption(project(), style, 0, 2500).captions[0]!.words).toEqual(["s.w2", "s.w3"]);
  });
  it("reorders the story: the clip goes where it is dropped", () => {
    expect(moveStory(project(), "c2", 0).story.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(moveStory(project(), "c1", 5).story.map((c) => c.id)).toEqual(["c2", "c1"]);
  });
  it("says what it cannot move", () => {
    expect(() => moveElement(project(), style, "nope", 0)).toThrow(/no element "nope"/);
    expect(() => moveCaption(project(), style, 9, 0)).toThrow(/no caption 9/);
    expect(() => moveStory(project(), "c9", 0)).toThrow(/no clip "c9"/);
  });
});
