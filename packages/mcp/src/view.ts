import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolve } from "@adam-studio/model";
import { lintLines, load, ToolError } from "@adam-studio/web/server/store";

const s = (ms: number) => (ms / 1000).toFixed(2);

/** The project as Claude needs it to edit: everything but the transcript words, plus duration and lint. */
export function projectSummary(dir: string): string {
  const { project, style } = load(dir);
  const timeline = resolve(project, style);
  const words = Object.fromEntries(Object.entries(project.transcript.words).map(([a, w]) => [a, `${w.length} words (get_transcript)`]));
  return JSON.stringify({
    dir,
    durationMs: Math.round((timeline.durationFrames * 1000) / timeline.fps),
    lint: lintLines(dir, project, timeline),
    ...project,
    transcript: { lang: project.transcript.lang, words },
    proposals: project.proposals.map(compactProposal),
  });
}

type Proposal = ReturnType<typeof load>["project"]["proposals"][number];

/**
 * A proposal as the AI needs it, read again on every turn: a pending one whole (it may refill it), a decided one as
 * its choice, the other labels and the creator's notes (their taste). Without this, the history's copies of the
 * variants were most of the project: 66 000 of 77 000 characters on a real one.
 */
function compactProposal(p: Proposal) {
  const { history, revert: _, ...rest } = p;
  if (p.status === "pending") return rest;
  const key = p.status === "rejected" ? null : p.status.accepted;
  const notes = history.flatMap((h) => (h.note ? [h.note] : []));
  return {
    id: p.id, step: p.step, ...(p.reason ? { reason: p.reason } : {}),
    status: key ? `accepted ${key}` : "rejected",
    ...(key ? { chosen: p.variants.find((v) => v.key === key)?.label ?? key } : {}),
    others: p.variants.filter((v) => v.key !== key).map((v) => `${v.key} ${v.label}`),
    ...(notes.length ? { notes } : {}),
  };
}

/** One line per word ("c01.w12 1.23-1.50 bonjour") with the pauses between them, optionally for one take and a time range. */
export function transcriptText(dir: string, opts: { asset?: string; fromMs?: number; toMs?: number } = {}): string {
  const { project } = load(dir);
  const assets = opts.asset ? [opts.asset] : Object.keys(project.transcript.words);
  const out: string[] = [];
  for (const a of assets) {
    const words = project.transcript.words[a];
    if (!words) throw new ToolError(`no transcript for "${a}" (takes: ${Object.keys(project.transcript.words).join(", ")})`);
    let pauses: { startMs: number; endMs: number }[] = [];
    try { pauses = JSON.parse(readFileSync(join(dir, "cache", a, "silences.json"), "utf8")).pauses ?? []; } catch { /* not analyzed */ }
    const inRange = (start: number, end: number) => end >= (opts.fromMs ?? 0) && start <= (opts.toMs ?? Infinity);
    out.push(`# ${a} (times in seconds of the take)`);
    const items = [
      ...words.filter((w) => inRange(w.startMs, w.endMs)).map((w) => ({ at: w.startMs, line: `${w.id} ${s(w.startMs)}-${s(w.endMs)} ${w.text}` })),
      ...pauses.filter((p) => inRange(p.startMs, p.endMs)).map((p) => ({ at: p.startMs, line: `  pause ${s(p.startMs)}-${s(p.endMs)}` })),
    ].sort((x, y) => x.at - y.at);
    out.push(...items.map((i) => i.line));
  }
  return out.join("\n");
}

