import { describe, it, expect } from "vitest";
import type { Timeline } from "../src/schema/timeline";
import { placeTextInThirds } from "../src/text-placement";
const timeline = (face?: number[]) => ({ format: "9:16", width: 1080, height: 1920,
  style: { name: "Default", caption: { size: 0.0445 } }, warnings: [],
  clips: [{ fromFrame: 0, durationFrames: 90, face }],
  elements: [{ id: "old-ai-title", kind: "title", x: 0.5, y: 0.43, fromFrame: 0, durationFrames: 90 }],
  captions: [{ id: "old-caption", text: "Une phrase\ntrès lisible", x: 0.5, y: 0.62, fromFrame: 0, durationFrames: 90 }],
}) as unknown as Timeline;
describe("the default upper and lower thirds", () => {
  it("repairs already-stored centre positions and keeps the complete text box in its third", () => {
    const out = placeTextInThirds(timeline()); const title = out.elements[0]!, cap = out.captions[0]!;
    expect(title.y + title.textMaxHeight! / out.height / 2).toBeLessThan(1/3);
    expect(cap.y - 0.0445 * out.width * 1.15 / out.height).toBeGreaterThan(2/3);
    expect(out.elements[0]!.y).not.toBe(0.43);
  });
  it("places the title above the head and the caption below the entire face", () => {
    const out = placeTextInThirds(timeline([0.25, 0.25, 0.4, 0.47])); const title = out.elements[0]!, cap = out.captions[0]!;
    expect(title.y + title.textMaxHeight! / out.height / 2).toBeLessThan(0.25);
    expect(cap.y - 0.0445 * out.width * 1.15 / out.height).toBeGreaterThan(0.72);
  });
  it("does not cover a full-height face when no legal position exists", () => {
    const out = placeTextInThirds(timeline([0, 0.01, 1, 0.94]));
    expect(out.elements).toHaveLength(0); expect(out.captions).toHaveLength(0); expect(out.warnings).toHaveLength(2);
  });
  it("preserves an explicitly free layout", () => {
    const tl = timeline(); tl.style.textLayout = "free"; expect(placeTextInThirds(tl)).toBe(tl);
  });
});
