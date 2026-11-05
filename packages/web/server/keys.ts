// The creator's keys for the online libraries (Pixabay images and videos, Freesound sounds), kept in
// ~/.adam-studio/.env on this computer only, where the library search reads them. Both are optional.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VARS = { pixabay: "PIXABAY_API_KEY", freesound: "FREESOUND_API_KEY" } as const;
const NAMES = { pixabay: "Pixabay", freesound: "Freesound" } as const;
export type Provider = keyof typeof VARS;
export const PROVIDERS = Object.keys(VARS) as Provider[];

function read(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    for (const line of readFileSync(join(dir, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out.set(m[1]!, m[2]!.replace(/^["']|["']$/g, ""));
    }
  } catch { /* no file yet */ }
  return out;
}

/** Which keys are set, shown as their last four characters only. */
export function keyStatus(dir: string): Record<Provider, string | null> {
  const env = read(dir);
  const show = (v?: string) => (v ? `…${v.slice(-4)}` : null);
  return { pixabay: show(env.get(VARS.pixabay)), freesound: show(env.get(VARS.freesound)) };
}

/** Sets or (with "") removes a key; other lines of the file are kept as they are. */
export function setKey(dir: string, provider: Provider, value: string): void {
  const v = value.trim();
  if (v && !/^[\w-]{10,}$/.test(v)) throw new Error(`a ${NAMES[provider]} key is one word of letters, digits and dashes`);
  const name = VARS[provider];
  let lines: string[] = [];
  try { lines = readFileSync(join(dir, ".env"), "utf8").split(/\r?\n/).filter((l) => !new RegExp(`^\\s*${name}\\s*=`).test(l)); } catch { /* new file */ }
  if (v) lines.push(`${name}=${v}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".env"), `${lines.filter((l, i) => l || i < lines.length - 1).join("\n").trim()}\n`, { mode: 0o600 });
}
