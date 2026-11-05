import { describe, expect, it } from "vitest";
import { edgeBlur } from "../../src/lib/edgeblur";

describe("the edge blur of the default art direction", () => {
  const face: [number, number, number, number] = [0.35, 0.4, 0.3, 0.17]; // x, y, w, h as shares of the frame
  it("blurs around the face, 1.2 px at rest up to 2.2 px with the push, never the face itself", () => {
    const still = edgeBlur(face, 1080, 1920, 0)!;
    expect(still.radius).toBeCloseTo(1.2, 5);
    expect(edgeBlur(face, 1080, 1920, 0.012)!.radius).toBeCloseTo(2.2, 5);
    expect(edgeBlur(face, 1080, 1920, 0.006)!.radius).toBeCloseTo(1.7, 5);
    // The clear ellipse: centred on the face, 1.35 times its size, a 180 px fade outside it.
    expect(still.mask).toBe("radial-gradient(ellipse 219px 220px at 540px 931px, transparent 100%, black calc(100% + 180px))");
  });
  it("leaves a close-up alone (face over 55 % of the height) and a shot with no face found", () => {
    expect(edgeBlur([0.2, 0.1, 0.6, 0.6], 1080, 1920, 0.012)).toBeNull();
    expect(edgeBlur(undefined, 1080, 1920, 0.012)).toBeNull();
  });
});
