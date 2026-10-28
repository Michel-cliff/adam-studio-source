import { describe, expect, it } from "vitest";
import type { Timeline } from "@adam-studio/model";
import { keyFrame } from "../../app/frames";

const tl = (elements: { id: string; fromFrame: number }[], captions: { fromFrame: number }[] = [], durationFrames = 900) =>
  ({ fps: 30, durationFrames, elements, captions }) as unknown as Timeline;

describe("the frame a variant card shows", () => {
  it("is a little into what the variant adds", () => {
    const base = tl([{ id: "a", fromFrame: 0 }]);
    const v = tl([{ id: "a", fromFrame: 0 }, { id: "title", fromFrame: 300 }]);
    expect(keyFrame(v, base)).toBe(321);
  });
  it("follows new captions when the variant adds no element", () => {
    expect(keyFrame(tl([], [{ fromFrame: 60 }]), tl([]))).toBe(81);
  });
  it("is the middle of the edit when nothing is added (a cut or a reorder), and stays inside it", () => {
    expect(keyFrame(tl([]), tl([]))).toBe(450);
    expect(keyFrame(tl([{ id: "late", fromFrame: 80 }], [], 90), tl([]))).toBe(89);
  });
  it("goes to an element the variant changes, when it adds none (a new title text on the existing title)", () => {
    const base = tl([{ id: "title", fromFrame: 0, props: { text: "OLD" } }, { id: "z1", fromFrame: 400, props: {} }] as never);
    const v = tl([{ id: "title", fromFrame: 0, props: { text: "IA OU STYLO ?" } }, { id: "z1", fromFrame: 400, props: {} }] as never);
    expect(keyFrame(v, base)).toBe(21);
  });
});
