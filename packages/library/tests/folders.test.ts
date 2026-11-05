import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REFERENCE_FOLDERS, scanInspiration, searchLocal } from "../src/local";

function inspiration() {
  const root = mkdtempSync(join(tmpdir(), "insp-folders-"));
  for (const [rel, body] of <[string, string][]>[
    ["references/typo/Anton.ttf", "x"],
    ["references/plans/close-up.png", "x"],
    ["references/sous-titres/bold-yellow.png", "x"],
    ["references/images-textures-palettes/grain.png", "x"],
    ["references/sons/whoosh.wav", "x"],
    ["references/interdits/glitch-cheap.png", "x"],
    ["Uploads/old.png", "x"],
  ]) { mkdirSync(join(root, rel, ".."), { recursive: true }); writeFileSync(join(root, rel), body); }
  return root;
}

describe("reference folders", () => {
  it("are typography, shots, captions, images-textures-palettes, sounds and don'ts, created on the first scan", () => {
    expect(REFERENCE_FOLDERS.map((f) => f.id)).toEqual(["typo", "plans", "sous-titres", "images-textures-palettes", "sons", "interdits"]);
    const root = mkdtempSync(join(tmpdir(), "insp-empty-"));
    scanInspiration(root);
    for (const f of REFERENCE_FOLDERS) expect(existsSync(join(root, "references", f.id))).toBe(true);
  });

  it("file each reference under its folder, the rest under other", () => {
    const by = Object.fromEntries(scanInspiration(inspiration()).map((i) => [i.title, i.category]));
    expect(by).toEqual({ "Anton": "typo", "close-up": "plans", "bold-yellow": "sous-titres", "grain": "images-textures-palettes", "whoosh": "sons", "glitch-cheap": "interdits", "old": "other" });
  });

  it("can be searched one at a time", () => {
    const root = inspiration();
    expect(searchLocal("", undefined, root, "sous-titres").map((i) => i.title)).toEqual(["bold-yellow"]);
    expect(searchLocal("", "image", root, "plans").map((i) => i.title)).toEqual(["close-up"]);
  });
});
