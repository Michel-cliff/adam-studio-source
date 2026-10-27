import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inspirationRoot } from "./local";

// A look is a folder of the Inspiration folder organised like a Claude skill: looks/<name>/LOOK.md (the entry, with a
// small front matter), references/style-guide.md (the values), references/ media, and skill/ (the original skill).
export type Look = { name: string; title: string; for: string };

const SAFE = /^[a-z0-9][a-z0-9_-]*$/i;

function split(text: string): { meta: Record<string, string>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

export function listLooks(root = inspirationRoot()): Look[] {
  const dir = join(root, "looks");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SAFE.test(d.name) && existsSync(join(dir, d.name, "LOOK.md")))
    .map((d) => {
      const { meta } = split(readFileSync(join(dir, d.name, "LOOK.md"), "utf8"));
      return { name: d.name, title: meta.title || d.name, for: meta.for || "" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The parts of a style guide every ask needs; the rest stays in the file, read only when a value is missing.
const KEY_SECTION = /correction|adam studio|default/i;
const SHORT_GUIDE = 6000;

/** A style guide cut to its opening, its correction sections and its Adam Studio recipe when it is long. */
function guideDigest(text: string): string {
  if (text.length <= SHORT_GUIDE) return text;
  const sections = text.split(/\n(?=## )/);
  return sections.filter((s, i) => i === 0 || KEY_SECTION.test(s.split("\n")[0]!)).join("\n").trim();
}

/** What Claude reads for a look: its LOOK.md and the key parts of its style guide. Null if unknown. */
export function lookBrief(name: string, root = inspirationRoot()): string | null {
  if (!SAFE.test(name)) return null;
  const dir = join(root, "looks", name);
  const entry = join(dir, "LOOK.md");
  if (!existsSync(entry)) return null;
  const guide = join(dir, "references", "style-guide.md");
  const parts = [`Look "${name}" (full style guide: ${guide}; open it only for a value missing here).`, split(readFileSync(entry, "utf8")).body.trim()];
  if (existsSync(guide)) parts.push(guideDigest(readFileSync(guide, "utf8").trim()));
  return parts.join("\n\n").slice(0, 12000);
}
