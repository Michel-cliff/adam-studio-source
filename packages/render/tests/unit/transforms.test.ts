import { expect, it } from "vitest";
import { planCapcut } from "../../src/lib/capcut";
import { timelineOf } from "./helpers";
it("preserves visual transforms through Remotion overlays in a CapCut export", () => {
  const tl = timelineOf({ elements: [{ id: "transformed", kind: "image", anchor: { atMs: 0 }, durationMs: 500, rotation: 12, scale: .7, opacity: .6, props: { asset: "m" } }] });
  expect(tl.elements[0]).toMatchObject({ rotation: 12, scale: .7, opacity: .6 });
  expect(planCapcut(tl).overlays.map(o => o.elementId)).toEqual(["transformed"]);
});
