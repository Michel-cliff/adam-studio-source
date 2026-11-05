import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldWelcome } from "../../server/welcome";

describe("the welcome project", () => {
  it("is made once, on an empty projects folder, when the tutorial video ships", () => {
    const d = mkdtempSync(join(tmpdir(), "adam welcome-"));
    const root = join(d, "projects"), marker = join(d, "welcomed"), video = join(d, "welcome.mp4");
    writeFileSync(video, "x");
    expect(shouldWelcome(root, marker, video)).toBe(true);
    mkdirSync(join(root, ".trash"), { recursive: true });
    expect(shouldWelcome(root, marker, video)).toBe(true);
    mkdirSync(join(root, "My video"));
    expect(shouldWelcome(root, marker, video)).toBe(false);
    expect(shouldWelcome(join(d, "empty"), marker, join(d, "missing.mp4"))).toBe(false);
    writeFileSync(marker, "done");
    expect(shouldWelcome(join(d, "empty"), marker, video)).toBe(false);
  });
});
