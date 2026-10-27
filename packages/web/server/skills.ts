// The skills Claude Code has on this computer, named the way Claude Code's Skill tool calls them: a user skill by its
// name, a skill synced from claude.ai as anthropic-skills:<name>, a plugin's skill as <plugin>:<name>.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SkillInfo = { name: string; description: string };

function front(file: string): { name?: string; description?: string } {
  try {
    const m = readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    const out: Record<string, string> = {};
    for (const line of m[1]!.split(/\r?\n/)) {
      const kv = line.match(/^(name|description):\s*(.*)$/);
      if (kv) out[kv[1]!] = kv[2]!.trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch { return {}; }
}

const dirs = (d: string) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

function skillsIn(folder: string, prefix: string): SkillInfo[] {
  return dirs(folder).flatMap((d) => {
    const file = join(folder, d, "SKILL.md");
    if (!existsSync(file)) return [];
    const f = front(file);
    return [{ name: `${prefix}${f.name || d}`, description: (f.description ?? "").slice(0, 220) }];
  });
}

export function listSkills(home = homedir()): SkillInfo[] {
  const root = join(home, ".claude", "skills");
  const found: SkillInfo[] = [
    ...skillsIn(root, "").filter((s) => s.name !== "synced"),
    ...dirs(join(root, "synced")).flatMap((id) => skillsIn(join(root, "synced", id), "anthropic-skills:")),
  ];
  try {
    const j = JSON.parse(readFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), "utf8"));
    for (const [key, v] of Object.entries(j.plugins ?? {})) {
      const plugin = key.split("@")[0]!;
      for (const e of (Array.isArray(v) ? v : [v]) as { installPath?: string }[]) {
        if (e?.installPath) found.push(...skillsIn(join(e.installPath, "skills"), `${plugin}:`));
      }
    }
  } catch { /* no plugins */ }
  const seen = new Map<string, SkillInfo>();
  for (const s of found) if (!seen.has(s.name)) seen.set(s.name, s);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
