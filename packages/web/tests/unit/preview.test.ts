import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeSynthetic } from "../../../render/tests/e2e/synthetic";
import { previewData } from "../../server/preview";

let dir: string;
beforeAll(() => {
  dir = join(mkdtempSync(join(tmpdir(), "adam preview-")), "ep");
  mkdirSync(dir);
  makeSynthetic(dir);
}, 120000);

describe("the live preview", () => {
  it("shows an element meant behind the creator in front when the cut-out is missing, and says so", () => {
    rmSync(join(dir, "cache", "s", "subject.webm"), { force: true });
    const p = JSON.parse(readFileSync(join(dir, "project.json"), "utf8"));
    p.elements = [{ id: "word", kind: "image", layer: "behind-subject", anchor: { word: "s.w1" }, durationMs: 500, props: { asset: "m" } }];
    writeFileSync(join(dir, "project.json"), JSON.stringify(p));
    const d = previewData(dir, "ep");
    expect(d.timeline.elements.find((e) => e.id === "word")!.layer).toBe("front");
    expect(d.note).toMatch(/cut-out/);
  });
});
