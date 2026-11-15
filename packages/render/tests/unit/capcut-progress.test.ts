import { describe, expect, it } from "vitest";
import { capcutRenderProgress } from "../../src/lib/capcut-progress";

describe("one CapCut export progress", () => {
  it("weights successive renders by frames and reserves completion for the project writer", () => {
    const lines: string[] = [];
    const part = capcutRenderProgress([10, 30], line => lines.push(line));
    const a = part(0), b = part(1);
    a(0); a(0.5); a(1); b(0); b(0.5); b(1);
    expect(lines).toEqual([
      "capcut: 0 % | Effect 1/2", "capcut: 11 % | Effect 1/2", "capcut: 22 % | Effect 1/2",
      "capcut: 22 % | Effect 2/2", "capcut: 56 % | Effect 2/2", "capcut: 90 % | Effect 2/2",
    ]);
  });

  it("does not rewind if the renderer retries, and suppresses duplicate updates", () => {
    const lines: string[] = [];
    const update = capcutRenderProgress([100], line => lines.push(line))(0);
    update(0.8); update(0); update(0.2); update(0.8); update(1);
    expect(lines).toEqual(["capcut: 72 % | Effect 1/1", "capcut: 90 % | Effect 1/1"]);
  });
});
