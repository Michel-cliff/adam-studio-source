import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import { pipeline } from "node:stream/promises";
import { jsonIn, type AskAI } from "./ai";
import { serveFile } from "./files";
import { safeName } from "./guards";
import { listProjects } from "./projects";
import { watchRef } from "./refwatch";
import {
  addChat, addRef, addRule, updateRef, emptyVideo, METRICS, platformOf, readStats, removeRef, removeRule, saveVideo, setRule, topicOf, TOPICS, trends,
  type Metric, type Stats,
} from "./stats";
import { applyImport, IMPORT_FILES, importPrompt, isImage, type ImportAnswer } from "./stats-import";
import { loadRaw } from "./store";

type Ctx = {
  req: IncomingMessage; res: ServerResponse; url: URL; method: string; dir: string; root: string; ai: AskAI;
  send: (status: number, body: unknown) => void; body: () => Promise<Record<string, any>>;
};
class StatsError extends Error {}

const LABELS: Record<Metric, string> = { views: "Views", watchTime: "Average watch time", kept3s: "Kept at 3 s", finished: "Watched to the end", likes: "Likes", sharesSaves: "Shares · saves", follows: "Follows from it" };

/** The creator's projects with an export, plus any video that already has numbers. */
function videosOf(root: string, s: Stats) {
  const projects = (() => { try { return listProjects(root); } catch { return []; } })();
  const names = [...new Set([...projects.filter((p) => p.lastRender).map((p) => p.name), ...Object.keys(s.videos)])];
  return names.map((name) => {
    const v = { ...emptyVideo(), ...s.videos[name] };
    const p = projects.find((x) => x.name === name);
    return { name, exported: Boolean(p?.lastRender), lastRender: p?.lastRender ?? null, where: [...new Set(v.links.map(platformOf))].join(" · "), stats: v };
  }).sort((a, b) => (b.lastRender ?? 0) - (a.lastRender ?? 0));
}

/** What the video says and what was decided while editing it, for the AI to talk about it. */
function videoContext(root: string, name: string): string {
  if (!safeName(name) || !existsSync(join(root, name, "project.json"))) return "";
  try {
    const raw = loadRaw(join(root, name)) as Record<string, any>;
    const words = Object.values(raw.transcript?.words ?? {}).flat() as { text: string }[];
    const chosen = (raw.proposals ?? []).filter((p: any) => String(p.status).startsWith("accepted"))
      .map((p: any) => `${p.step}: ${p.variants?.find((v: any) => v.key === String(p.status).replace(/^accepted\s*/, ""))?.label ?? p.reason ?? ""}`);
    return [`What the creator says in it: ${words.map((w) => w.text).join(" ").slice(0, 2500)}`, chosen.length ? `Choices made while editing: ${chosen.join("; ")}` : ""].filter(Boolean).join("\n");
  } catch { return ""; }
}

const numbers = (m: Partial<Record<Metric, string>>) => METRICS.filter((k) => m[k]).map((k) => `${LABELS[k]}: ${m[k]}`).join(", ") || "none yet";
const rulesText = (s: Stats) => s.rules.filter((r) => r.on).map((r) => `- [${r.topic}] ${r.text} (${r.source})`).join("\n") || "none yet";

function chatPrompt(root: string, s: Stats, name: string, question: string): string {
  const v = { ...emptyVideo(), ...s.videos[name] };
  return [
    `You are the creator's editing and growth coach inside Adam Studio. We talk about their published video "${name}".`,
    `Its numbers: ${numbers(v.metrics)}.`, v.note ? `What the creator thinks worked: ${v.note}` : "", v.links.length ? `Published at: ${v.links.join(", ")}` : "",
    videoContext(root, name),
    `Rules they already keep:\n${rulesText(s)}`,
    v.chat.length ? `The conversation so far:\n${v.chat.slice(-10).map((m) => `${m.who === "you" ? "Creator" : "You"}: ${m.text}`).join("\n")}` : "",
    "Answer the creator's message below in its language, in at most 90 words of plain text (no markdown, no lists of more than three items).",
    "Be concrete: name the moment, the words or the element you mean. If a number would change your answer and is missing, say which one to add.",
    `Creator: ${question}`,
  ].filter(Boolean).join("\n\n");
}

