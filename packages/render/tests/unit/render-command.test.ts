import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileSafeName, parseFrames, moveIntoPlace } from "../../src/commands/render";
import { CliError, loadProject } from "../../src/project-io";
import { projectInput, styleInput } from "./helpers";

describe("parseFrames", () => {
  it("reads a-b and rejects anything else", () => {
    expect(parseFrames("10-40")).toEqual([10, 40]);
    expect(parseFrames(undefined)).toBeNull();
    expect(() => parseFrames("ten")).toThrow(CliError);
  });
});

describe("loadProject", () => {
  it("loads the project and its style relative to the folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam io-"));
    writeFileSync(join(dir, "project.json"), JSON.stringify(projectInput()));
    writeFileSync(join(dir, "style.json"), JSON.stringify(styleInput));
    const { project, style } = loadProject(dir);
    expect(project.name).toBe("synthetic");
    expect(style.name).toBe("Test");
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists every invalid field", () => {
    const dir = mkdtempSync(join(tmpdir(), "adam io-"));
    writeFileSync(join(dir, "project.json"), JSON.stringify({ ...projectInput(), story: [{ id: "c1", asset: "s", inMs: 5, outMs: 5 }] }));
    writeFileSync(join(dir, "style.json"), JSON.stringify(styleInput));
    expect(() => loadProject(dir)).toThrow("project.json is invalid:\n- story[0].outMs: outMs must be greater than inMs");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("fileSafeName", () => {
  it("keeps accents and spaces but replaces characters Windows forbids in file names", () => {
    expect(fileSafeName("Épisode 3 : Jobless")).toBe("Épisode 3 - Jobless");
    expect(fileSafeName(String.raw`a/b\c*d?e"f<g>h|i`)).toBe("a-b-c-d-e-f-g-h-i");
  });
  it("never returns an empty name or one ending with a dot or a space", () => {
    expect(fileSafeName("...")).toBe("edit");
    expect(fileSafeName("final. ")).toBe("final");
  });
});

describe("putting a finished video in place", () => {
  const locked = (times: number) => {
    const calls: string[] = [];
    let left = times;
    return { calls, rename: (a: string, b: string) => {
      calls.push(b);
      if (left-- > 0) throw Object.assign(new Error("in use"), { code: "EPERM" });
    } };
  };
  it("waits for a player to let go", () => {
    const r = locked(2);
    expect(moveIntoPlace("a.part.mp4", "a.mp4", { rename: r.rename, waitMs: 2000 })).toBe("a.mp4");
    expect(r.calls).toEqual(["a.mp4", "a.mp4", "a.mp4"]);
  });
  it("keeps the render under a dated name when the old file stays open: minutes of work are never lost", () => {
    const r = locked(1000);
    let last = 0;
    const out = moveIntoPlace("a.part.mp4", "a.mp4", { rename: (x, y) => { last++; if (y === "a.mp4") r.rename(x, y); }, waitMs: 5, now: new Date("2026-11-05T01:52:00Z") });
    expect(out).toBe("a 20261105-0152.mp4");
    expect(last).toBeGreaterThan(1);
  });
  it("does not hide another failure", () => {
    expect(() => moveIntoPlace("a", "b.mp4", { rename: () => { throw Object.assign(new Error("gone"), { code: "ENOENT" }); } })).toThrow("gone");
  });
});
