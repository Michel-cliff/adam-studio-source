import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanInspiration } from "../src/local";
import { listLooks, lookBrief } from "../src/looks";

function inspiration() {
  const root = mkdtempSync(join(tmpdir(), "insp-"));
  const look = join(root, "looks", "editorial-archival");
  mkdirSync(join(look, "references", "photos"), { recursive: true });
  mkdirSync(join(look, "skill", "assets"), { recursive: true });
  writeFileSync(join(look, "LOOK.md"), "---\nname: editorial-archival\ntitle: Editorial archival\nfor: talking heads\n---\n\n# Editorial archival\n\nInserts in soft black and white.\n");
  writeFileSync(join(look, "references", "style-guide.md"), "# Style guide\n\nGrain on inserts only.\n");
  writeFileSync(join(look, "references", "photos", "ref.png"), "x");
  writeFileSync(join(look, "skill", "assets", "engine-sprite.png"), "x");
  mkdirSync(join(root, "looks", "empty"), { recursive: true }); // no LOOK.md: not a look
  return root;
}

describe("looks", () => {
  it("lists the looks of the Inspiration folder from their LOOK.md", () => {
    expect(listLooks(inspiration())).toEqual([{ name: "editorial-archival", title: "Editorial archival", for: "talking heads" }]);
  });

  it("gives Claude the look's entry file and style guide, without the front matter", () => {
    const text = lookBrief("editorial-archival", inspiration())!;
    expect(text).toMatch(/Inserts in soft black and white/);
    expect(text).toMatch(/Grain on inserts only/);
    expect(text).not.toMatch(/^---/);
    expect(lookBrief("nope", inspiration())).toBeNull();
    expect(lookBrief("../etc", inspiration())).toBeNull();
  });

  it("keeps a look's original skill files out of the asset search, but not its references", () => {
    const rels = scanInspiration(inspiration()).map((i) => i.rel.replace(/\\/g, "/"));
    expect(rels).toContain("looks/editorial-archival/references/photos/ref.png");
    expect(rels.some((r) => r.includes("/skill/"))).toBe(false);
  });
});
