import { listDAs, readDA } from "@adam-studio/render/src/lib/da";
// Statistics: the creator's numbers per exported video, the references Claude watched, and the rules learned from
// both and from the creator's feedback. One JSON file next to the settings (~/.adam-studio/stats.json), never sent
// anywhere: the AI reads it when the creator asks, and the rules that are on travel with every ask of their step.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const METRICS = ["views", "watchTime", "kept3s", "finished", "likes", "sharesSaves", "follows"] as const;
export type Metric = (typeof METRICS)[number];
export const TOPICS = ["hook", "captions", "visuals", "sound", "look", "donts"] as const;
export type Topic = (typeof TOPICS)[number];

export type Msg = { who: "you" | "ai"; text: string; at: number };
export type VideoStats = { metrics: Partial<Record<Metric, string>>; note: string; links: string[]; chat: Msg[]; source?: string };
export type Saw = { k: string; v: string };
export type Beat = { label: string; weight: number; kind: string };
export type Ref = {
  id: string; name: string; source: string; url?: string; file?: string; status: "watching" | "watched" | "failed";
  error?: string; title?: string; saw: Saw[]; beats: Beat[]; traits: string[]; lessons?: { topic: Topic; text: string }[]; shot?: string; at: number;
};
export type Rule = { id: string; topic: Topic; text: string; source: string; on: boolean; at: number };
export type Stats = { videos: Record<string, VideoStats>; refs: Ref[]; rules: Rule[] };

const fileOf = (dir: string) => join(dir, "stats.json");
const id = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function readStats(dir: string): Stats {
  try {
    const s = JSON.parse(readFileSync(fileOf(dir), "utf8"));
    return { videos: s.videos ?? {}, refs: Array.isArray(s.refs) ? s.refs : [], rules: Array.isArray(s.rules) ? s.rules : [] };
  } catch { return { videos: {}, refs: [], rules: [] }; }
}

function write(dir: string, s: Stats): Stats {
  mkdirSync(dir, { recursive: true });
  writeFileSync(fileOf(dir), `${JSON.stringify(s, null, 2)}\n`);
  return s;
}

export const emptyVideo = (): VideoStats => ({ metrics: {}, note: "", links: [], chat: [] });

/** Changes the numbers, the note or the links of a video; numbers and links are checked, the rest left alone. */
export function saveVideo(dir: string, name: string, patch: { metrics?: Record<string, unknown>; note?: unknown; links?: unknown; source?: string }): VideoStats {
  const s = readStats(dir);
  const v = { ...emptyVideo(), ...s.videos[name] };
  if (patch.metrics) {
    for (const [k, val] of Object.entries(patch.metrics)) {
      if (!METRICS.includes(k as Metric)) throw new Error(`unknown number "${k}"`);
      const t = String(val ?? "").trim().slice(0, 32);
      if (t) v.metrics = { ...v.metrics, [k]: t }; else { const { [k as Metric]: _, ...rest } = v.metrics; v.metrics = rest; }
    }
  }
  if (patch.note !== undefined) v.note = String(patch.note).slice(0, 2000);
  if (patch.source) v.source = patch.source;
  if (patch.links !== undefined) {
    if (!Array.isArray(patch.links) || patch.links.some((l) => !/^https?:\/\/\S+$/.test(String(l)))) throw new Error("links must be http(s) addresses");
    v.links = [...new Set(patch.links.map(String))].slice(0, 10);
  }
  s.videos[name] = v;
  write(dir, s);
  return v;
}

export function addChat(dir: string, name: string, ...msgs: Omit<Msg, "at">[]): VideoStats {
  const s = readStats(dir);
  const v = { ...emptyVideo(), ...s.videos[name] };
  v.chat = [...v.chat, ...msgs.map((m) => ({ ...m, text: m.text.slice(0, 4000), at: Date.now() }))].slice(-60);
  s.videos[name] = v;
  write(dir, s);
  return v;
}

/** Where a link points, as the short tag the lists show. */
export function platformOf(url: string): string {
  const h = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  return /tiktok/.test(h) ? "TT" : /instagram/.test(h) ? "IG" : /youtu/.test(h) ? "YT" : /x\.com|twitter/.test(h) ? "X" : /linkedin/.test(h) ? "IN" : "LINK";
}

export function addRef(dir: string, from: { url?: string; file?: string; name?: string }): Ref {
  if (from.url && !/^https?:\/\/\S+$/.test(from.url)) throw new Error("paste a full link (https://…)");
  if (!from.url && !from.file) throw new Error("paste a link or drop a video");
  const s = readStats(dir);
  if (from.url && s.refs.some((r) => r.url === from.url)) throw new Error("this reference is already in your list");
  // Until it is watched, a link shows as host and path, without its tracking query (?si=…).
  const short = from.url ? (() => { try { const u = new URL(from.url!); return `${u.hostname.replace(/^www\./, "")}${u.pathname}`.replace(/\/$/, ""); } catch { return from.url!; } })() : "";
  const ref: Ref = { id: id("r"), name: from.name || short || "video", source: from.url ? platformOf(from.url) : "FILE", url: from.url, file: from.file,
    status: "watching", saw: [], beats: [], traits: [], at: Date.now() };
  s.refs = [ref, ...s.refs];
  write(dir, s);
  return ref;
}

