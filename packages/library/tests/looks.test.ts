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

  it("keeps a long style guide to its opening, its corrections and its Adam Studio recipe", () => {
    const root = inspiration();
    const filler = "Palette detail. ".repeat(900);
    writeFileSync(join(root, "looks", "editorial-archival", "references", "style-guide.md"),
      `# Style guide\n\nRead this first.\n\n## The creator's corrections\n\nZooms easeMs 900.\n\n## Palette\n\n${filler}\n\n## In Adam Studio\n\nfx zoomBlur 3.\n`);
    const text = lookBrief("editorial-archival", root)!;
    expect(text).toMatch(/Read this first/);
    expect(text).toMatch(/Zooms easeMs 900/);
    expect(text).toMatch(/fx zoomBlur 3/);
    expect(text).not.toMatch(/Palette detail/);
    expect(text).toMatch(/style-guide\.md/);
  });

  it("keeps a look's original skill files out of the asset search, but not its references", () => {
    const rels = scanInspiration(inspiration()).map((i) => i.rel.replace(/\\/g, "/"));
    expect(rels).toContain("looks/editorial-archival/references/photos/ref.png");
    expect(rels.some((r) => r.includes("/skill/"))).toBe(false);
  });
});
