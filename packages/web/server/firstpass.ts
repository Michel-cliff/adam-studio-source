import { joinWords, newWorkflow, parseProject, type Project, type Style, type Word } from "@adam-studio/model";
import { cutWords, tightenPauses } from "./cuts";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}' ]/gu, "").trim();

/** Words heard in the edit, in story order (a word counts when it lies inside a story clip). */
export function keptWords(p: Project): Word[] {
  return p.story.flatMap((c) => (p.transcript.words[c.asset] ?? []).filter((w) => w.startMs >= c.inMs && w.endMs <= c.outMs).sort((a, b) => a.startMs - b.startMs));
}

/** Filler words (one or two words long) of the transcript's language, or the format's own list. */
export function findFillers(words: Word[], fillers: string[]): string[] {
  const one = new Set(fillers.filter((f) => !f.includes(" ")).map(norm));
  const two = new Set(fillers.filter((f) => f.includes(" ")).map(norm));
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const a = norm(words[i]!.text);
    const b = words[i + 1] ? norm(words[i + 1]!.text) : "";
    if (b && two.has(`${a} ${b}`)) { out.push(words[i]!.id, words[i + 1]!.id); i++; }
    else if (one.has(a)) out.push(words[i]!.id);
  }
  return out;
}

/**
 * Retakes: the speaker starts a sentence, stops, and starts it again (in the same take or the next one). When the
 * same three words (10 letters or more, so "je me suis" does not count) come back after a pause or a take change, within
 * 10 seconds of the edit,
 * everything from the first attempt up to the restart is a failed take, at most 40 words; the last attempt is kept.
 * `at` gives a word's time in the edit: takes each have their own clock.
 */
export function findRetakes(words: Word[], at: (w: Word) => number = (w) => w.startMs, windowMs = 10000): { from: string; to: string; ids: string[] }[] {
  const out: { from: string; to: string; ids: string[] }[] = [];
  const key = (i: number) => (i + 2 < words.length ? [0, 1, 2].map((k) => norm(words[i + k]!.text)).join(" ") : "");
  let i = 0;
  while (i < words.length) {
    const k = key(i);
    let restart = -1;
    if (k && k.replace(/ /g, "").length >= 10) {
      for (let j = i + 3; j < words.length && j - i <= 40 && at(words[j]!) - at(words[i]!) <= windowMs; j++) {
        // A restart follows a break (a pause, or another take): repeating oneself in one breath is rhetoric.
        const prev = words[j - 1]!;
        const takeOf = (w: Word) => w.id.slice(0, w.id.lastIndexOf(".w"));
        const pauseBefore = takeOf(prev) !== takeOf(words[j]!) || words[j]!.startMs - prev.endMs >= 350;
        if (key(j) === k && pauseBefore) restart = j;
      }
    }
    if (restart > 0) {
      const ids = words.slice(i, restart).map((w) => w.id);
      out.push({ from: words[i]!.id, to: words[restart - 1]!.id, ids });
      i = restart;
    } else i++;
  }
  return out;
}

/** Each kept word's time in the edit (story clips back to back). */
export function editTimes(p: Project): Map<string, number> {
  const out = new Map<string, number>();
  let offset = 0;
  for (const c of p.story) {
    for (const w of p.transcript.words[c.asset] ?? []) if (w.startMs >= c.inMs && w.endMs <= c.outMs) out.set(w.id, offset + w.startMs - c.inMs);
    offset += c.outMs - c.inMs;
  }
  return out;
}

// Words a chunk never ends on: an article or a preposition left alone at the end of a caption reads as a typo.
const DANGLING = new Set(["le", "la", "les", "l'", "un", "une", "des", "du", "de", "d'", "à", "au", "aux", "en", "et", "ou", "sur", "dans", "par", "pour",
  "avec", "sans", "ma", "mon", "mes", "ta", "ton", "tes", "sa", "son", "ses", "ce", "cet", "cette", "the", "a", "an", "of", "to", "in", "on", "and", "or", "for", "with", "my", "your"]);