export function updateRef(dir: string, refId: string, patch: Partial<Ref>): Ref {
  const s = readStats(dir);
  const i = s.refs.findIndex((r) => r.id === refId);
  if (i < 0) throw new Error(`no reference "${refId}"`);
  s.refs[i] = { ...s.refs[i]!, ...patch, id: refId };
  write(dir, s);
  return s.refs[i]!;
}

export function removeRef(dir: string, refId: string): void {
  const s = readStats(dir);
  s.refs = s.refs.filter((r) => r.id !== refId);
  write(dir, s);
}

/** How often each trait comes back across the watched references, most common first. */
export function trends(refs: Ref[]): { trait: string; count: number; of: number }[] {
  const watched = refs.filter((r) => r.status === "watched");
  const counts = new Map<string, { trait: string; count: number }>();
  for (const r of watched) for (const t of new Map(r.traits.map((x) => x.trim()).filter(Boolean).map((x) => [x.toLowerCase(), x] as const)).values()) {
    const k = t.toLowerCase();
    counts.set(k, { trait: counts.get(k)?.trait ?? t, count: (counts.get(k)?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.trait.localeCompare(b.trait)).slice(0, 8).map((c) => ({ ...c, of: watched.length }));
}

export function addRule(dir: string, r: { topic: string; text: string; source: string }): Rule {
  if (!TOPICS.includes(r.topic as Topic)) throw new Error(`the topic must be one of ${TOPICS.join(", ")}`);
  const text = String(r.text ?? "").trim().slice(0, 300);
  if (!text) throw new Error("write the rule first");
  const s = readStats(dir);
  const same = s.rules.find((x) => x.topic === r.topic && x.text.toLowerCase() === text.toLowerCase());
  if (same) return same;
  const rule: Rule = { id: id("l"), topic: r.topic as Topic, text, source: String(r.source).slice(0, 60), on: true, at: Date.now() };
  s.rules = [...s.rules, rule];
  write(dir, s);
  return rule;
}

export function setRule(dir: string, ruleId: string, patch: { on?: boolean; text?: string }): Rule {
  const s = readStats(dir);
  const r = s.rules.find((x) => x.id === ruleId);
  if (!r) throw new Error(`no rule "${ruleId}"`);
  if (patch.on !== undefined) r.on = Boolean(patch.on);
  if (patch.text !== undefined && String(patch.text).trim()) r.text = String(patch.text).trim().slice(0, 300);
  write(dir, s);
  return r;
}

export function removeRule(dir: string, ruleId: string): void {
  const s = readStats(dir);
  s.rules = s.rules.filter((r) => r.id !== ruleId);
  write(dir, s);
}

// The topics a workflow step reads; the don'ts go with every step.
const STEP_TOPICS: Record<string, Topic[]> = {
  cuts: [], structure: ["hook"], captions: ["captions"], hook: ["hook"], beats: ["visuals"], visuals: ["visuals"], sound: ["sound"], look: ["look", "visuals"],
};

/** The rules that are on for a step, as lines for the ask; "" when there are none. */
export function learnedFor(dir: string, step: string): string {
  const topics = [...(STEP_TOPICS[step] ?? []), "donts"];
  const active = listDAs(dir).active;
  const da = readDA(dir);
  const on = readStats(dir).rules.filter((r) => r.on && topics.includes(r.topic)
    && (r.source !== "YOUR ART DIRECTION" || (active === "default" && da.dontsText === undefined))
    && !r.source.startsWith("ART DIRECTION: "));
  const exclusions = (da.dontsText ?? "").split("\n").filter(Boolean);
  if (!on.length && !exclusions.length) return "";
  return ["Rules the creator keeps (learned from their feedback, references and numbers; follow them):",
    ...on.map((r) => `- ${r.topic === "donts" ? "Never: " : ""}${r.text}`), ...exclusions.map((text) => `- Never: ${text}`)].join("\n");
}

/** The section of a reference's "saw" line, as a rule topic. */
export function topicOf(k: string): Topic {
  const t = k.toLowerCase();
  return /hook|open|accroche/.test(t) ? "hook" : /text|caption|title|sous/.test(t) ? "captions" : /sound|music|son/.test(t) ? "sound" : /look|grade|color|colour/.test(t) ? "look" : "visuals";
}