function strategyPrompt(root: string, s: Stats, review: boolean): string {
  const vids = videosOf(root, s).map((v) => `- ${v.name}: ${numbers(v.stats.metrics)}${v.stats.note ? `; the creator thinks: ${v.stats.note}` : ""}`).join("\n") || "none yet";
  const refs = s.refs.filter((r) => r.status === "watched").map((r) => `- ${r.title ?? r.name}: ${r.saw.map((x) => `${x.k} ${x.v}`).join(" / ")}`).join("\n") || "none yet";
  return [
    "You are the creator's growth coach inside Adam Studio (short talking-head videos).",
    `Their videos and numbers:\n${vids}`, `References they watched:\n${refs}`,
    `Rules they keep now (id, topic, text, where it comes from):\n${s.rules.map((r) => `${r.id} [${r.topic}${r.on ? "" : ", off"}] ${r.text} (${r.source})`).join("\n") || "none yet"}`,
    review
      ? "Review these rules: which ones contradict each other, repeat each other or are not backed by the numbers? Suggest at most three better rules."
      : "Say what to do in the next video: what to keep, what to test (one change at a time, and which number will tell), what to stop.",
    `Topics are: ${TOPICS.join(", ")}. Answer with ONE JSON object only, in the language of the creator's notes (French if unsure):`,
    `{"say": "at most 80 words of plain text for the creator", "rules": [{"topic": "...", "text": "one concrete rule, at most 20 words"}]${review ? ', "off": ["ids of rules to turn off"]' : ""}}`,
    "At most three rules; none that repeats a rule they already keep.",
  ].join("\n\n");
}

