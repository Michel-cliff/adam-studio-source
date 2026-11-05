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
  it("never loses a subtitle or a title when no position clears the face, and says so", () => {
    const out = placeTextInThirds(timeline([0, 0.01, 1, 0.94]));
    expect(out.captions).toHaveLength(1); expect(out.elements).toHaveLength(1); expect(out.warnings).toHaveLength(2);
    // The caption sits as low as its band allows, the title small at the very top.
    const half = 2 * 0.0445 * out.width * 1.15 / 2 / out.height;
    expect(out.captions[0]!.y + half).toBeLessThanOrEqual(0.85);
    expect(out.captions[0]!.y).toBeGreaterThan(0.76);
    const t = out.elements[0]!;
    expect(t.textMaxHeight! / out.height).toBeLessThanOrEqual(0.08);
    expect(t.y - t.textMaxHeight! / out.height / 2).toBeGreaterThanOrEqual(0.05);
  });
  it("keeps a two-line subtitle clear of the mouth on a large close-up", () => {
    const out = placeTextInThirds(timeline([0.3, 0.3, 0.4, 0.5]));
    const half = 2 * 0.0445 * out.width * 1.15 / 2 / out.height;
    expect(out.captions).toHaveLength(1);
    expect(out.captions[0]!.y - half).toBeGreaterThan(0.3 + 0.5 * 0.82);
  });
  it("preserves an explicitly free layout", () => {
    const tl = timeline(); tl.style.textLayout = "free"; expect(placeTextInThirds(tl)).toBe(tl);
  });
});

it("leaves a title asked behind the head where it was put: above the head, nothing would pass in front of it", () => {
  const tl = timeline();
  const behind = { ...tl, elements: tl.elements.map((e) => (e.kind === "title" ? { ...e, layer: "behind-subject" as const, y: 0.315 } : e)) };
  const title = placeTextInThirds(behind).elements.find((e) => e.kind === "title")!;
  expect(title.y).toBe(0.315);
});
