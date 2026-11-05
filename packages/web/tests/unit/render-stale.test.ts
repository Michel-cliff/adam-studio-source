import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editStamp, writeVideoStamp } from "../../../render/src/lib/edit-stamp";
import { projectView } from "../../server/projects";
import { projectInput, styleInput } from "../../../render/tests/unit/helpers";

function project() {
  const root = mkdtempSync(join(tmpdir(), "adam-stale-")), dir = join(root, "demo");
  mkdirSync(join(dir, "renders"), { recursive: true });
  writeFileSync(join(dir, "style.json"), JSON.stringify(styleInput));
  writeFileSync(join(dir, "project.json"), JSON.stringify(projectInput()));
  return { root, dir, video: join(dir, "renders", "demo.mp4") };
}
const latest = (root: string) => projectView(root, "demo")!.renders[0]!;

describe("whether the MP4 shows the edit", () => {
  it("is up to date when the edit has not moved since the render read it", () => {
    const { root, dir, video } = project();
    const stamp = editStamp(dir);
    writeFileSync(video, "x"); writeVideoStamp(video, stamp);
    expect(latest(root).stale).toBe(false);
  });
  it("knows a change made during the render, though the video is newer than the change", () => {
    const { root, dir, video } = project();
    const stamp = editStamp(dir);
    writeFileSync(join(dir, "project.json"), JSON.stringify({ ...projectInput(), name: "moved during the render" }));
    utimesSync(join(dir, "project.json"), new Date(1000), new Date(1000));
    writeFileSync(video, "x"); writeVideoStamp(video, stamp);
    expect(latest(root).stale).toBe(true);
  });
  it("goes by the date for a video made before stamps", () => {
    const { root, dir, video } = project();
    writeFileSync(video, "x");
    utimesSync(video, new Date(1000), new Date(1000));
    expect(latest(root).stale).toBe(true);
    utimesSync(join(dir, "project.json"), new Date(500), new Date(500));
    expect(latest(root).stale).toBe(false);
  });
});
