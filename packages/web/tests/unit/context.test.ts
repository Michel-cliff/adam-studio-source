import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSynthetic } from "../../../render/tests/e2e/synthetic";
import { stepContext } from "../../server/context";

let dir: string; const prev = process.env.ADAM_INSPIRATION;
beforeAll(() => {
  const inspi = mkdtempSync(join(tmpdir(), "adam ctx inspi-"));
  process.env.ADAM_INSPIRATION = inspi;
  mkdirSync(join(inspi, "references", "interdits"), { recursive: true });
  writeFileSync(join(inspi, "references", "interdits", "cheap-glitch.png"), "x");
  writeFileSync(join(inspi, "references", "interdits", "cheap-glitch.png.txt"), "No RGB glitch on titles.");
  dir = join(mkdtempSync(join(tmpdir(), "adam ctx-")), "ep");
  mkdirSync(dir);
  makeSynthetic(dir);
}, 120000);
afterAll(() => { if (prev === undefined) delete process.env.ADAM_INSPIRATION; else process.env.ADAM_INSPIRATION = prev; });

describe("the context sent with an ask", () => {
  it("holds the transcript one line per word, the patch shape and the step's kinds, without the words in the project", () => {
    const c = stepContext(dir, "visuals");
    expect(c).toMatch(/## Transcript\n# \w+ \(seconds of the take\)\n\S+\.w\d+ \d+\.\d /);
    expect(c).toMatch(/## Patch shape/);
    expect(c).toMatch(/## Props of image/);
    expect(c).not.toMatch(/"transcript"/);
  });

  it("lists the creator's don'ts as rules", () => {
    expect(stepContext(dir, "hook")).toMatch(/## Don'ts[^\n]*\n- cheap-glitch \(image, [^)]+\): No RGB glitch on titles\./);
  });

  it("tells the sound step when a take already has its sound mixed in, and says nothing otherwise", () => {
    expect(stepContext(dir, "sound")).not.toMatch(/## Sound of the takes/);
    const asset = JSON.parse(readFileSync(join(dir, "project.json"), "utf8")).story[0].asset as string;
    const file = join(dir, "cache", asset, "probe.json");
    mkdirSync(join(dir, "cache", asset), { recursive: true });
    const probe = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    writeFileSync(file, JSON.stringify({ ...probe, ingest: [`${asset}.mp4: sound at -34 dBFS between words (a noisy room, or music already mixed in): the take is kept`] }));
    const c = stepContext(dir, "sound");
    expect(c).toMatch(new RegExp(`## Sound of the takes[^\\n]*\\n${asset}: [^\\n]*already mixed in`));
    expect(c).toMatch(/Add no sound/);
    expect(stepContext(dir, "hook")).not.toMatch(/## Sound of the takes/);
  });
});
