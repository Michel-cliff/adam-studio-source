import { describe, expect, it } from "vitest";
import { videoFormat } from "../../server/refwatch";

describe("downloading a reference", () => {
  // YouTube's single-file format 18 now often stops after a few hundred KB while yt-dlp reports success.
  it("asks for separate video and audio first, H.264 when there is one, the single file only as a fallback", () => {
    const f = videoFormat.split("/");
    expect(f[0]).toMatch(/^bv\*\[height<=720\]\[vcodec\^=avc1\]\+ba/);
    expect(f.at(-1)).toBe("b");
  });
});
