// Stats of other videos (not edited in Adam Studio): a screenshot or an export the creator drops. The AI reads the
// numbers of each video, says how to improve it, and updates the rules (new dos and don'ts, contradicted ones off).
import { addChat, addRule, METRICS, saveVideo, setRule, topicOf, TOPICS, type Metric, type Stats } from "./stats";

export type ImportAnswer = {
  say?: string;
  videos?: { name?: string; metrics?: Record<string, unknown>; advice?: string }[];
  rules?: { topic: string; text: string }[];
  off?: string[];
};

export const IMPORT_FILES = /\.(png|jpe?g|webp|csv|tsv|txt|json)$/i;
export const isImage = (name: string) => /\.(png|jpe?g|webp)$/i.test(name);

export function importPrompt(s: Stats, text: string | null): string {
  return [
    "You are the creator's growth coach inside Adam Studio (short talking-head videos).",
    text ? `The creator dropped this export of their videos' statistics:\n${text.slice(0, 12_000)}` : "The image is a screenshot of the statistics of one or more of the creator's videos (TikTok, Instagram, YouTube...).",
    `Read each video's numbers into these keys: ${METRICS.join(", ")} (keep units like s, %, K as shown; leave out what is not there).`,
    "For each video, say in at most 50 words what to change to improve it, from its numbers (a weak 3 s hold means the hook, a low finish rate means the middle or the length, and so on).",
    `Rules the creator keeps now (id, topic, text):\n${s.rules.filter((r) => r.on).map((r) => `${r.id} [${r.topic}] ${r.text}`).join("\n") || "none yet"}`,
    "Then update these rules: at most three new ones the numbers back (a do or a don't, topic among " + TOPICS.join(", ") + ", at most 20 words, none that repeats a kept rule), and the ids of kept rules the numbers contradict.",
    "Answer with ONE JSON object only, in the language of the stats (French if unsure):",
    '{"say": "at most 60 words for the creator", "videos": [{"name": "the video\'s title or date, short", "metrics": {}, "advice": "..."}], "rules": [{"topic": "...", "text": "..."}], "off": ["rule ids"]}',
  ].join("\n\n");
}

/** Saves what the AI read: the videos (marked imported, the advice in their chat), the new rules, the rules turned off. */
export function applyImport(dir: string, a: ImportAnswer): { say: string; videos: string[]; added: string[]; off: string[] } {
  const videos: string[] = [];
  for (const v of a.videos ?? []) {
    const name = String(v.name ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 80);
    if (!name) continue;
    const metrics = Object.fromEntries(Object.entries(v.metrics ?? {}).filter(([k, x]) => METRICS.includes(k as Metric) && x !== null && String(x).trim()));
    saveVideo(dir, name, { metrics, source: "IMPORTED" });
    if (v.advice) addChat(dir, name, { who: "ai", text: String(v.advice).slice(0, 1200) });
    videos.push(name);
  }
  const added = (a.rules ?? []).slice(0, 3).flatMap((r) => {
    try { return [addRule(dir, { topic: TOPICS.includes(r.topic as never) ? r.topic : topicOf(r.topic), text: r.text, source: "IMPORTED STATS" }).id]; } catch { return []; }
  });
  const off = (a.off ?? []).filter((id) => { try { setRule(dir, id, { on: false }); return true; } catch { return false; } });
  return { say: String(a.say ?? ""), videos, added, off };
}