async function saveBody(req: IncomingMessage, folder: string, name: string, ok: RegExp): Promise<string> {
  const clean = basename(name).replace(/[<>:"|?*\u0000-\u001f]/g, "_");
  if (!clean || !ok.test(clean)) throw new StatsError(`cannot use ${clean || "this file"}`);
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${Date.now().toString(36)}-${clean}`);
  try { await pipeline(req, createWriteStream(file)); } catch (e) { rmSync(file, { force: true }); throw new StatsError(`upload failed: ${(e as Error).message}`); }
  return file;
}

function inside(dir: string, file: string): boolean {
  const r = relative(dir, file);
  return Boolean(r) && !r.startsWith("..") && !isAbsolute(r);
}

/** Statistics routes; returns false when the path is not one of them. */
export async function statsRoute(c: Ctx): Promise<boolean> {
  const { url, method, send, dir, root, ai } = c;
  const path = url.pathname;
  if (!path.startsWith("/api/stats")) return false;
  const all = () => { const s = readStats(dir); return { videos: videosOf(root, s), refs: s.refs, rules: s.rules, trends: trends(s.refs), metrics: METRICS.map((k) => ({ k, label: LABELS[k] })) }; };
  let m: RegExpMatchArray | null;
  try {
    if (path === "/api/stats" && method === "GET") { send(200, all()); return true; }
    if ((m = path.match(/^\/api\/stats\/videos\/([^/]+)$/)) && method === "PUT") {
      saveVideo(dir, decodeURIComponent(m[1]!), await c.body());
      send(200, all()); return true;
    }
    if ((m = path.match(/^\/api\/stats\/videos\/([^/]+)\/chat$/)) && method === "POST") {
      const name = decodeURIComponent(m[1]!);
      const text = String((await c.body()).text ?? "").trim();
      if (!text) throw new StatsError("write your question first");
      const answer = await ai({ prompt: chatPrompt(root, readStats(dir), name, text) });
      addChat(dir, name, { who: "you", text }, { who: "ai", text: answer });
      send(200, all()); return true;
    }
    // A screenshot of the platform's stats page: the AI reads the numbers into the fields.
    if ((m = path.match(/^\/api\/stats\/videos\/([^/]+)\/screenshot$/)) && method === "POST") {
      const name = decodeURIComponent(m[1]!);
      const shot = await saveBody(c.req, join(dir, "stats-shots"), url.searchParams.get("name") ?? "", /\.(png|jpe?g|webp)$/i);
      const answer = await ai({ prompt: [
        "This is a screenshot of a video's statistics page (TikTok, Instagram, YouTube...). Read the numbers.",
        `Answer with ONE JSON object only, keys among ${METRICS.join(", ")} (${METRICS.map((k) => `${k} = ${LABELS[k]}`).join("; ")}),`,
        "values as shown on screen (keep units like s, %, K). Leave out what the screenshot does not show.",
      ].join("\n"), images: [shot] });
      const read = jsonIn<Record<string, unknown>>(answer) ?? {};
      const metrics = Object.fromEntries(Object.entries(read).filter(([k, v]) => METRICS.includes(k as Metric) && v !== null && v !== ""));
      if (!Object.keys(metrics).length) throw new StatsError("no number could be read on this screenshot");
      saveVideo(dir, name, { metrics });
      send(200, { ...all(), read: Object.keys(metrics) }); return true;
    }
    // The stats of other videos (a screenshot or an export): the AI reads every video, advises, updates the rules.
    if (path === "/api/stats/import" && method === "POST") {
      const file = await saveBody(c.req, join(dir, "stats-imports"), url.searchParams.get("name") ?? "", IMPORT_FILES);
      const image = isImage(file);
      const answer = jsonIn<ImportAnswer>(await ai({ prompt: importPrompt(readStats(dir), image ? null : readFileSync(file, "utf8")), images: image ? [file] : [] }));
      const done = answer ? applyImport(dir, answer) : null;
      if (!done?.videos.length) throw new StatsError("no video's numbers could be read in this file");
      send(200, { ...all(), imported: done }); return true;
    }
    if ((path === "/api/stats/strategy" || path === "/api/stats/review") && method === "POST") {
      const review = path.endsWith("review");
      const b = await c.body();
      const s = readStats(dir);
      const answer = jsonIn<{ say?: string; rules?: { topic: string; text: string }[]; off?: string[] }>(await ai({ prompt: strategyPrompt(root, s, review) }));
      if (!answer?.say) throw new StatsError("the AI gave no usable answer, try again");
      const fromNumbers = Object.values(s.videos).some((v) => Object.keys(v.metrics).length);
      const added = (answer.rules ?? []).slice(0, 3).flatMap((r) => { try { return [addRule(dir, { topic: TOPICS.includes(r.topic as never) ? r.topic : topicOf(r.topic), text: r.text, source: fromNumbers ? "YOUR NUMBERS" : "CLAUDE · STRATEGY" })]; } catch { return []; } });
      const off = review ? (answer.off ?? []).filter((id) => s.rules.some((r) => r.id === id)) : [];
      for (const id of off) setRule(dir, id, { on: false });
      if (!review && typeof b.video === "string" && b.video) addChat(dir, b.video, { who: "you", text: "What should I do in the next video?" }, { who: "ai", text: answer.say });
      send(200, { ...all(), say: answer.say, added: added.map((r) => r.id), off }); return true;
    }
    if (path === "/api/stats/refs" && method === "POST") {
      const ref = addRef(dir, { url: String((await c.body()).url ?? "").trim() });
      void watchRef(dir, ref, ai);
      send(202, all()); return true;
    }
    if (path === "/api/stats/refs/upload" && method === "POST") {
      const name = url.searchParams.get("name") ?? "";
      const file = await saveBody(c.req, join(dir, "refs", "files"), name, /\.(mp4|mov|mkv|m4v|webm)$/i);
      const ref = addRef(dir, { file, name: basename(name, extname(name)) });
      void watchRef(dir, ref, ai);
      send(202, all()); return true;
    }
    if ((m = path.match(/^\/api\/stats\/refs\/([\w]+)\/retry$/)) && method === "POST") {
      const ref = readStats(dir).refs.find((r) => r.id === m![1]);
      if (!ref) throw new StatsError("no such reference");
      void watchRef(dir, updateRef(dir, ref.id, { status: "watching", error: undefined }), ai);
      send(202, all()); return true;
    }
    // What Claude saw in a reference, kept as rules: to follow ("use") or never to do ("donts").
    if ((m = path.match(/^\/api\/stats\/refs\/([\w]+)\/use$/)) && method === "POST") {
      const ref = readStats(dir).refs.find((r) => r.id === m![1]);
      if (!ref || ref.status !== "watched") throw new StatsError("this reference is not watched yet");
      const donts = (await c.body()).as === "donts";
      const source = `REFERENCE · ${(ref.title ?? ref.name).slice(0, 40)}`;
      // To follow: the lessons the AI drew (what to do), else what it saw. Never to do: what it saw.
      if (!donts && ref.lessons?.length) for (const l of ref.lessons) addRule(dir, { topic: l.topic, text: l.text, source });
      else for (const s of ref.saw) addRule(dir, { topic: donts ? "donts" : topicOf(s.k), text: s.v, source });
      send(200, all()); return true;
    }
    if ((m = path.match(/^\/api\/stats\/refs\/([\w]+)$/)) && method === "DELETE") { removeRef(dir, m[1]!); send(200, all()); return true; }
    if (path === "/api/stats/file" && method === "GET") {
      const file = url.searchParams.get("path") ?? "";
      if (!inside(join(dir, "refs"), file) || !existsSync(file)) { send(404, { error: "not a reference file" }); return true; }
      serveFile(c.req, c.res, file); return true;
    }
    if (path === "/api/stats/rules" && method === "POST") {
      const b = await c.body();
      addRule(dir, { topic: String(b.topic ?? ""), text: String(b.text ?? ""), source: "YOU" });
      send(200, all()); return true;
    }
    if ((m = path.match(/^\/api\/stats\/rules\/([\w]+)$/)) && method === "PUT") { setRule(dir, m[1]!, await c.body()); send(200, all()); return true; }
    if ((m = path.match(/^\/api\/stats\/rules\/([\w]+)$/)) && method === "DELETE") { removeRule(dir, m[1]!); send(200, all()); return true; }
  } catch (e) {
    send(400, { error: (e as Error).message }); return true;
  }
  return false;
}
