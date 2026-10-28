import { describe, expect, it } from "vitest";
import { askStep, GROUPS, groupOf, groupState, openGroup } from "../../app/steps";

type St = "open" | "done" | "locked";
const wf = (current: string, done: string[]) => {
  const order = ["cuts", "structure", "captions", "hook", "beats", "visuals", "sound", "look"];
  const steps = Object.fromEntries(order.map((s) => [s, (done.includes(s) ? "done" : s === current ? "open" : "locked") as St]));
  return { current, steps };
};

describe("the six steps shown over the eight of the workflow", () => {
  it("covers every workflow step once, Wrap last", () => {
    const members = GROUPS.flatMap((g) => g.members);
    expect([...members].sort()).toEqual(["beats", "captions", "cuts", "hook", "look", "sound", "structure", "visuals"]);
    expect(GROUPS.map((g) => g.id)).toEqual(["story", "captions", "hook", "visuals", "sound", "wrap"]);
  });
  it("puts the cuts in Story and the beats and the look in Visuals", () => {
    expect(groupOf("cuts")).toBe("story");
    expect(groupOf("beats")).toBe("visuals");
    expect(groupOf("look")).toBe("visuals");
  });
  it("is open while one of its steps is current, done when all are", () => {
    expect(groupState("story", wf("structure", ["cuts"]))).toBe("open");
    expect(groupState("story", wf("captions", ["cuts", "structure"]))).toBe("done");
    expect(groupState("visuals", wf("captions", ["cuts", "structure"]))).toBe("locked");
    expect(groupState("story", null)).toBe("open");
  });
  it("asks Claude about the current step of the group, or its first unfinished one", () => {
    expect(askStep("story", wf("structure", ["cuts"]))).toBe("structure");
    expect(askStep("visuals", wf("captions", ["cuts", "structure"]))).toBe("beats");
    expect(askStep("visuals", wf("look", ["cuts", "structure", "captions", "hook", "beats", "visuals", "sound"]))).toBe("look");
    expect(askStep("story", wf("sound", ["cuts", "structure", "captions", "hook", "beats", "visuals"]))).toBe("structure");
  });
  it("opens on the group of the current step, on Story before any first pass, on Wrap once all is done", () => {
    expect(openGroup(wf("beats", ["cuts", "structure", "captions", "hook"]))).toBe("visuals");
    expect(openGroup(null)).toBe("story");
    const all = wf("look", ["cuts", "structure", "captions", "hook", "beats", "visuals", "sound", "look"]);
    expect(openGroup(all)).toBe("wrap");
  });
});
