import { describe, expect, it } from "vitest";
import { audioVolume, duckAmount } from "../../src/lib/audio";

const speech: [number, number][] = [[1000, 2000], [5000, 6000]];

describe("music under the voice", () => {
  it("is fully down when a word starts (80 ms ramp before it) and holds 200 ms after the last word", () => {
    expect(duckAmount(880, speech)).toBe(0);
    expect(duckAmount(920, speech)).toBe(0);
    expect(duckAmount(960, speech)).toBeCloseTo(0.5, 5);
    expect(duckAmount(1000, speech)).toBe(1);
    expect(duckAmount(1500, speech)).toBe(1);
    expect(duckAmount(2200, speech)).toBe(1);
  });
  it("comes back over 400 ms after the hold, never pumping between close words", () => {
    expect(duckAmount(2400, speech)).toBeCloseTo(0.5, 5);
    expect(duckAmount(2600, speech)).toBe(0);
  });
});

describe("audioVolume", () => {
  const fps = 30;
  const item = (id: string, seconds: number) => ({ id, asset: "a", fromFrame: 0, durationFrames: seconds * fps, sourceInMs: 0, volume: 1, fadeInMs: 0, fadeOutMs: 0 });
  it("lowers a music bed by 12 dB under the voice", () => {
    expect(audioVolume(item("e1", 10), 45, fps, speech)).toBeCloseTo(10 ** (-12 / 20), 4);
    expect(audioVolume(item("e1", 10), 105, fps, speech)).toBe(1);
  });
  it("leaves short sound effects alone, and lowers breaths between words by 6 dB on the take", () => {
    expect(audioVolume(item("pop", 1), 15, fps, speech)).toBe(1);
    expect(audioVolume(item("clip:c1", 10), 45, fps, speech)).toBe(1);
    expect(audioVolume(item("clip:c1", 10), 105, fps, speech)).toBeCloseTo(10 ** (-6 / 20), 4);
  });
});
