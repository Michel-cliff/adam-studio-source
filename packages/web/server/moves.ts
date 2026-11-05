// Dragging blocks on the timeline. Everything stays anchored on words, so a later cut or reorder keeps it with
// what is said: an element goes to the word said at the drop (plus the offset into it), a caption to the words
// said there, and a story clip to another place in the order.
import { anchorMs, createContext, type Project, type Style } from "@adam-studio/model";
import { ToolError } from "./store";

type Out = { id: string; asset: string; startMs: number; endMs: number };

/** The words still in the edit, with where they land in it, in edit order. */
function keptWords(project: Project, style: Style): Out[] {
  const ctx = createContext(project, style);
  const out: Out[] = [];
  for (const [asset, list] of Object.entries(project.transcript?.words ?? {})) {
    for (const w of list) { const o = ctx.wordOut(w.id); if (o) out.push({ id: w.id, asset, ...o }); }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** The word said at a moment of the edit: the last one started by then, else the first. */
function wordAt(words: Out[], ms: number): Out {
  if (!words.length) throw new ToolError("no word is left in the edit to anchor on");
  return [...words].reverse().find((w) => w.startMs <= ms) ?? words[0]!;
}

export function moveElement(project: Project, style: Style, id: string, toMs: number): Project {
  const el = project.elements.find((e) => e.id === id);
  if (!el) throw new ToolError(`no element "${id}"`);
  const at = Math.max(0, Math.round(toMs));
  let next = { ...el };
  if ("atMs" in el.anchor) next.anchor = { atMs: at };
  else {
    const words = keptWords(project, style);
    // An element lasting until a word moves as a whole: it keeps its length, now as a duration.
    if (el.untilWord) {
      const ctx = createContext(project, style);
      const start = ctx.wordOut(el.anchor.word), end = ctx.wordOut(el.untilWord);
      if (start && end) { const { untilWord: _, ...rest } = next; next = { ...rest, durationMs: Math.max(1, end.endMs - (start.startMs + el.anchor.offsetMs)) }; }
    }
    const w = wordAt(words, at);
    next.anchor = { word: w.id, offsetMs: at - w.startMs };
  }
  return { ...project, elements: project.elements.map((e) => (e.id === id ? next : e)) };
}

export function moveCaption(project: Project, style: Style, index: number, toMs: number): Project {
  const c = project.captions[index];
  if (!c) throw new ToolError(`no caption ${index}`);
  const words = keptWords(project, style);
  if (!words.length) throw new ToolError("no word is left in the edit to put the caption on");
  // Counted in the take's own words: a caption often starts on a word the cuts removed.
  const take = (asset: string) => project.transcript.words[asset] ?? [];
  const own = Object.values(project.transcript.words).find((l) => l.some((w) => w.id === c.words[0])) ?? [];
  const from = own.findIndex((w) => w.id === c.words[0]), to = own.findIndex((w) => w.id === c.words[1]);
  const count = from >= 0 && to >= from ? to - from + 1 : 1;
  // Onto the word whose start is nearest to the drop: the block lands where it is let go.
  const at = Math.max(0, toMs);
  const start = words.reduce((best, w) => (Math.abs(w.startMs - at) < Math.abs(best.startMs - at) ? w : best));
  const list = take(start.asset);
  const i = list.findIndex((w) => w.id === start.id);
  const last = list[Math.min(list.length - 1, i + count - 1)]!;
  return { ...project, captions: project.captions.map((x, k) => (k === index ? { ...x, words: [start.id, last.id] } : x)) };
}

export function moveStory(project: Project, clipId: string, toIndex: number): Project {
  const i = project.story.findIndex((c) => c.id === clipId);
  if (i < 0) throw new ToolError(`no clip "${clipId}"`);
  const story = [...project.story];
  const [clip] = story.splice(i, 1);
  story.splice(Math.max(0, Math.min(story.length, toIndex)), 0, clip!);
  return { ...project, story };
}

/** Drags an edge of an element: its start (the end stays) or its end (the start stays). It then lasts a duration. */
export function resizeElement(project: Project, style: Style, id: string, edge: "start" | "end", toMs: number): Project {
  const el = project.elements.find((e) => e.id === id);
  if (!el) throw new ToolError(`no element "${id}"`);
  const ctx = createContext(project, style);
  const start = anchorMs(ctx, el.anchor);
  if (start === null) throw new ToolError(`element "${id}" is hidden: its word is cut`);
  const end = el.durationMs !== undefined ? start + el.durationMs : el.untilWord ? (ctx.wordOut(el.untilWord)?.endMs ?? ctx.totalMs) : ctx.totalMs;
  const { untilWord: _u, untilEnd: _e, ...rest } = el;
  let next: typeof el;
  if (edge === "end") next = { ...rest, durationMs: Math.max(MIN_MS, Math.round(toMs - start)) };
  else {
    const at = Math.max(0, Math.min(Math.round(toMs), end - MIN_MS));
    const anchor = "atMs" in el.anchor ? { atMs: at } : (() => { const w = wordAt(keptWords(project, style), at); return { word: w.id, offsetMs: at - w.startMs }; })();
    next = { ...rest, anchor, durationMs: Math.round(end - at) };
  }
  return { ...project, elements: project.elements.map((e) => (e.id === id ? next : e)) };
}
const MIN_MS = 100;
