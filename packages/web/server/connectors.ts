// Connectors: MCP servers Claude may use when the creator asks it something in the studio, beyond Adam Studio's own
// tools. They come from Claude Code's own configuration (~/.claude.json: Blender, CapCut, TouchDesigner...) or are
// added here by URL (Higgsfield...), and a few are built in (Savee). Which ones are on is kept in ~/.adam-studio/connectors.json. The interface only
// ever sees names and types: commands, env and headers stay on the server.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CONNECTORS_FILE = join(homedir(), ".adam-studio", "connectors.json");
type Server = Record<string, unknown>;
type Saved = { enabled: string[]; added: Record<string, Server> };
export type Connector = { name: string; type: string; source: "claude-code" | "built-in" | "added"; enabled: boolean };

const NAME = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
const OWN = "adam-studio";
/** Offered without being added. Savee (saved images and moodboards) signs in with OAuth: Claude Code's own entry,
    once signed in there, wins over this one. */
const BUILT_IN: Record<string, Server> = { savee: { type: "http", url: "https://mcp.savee.com/mcp" } };

function load(file: string): Saved {
  try {
    const s = JSON.parse(readFileSync(file, "utf8"));
    return { enabled: Array.isArray(s.enabled) ? s.enabled.filter((n: unknown) => typeof n === "string") : [], added: s.added && typeof s.added === "object" ? s.added : {} };
  } catch { return { enabled: [], added: {} }; }
}
function save(file: string, s: Saved): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(s, null, 2)}\n`);
}
const typeOf = (v: Server) => String(v.type ?? (v.url ? "http" : "stdio"));

/** Claude Code's user-level MCP servers, except Adam Studio's own (always there). */
function claudeServers(home: string): Record<string, Server> {
  try {
    const j = JSON.parse(readFileSync(join(home, ".claude.json"), "utf8"));
    const all: Record<string, Server> = j.mcpServers && typeof j.mcpServers === "object" ? j.mcpServers : {};
    return Object.fromEntries(Object.entries(all).filter(([n, v]) => n !== OWN && NAME.test(n) && v && typeof v === "object"));
  } catch { return {}; }
}

export function listConnectors(home = homedir(), file = CONNECTORS_FILE): Connector[] {
  const saved = load(file), on = new Set(saved.enabled), mine = claudeServers(home);
  const fromClaude = Object.entries(mine).filter(([n]) => !saved.added[n]).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, v]) => ({ name, type: typeOf(v), source: "claude-code" as const, enabled: on.has(name) }));
  const builtIn = Object.entries(BUILT_IN).filter(([n]) => !mine[n] && !saved.added[n])
    .map(([name, v]) => ({ name, type: typeOf(v), source: "built-in" as const, enabled: on.has(name) }));
  const added = Object.entries(saved.added).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, v]) => ({ name, type: typeOf(v), source: "added" as const, enabled: on.has(name) }));
  return [...fromClaude, ...builtIn, ...added];
}

export function setEnabled(names: string[], home = homedir(), file = CONNECTORS_FILE): void {
  const saved = load(file), known = new Set(listConnectors(home, file).map((c) => c.name));
  save(file, { ...saved, enabled: [...new Set(names.filter((n) => known.has(n)))] });
}

/** Adds a server by https URL (or a local command) and turns it on. */
export function addConnector(c: { name: string; url?: string; command?: string; args?: string[] }, file = CONNECTORS_FILE): void {
  if (!NAME.test(c.name) || c.name === OWN) throw new Error("the name takes letters, digits, - and _ (up to 41)");
  let server: Server;
  if (c.url) {
    if (!/^https:\/\//.test(c.url)) throw new Error("the server URL must start with https://");
    server = { type: "http", url: c.url };
  } else if (c.command) server = { type: "stdio", command: c.command, args: c.args ?? [] };
  else throw new Error("give the server's https URL or its command");
  const saved = load(file);
  save(file, { enabled: [...new Set([...saved.enabled, c.name])], added: { ...saved.added, [c.name]: server } });
}

export function removeConnector(name: string, file = CONNECTORS_FILE): void {
  const saved = load(file);
  const { [name]: _gone, ...added } = saved.added;
  save(file, { enabled: saved.enabled.filter((n) => n !== name), added });
}

/** What an ask passes to Claude Code: the enabled servers' full configs and their tool prefixes. */
export function askServers(home = homedir(), file = CONNECTORS_FILE): { servers: Record<string, Server>; tools: string[] } {
  const saved = load(file), mine = claudeServers(home);
  const servers: Record<string, Server> = {};
  for (const name of saved.enabled) {
    const config = saved.added[name] ?? mine[name] ?? BUILT_IN[name];
    if (config) servers[name] = config;
  }
  return { servers, tools: Object.keys(servers).map((n) => `mcp__${n}`) };
}

/** The full config of one connector, for the check; never sent to the interface. */
export function connectorConfig(name: string, home = homedir(), file = CONNECTORS_FILE): Server | null {
  return load(file).added[name] ?? claudeServers(home)[name] ?? BUILT_IN[name] ?? null;
}

export const connectorsAvailable = (home = homedir()) => existsSync(join(home, ".claude.json"));
