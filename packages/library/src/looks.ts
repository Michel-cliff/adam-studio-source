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

/** What Claude reads for a look: its LOOK.md and its style guide, with the folder to open for the rest. Null if unknown. */
export function lookBrief(name: string, root = inspirationRoot()): string | null {
  if (!SAFE.test(name)) return null;
  const dir = join(root, "looks", name);
  const entry = join(dir, "LOOK.md");
  if (!existsSync(entry)) return null;
  const parts = [`Look "${name}" (folder ${dir}: open its references/ and skill/ with look_at or by path when you need more).`, split(readFileSync(entry, "utf8")).body.trim()];
  const guide = join(dir, "references", "style-guide.md");
  if (existsSync(guide)) parts.push(readFileSync(guide, "utf8").trim());
  return parts.join("\n\n").slice(0, 16000);
}
