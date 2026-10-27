import { describe, expect, it } from "vitest";
import { ImagePropsSchema } from "@adam-studio/model";
import { isVideoFile, startFrames } from "../../src/lib/media-kind";

describe("image elements that hold a video (popups, full-screen inserts)", () => {
  it("knows a video file from its extension", () => {
    expect(isVideoFile("C:/x/jarvis.MOV")).toBe(true);
    expect(isVideoFile("/a/b/clip.mp4")).toBe(true);
    expect(isVideoFile("/a/b/lamp.svg")).toBe(false);
    expect(isVideoFile("/a/b/photo.jpg")).toBe(false);
  });

  it("starts the video where the element says, in frames", () => {
    expect(startFrames(16_700, 30)).toBe(501);
    expect(startFrames(0, 30)).toBe(0);
  });

  it("takes a width, a start and a volume, muted unless asked", () => {
    const p = ImagePropsSchema.parse({ asset: "jarvis", fit: "contain", width: 0.42, startMs: 16_700 });
    expect(p).toMatchObject({ width: 0.42, startMs: 16_700, volume: 0 });
    expect(() => ImagePropsSchema.parse({ asset: "a", width: 2 })).toThrow();
  });
});
