import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
});