/** Captions: chunks of the edit's words, broken at punctuation, pauses, the length and the word count. */
export function captionChunks(words: Word[], maxChars: number, highlight: boolean, maxWords = Infinity) {
  const groups: Word[][] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) groups.push(cur);
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const next = words[i + 1];
    const length = joinWords([...cur, w].map((x) => x.text)).length;
    if (cur.length && (length > maxChars || cur.length >= maxWords)) {
      // The dangling article or preposition goes with the next caption, with the noun it belongs to.
      const carry: Word[] = [];
      while (cur.length > 1 && DANGLING.has(cur[cur.length - 1]!.text.toLowerCase().replace(/[^\p{L}']/gu, ""))) carry.unshift(cur.pop()!);
      flush();
      cur = carry;
    }
    cur.push(w);
    const pause = next ? next.startMs - w.endMs : Infinity;
    // A caption stays inside one take and one stretch of it: break at a take change or a jump back in time.
    const otherTake = next !== undefined && next.id.slice(0, next.id.lastIndexOf(".w")) !== w.id.slice(0, w.id.lastIndexOf(".w"));
    if (/[.!?…,;:]$/.test(w.text.trim()) || pause > 300 || pause < 0 || otherTake) flush();
  }
  flush();
  // A caption on screen under 0.8 s (its words, plus 60 ms before and 120 ms after) cannot be read: it joins its
  // neighbour in the same take, the next one first, when the two fit the limits together.
  const take = (w: Word) => w.id.slice(0, w.id.lastIndexOf(".w"));
  const fits = (a: Word[], b: Word[]) => take(a[0]!) === take(b[0]!) && a.length + b.length <= maxWords && joinWords([...a, ...b].map((w) => w.text)).length <= maxChars;
  const onScreen = (g: Word[]) => g[g.length - 1]!.endMs - g[0]!.startMs + 180;
  for (let i = 0; i < groups.length; i++) {
    if (onScreen(groups[i]!) >= 800) continue;
    if (i + 1 < groups.length && fits(groups[i]!, groups[i + 1]!)) { groups.splice(i, 2, [...groups[i]!, ...groups[i + 1]!]); i--; }
    else if (i > 0 && fits(groups[i - 1]!, groups[i]!)) { groups.splice(i - 1, 2, [...groups[i - 1]!, ...groups[i]!]); i -= 2; }
  }
  return groups.map((g) => {
    const longest = g.map((w) => w.text.replace(/[^\p{L}\p{N}'-]/gu, "")).sort((a, b) => b.length - a.length)[0] ?? "";
    return { words: [g[0]!.id, g[g.length - 1]!.id] as [string, string], text: joinWords(g.map((w) => w.text)), highlight: highlight && longest.length >= 6 ? [longest] : [] };
  });
}

export type FirstPassSummary = {
  fillers: number; stutters: number; retakes: { from: string; to: string; words: number }[]; captions: number; proposals: string[]; skipped: string[];
  /** Pauses over 3 s: brought down like the others, and named, since they are often a failed take to look at. */
  longPauses: { afterWord: string; ms: number }[];
};

// The default art direction's pauses: a breath (up to 0.6 s) stays whole, a longer pause keeps 0.25 s, never zero, so a
// cut reads as a pause and not as two sentences glued together. Cut points fall in the middle of the silence.
export const PAUSE_OVER_MS = 600;
export const PAUSE_KEEP_MS = 250;
const LONG_PAUSE_MS = 3000;
const STUTTER_MS = 400;

const bare = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/** Stutters: the same word said again within 0.4 s; every occurrence but the last goes. */
export function findStutters(words: Word[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < words.length; i++) {
    const a = words[i]!, b = words[i + 1]!;
    const take = (w: Word) => w.id.slice(0, w.id.lastIndexOf(".w"));
    if (take(a) === take(b) && bare(a.text) && bare(a.text) === bare(b.text) && b.startMs - a.endMs < STUTTER_MS) out.push(a.id);
  }
  return out;
}

/**
 * The mechanical part of a first pass, as proposals of the guided workflow (nothing is applied until decided):
 * cuts (A tight: fillers, stutters, retakes, pauses over 0.6 s kept at 0.25 s; B light: fillers and very long pauses) and captions (A two lines
 * with a highlighted word, B one line). Re-running replaces its own pending proposals and leaves decided ones alone.
 */
/** The first pass's labels, in the creator's language (their interface when they ran it). */
const WORDS = {
  en: {
    tight: (f: number, r: number, o = 0.6, k = 0.25) => `tight: ${f} fillers, ${r} retakes, pauses over ${o} s cut to ${k} s`, light: (f: number) => `light: ${f} fillers, pauses over 0.9 s`,
    two: (n: number) => `${n} captions, two lines, one word highlighted`, one: (n: number) => `${n} captions, one line, no highlight`,
    cuts: "First pass: fillers, failed takes and dead air", captions: "First pass: captions from the transcript",
  },
  fr: {
    tight: (f: number, r: number, o = 0.6, k = 0.25) => `serré : ${f} hésitations, ${r} reprises, pauses de plus de ${String(o).replace(".", ",")} s ramenées à ${String(k).replace(".", ",")} s`, light: (f: number) => `léger : ${f} hésitations, pauses de plus de 0,9 s`,
    two: (n: number) => `${n} sous-titres, deux lignes, un mot en couleur`, one: (n: number) => `${n} sous-titres, une ligne, sans couleur`,
    cuts: "Premier jet : hésitations, reprises et temps morts", captions: "Premier jet : sous-titres depuis la transcription",
  },
};

/** What the creator's art direction sets in the first pass (its rhythm's pauses, its captions' density). */
export type FirstPassParams = { pauseOverMs: number; pauseKeepMs: number; maxWords: number; maxChars: number };
const DEFAULT_PARAMS: FirstPassParams = { pauseOverMs: PAUSE_OVER_MS, pauseKeepMs: PAUSE_KEEP_MS, maxWords: 5, maxChars: 32 };

export function firstPass(input: Project, style: Style, lang: "en" | "fr" = "en", params: FirstPassParams = DEFAULT_PARAMS): { project: Project; summary: FirstPassSummary } {
  const w = WORDS[lang];
  let p: Project = { ...input, workflow: input.workflow ?? newWorkflow() };
  const words = keptWords(p);
  const fillerList = style.lint[p.canvas.format]?.fillers ?? style.fillers?.[p.transcript.lang] ?? [];
  const fillers = findFillers(words, fillerList);
  const times = editTimes(p);
  const retakes = findRetakes(words, (w) => times.get(w.id) ?? w.startMs);
  const stutters = findStutters(words);
  const longPauses = words.slice(0, -1).flatMap((x, i) => {
    const next = words[i + 1]!, gap = next.startMs - x.endMs;
    return x.id.slice(0, x.id.lastIndexOf(".w")) === next.id.slice(0, next.id.lastIndexOf(".w")) && gap > LONG_PAUSE_MS ? [{ afterWord: x.id, ms: gap }] : [];
  });
  const summary: FirstPassSummary = {
    fillers: fillers.length, stutters: stutters.length, retakes: retakes.map((r) => ({ from: r.from, to: r.to, words: r.ids.length })),
    captions: 0, proposals: [], skipped: [], longPauses,
  };

  const put = (id: string, step: Project["proposals"][number]["step"], reason: string, variants: { key: "A" | "B"; label: string; patch: Record<string, unknown> }[]) => {
    const old = p.proposals.find((x) => x.id === id);
    if (old && (old.status !== "pending" || old.history.length)) { summary.skipped.push(`${id} (already decided or discussed)`); return; }
    const proposal = { id, step, reason, variants, status: "pending" as const, history: [] };
    p = { ...p, proposals: old ? p.proposals.map((x) => (x.id === id ? (proposal as never) : x)) : [...p.proposals, proposal as never] };
    summary.proposals.push(id);
  };

  const safeCut = (ids: string[]) => { try { return ids.length ? cutWords(p, ids) : p; } catch { return p; } };
  const tight = tightenPauses(safeCut([...new Set([...fillers, ...stutters, ...retakes.flatMap((r) => r.ids)])]), params.pauseOverMs, params.pauseKeepMs);
  const light = tightenPauses(safeCut(fillers), 900, 300);
  const same = (a: Project) => JSON.stringify(a.story) === JSON.stringify(p.story);
  const cutVariants: { key: "A" | "B"; label: string; patch: Record<string, unknown> }[] = [];
  if (!same(tight)) cutVariants.push({ key: "A", label: w.tight(fillers.length, retakes.length, params.pauseOverMs / 1000, params.pauseKeepMs / 1000), patch: { setStory: tight.story } });
  if (!same(light) && JSON.stringify(light.story) !== JSON.stringify(tight.story)) {
    cutVariants.push({ key: cutVariants.length ? "B" : "A", label: w.light(fillers.length), patch: { setStory: light.story } });
  }
  if (cutVariants.length) put("auto.cuts", "cuts", w.cuts, cutVariants);
  else summary.skipped.push("auto.cuts (nothing to cut)");

  if (p.captions.length === 0 && words.length) {
    const max = style.caption.maxCharsPerLine;
    // The default art direction: 3 to 5 words, 32 characters at most per caption (two lines).
    const two = captionChunks(words, params.maxChars, true, params.maxWords);
    const one = captionChunks(words, max, false);
    summary.captions = two.length;
    put("auto.captions", "captions", w.captions, [
      { key: "A", label: w.two(two.length), patch: { addCaptions: two } },
      { key: "B", label: w.one(one.length), patch: { addCaptions: one } },
    ]);
  } else summary.skipped.push(p.captions.length ? "auto.captions (the project has captions)" : "auto.captions (no words)");

  const parsed = parseProject(JSON.parse(JSON.stringify(p)));
  if (!parsed.ok) throw new Error(`first pass produced an invalid project: ${parsed.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
  return { project: parsed.value, summary };
}
