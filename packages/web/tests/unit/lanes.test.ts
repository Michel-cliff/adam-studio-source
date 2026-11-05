import { describe, expect, it } from "vitest";
import type { Timeline } from "@adam-studio/model";
import { pack, peaks, stripSlots } from "../../app/lanes";

const clip = (asset: string, fromFrame: number, durationFrames: number, sourceInMs: number) => ({ id: asset + fromFrame, asset, fromFrame, durationFrames, sourceInMs, sourceOutMs: sourceInMs + (durationFrames * 1000) / 30 });
const tl = (clips: ReturnType<typeof clip>[], durationFrames: number) => ({ fps: 30, durationFrames, clips }) as unknown as Timeline;

describe("the filmstrip of the story lane", () => {
  it("takes one frame in the middle of each slot, in the source of the clip playing there", () => {
    const t = tl([clip("t1", 0, 30, 5000), clip("t2", 30, 30, 0)], 60);
    expect(stripSlots(t, 2)).toEqual([{ asset: "t1", ms: 5500 }, { asset: "t2", ms: 500 }]);
  });
  it("leaves a gap empty", () => {
    expect(stripSlots(tl([clip("t1", 0, 30, 0)], 60), 2)).toEqual([{ asset: "t1", ms: 500 }, null]);
  });
});

describe("the lanes", () => {
  it("stacks overlapping blocks and reuses a lane once it is free", () => {
    const out = pack([{ fromFrame: 0, durationFrames: 10 }, { fromFrame: 5, durationFrames: 10 }, { fromFrame: 12, durationFrames: 5 }]);
    expect(out.map((x) => x.lane)).toEqual([0, 1, 0]);
  });
});

describe("a waveform", () => {
  it("is the loudest sample of each bucket, scaled to the loudest of all", () => {
    const s = new Float32Array([0.1, -0.5, 0.25, 0.2, 0, 0]);
    expect(peaks(s, 3)).toEqual([1, 0.5, 0]);
  });
  it("is flat for silence", () => {
    expect(peaks(new Float32Array(10), 2)).toEqual([0, 0]);
  });
});
