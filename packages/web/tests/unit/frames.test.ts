import { describe, expect, it } from "vitest";
import type { Timeline } from "@adam-studio/model";
import { keyFrames } from "../../app/frames";

const tl = (elements: { id: string; fromFrame: number }[], captions: { fromFrame: number }[] = [], durationFrames = 900) =>
  ({ fps: 30, durationFrames, elements, captions }) as unknown as Timeline;

describe("the frames a variant card shows", () => {
  it("starts a little into what the variant adds", () => {
    const base = tl([{ id: "a", fromFrame: 0 }]);
    const v = tl([{ id: "a", fromFrame: 0 }, { id: "title", fromFrame: 300 }]);
    expect(keyFrames(v, base)).toEqual([321, 348, 384]);
  });
  it("follows new captions when the variant adds no element", () => {
    const v = tl([], [{ fromFrame: 60 }]);
    expect(keyFrames(v, tl([]))[0]).toBe(81);
  });
  it("samples the edit when nothing is added (a cut or a reorder), and stays inside it", () => {
    expect(keyFrames(tl([]), tl([]))).toEqual([225, 450, 675]);
    const short = tl([{ id: "late", fromFrame: 80 }], [], 90);
    expect(keyFrames(short, tl([]))).toEqual([89, 89, 89]);
  });
});
