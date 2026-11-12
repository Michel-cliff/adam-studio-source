import type { Project } from "./schema/project";
import type { DaChecks } from "./schema/style";
import type { Timeline } from "./schema/timeline";
import { getFramework } from "./frameworks";
import { layoutStory, wordOutput } from "./layout";
import { normalizeWord } from "./text";
import { indexWords } from "./words";

export interface LintWarning {
  rule: string;
  severity: "error" | "warning";
  message: string;
  ids: string[];
}

export interface LintOptions {
  /** Project folder, used to locate relative asset paths and the analysis cache. */
  projectDir?: string;
  /** Injected file check (the model package never touches the file system itself). */
  fileExists?: (path: string) => boolean;
}

const TEXT_KINDS = new Set(["card", "text.stack", "title", "text.behindSubject"]);

function keptWords(project: Project) {
  const { clips } = layoutStory(project);
  const out: { id: string; text: string; startMs: number; endMs: number }[] = [];
  for (const w of indexWords(project).values()) {
    const o = wordOutput(clips, w);
    if (o) out.push({ id: w.id, text: w.text, ...o });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Kinds that dress the frame when they come in: a change the eye reads, like a cut. */
const DRESS_KINDS = new Set(["image", "title", "card", "text.stack", "text.behindSubject", "lottie", "hud.panel", "hud.stat", "endcard.desktop"]);
const ANIMATED_INTROS = new Set(["glitch"]);

/** Longest stretch of the edit between two of the given frames, with its bounds. */
function longestGap(events: number[], end: number): { from: number; to: number } {
  const marks = [...new Set([0, ...events.filter((f) => f > 0 && f < end), end])].sort((a, b) => a - b);
  let best = { from: 0, to: 0 };
  for (let i = 1; i < marks.length; i++) if (marks[i]! - marks[i - 1]! > best.to - best.from) best = { from: marks[i - 1]!, to: marks[i]! };
  return best;
}

/** Whether a value (an element's props, deep) names this colour, by hex or by the style colour it resolves to. */
function namesColor(value: unknown, hex: string, named: Set<string>): boolean {
  if (typeof value === "string") return value.toLowerCase() === hex || named.has(value);
  if (Array.isArray(value)) return value.some((v) => namesColor(v, hex, named));
  if (value && typeof value === "object") return Object.values(value).some((v) => namesColor(v, hex, named));
  return false;
}

/** The art direction's checks on an edit: shot length, changes of scale, 4:3 windows, rare colours, caption length, cuts, music. */
export function daChecks(timeline: Timeline, da: DaChecks): { rule: string; message: string; ids: string[] }[] {
  const out: { rule: string; message: string; ids: string[] }[] = [];
  const s = (f: number) => (f / timeline.fps).toFixed(1);
  const end = timeline.durationFrames;
  const cameras = timeline.elements.filter((e) => e.kind === "camera.zoom" || e.kind === "camera.window");
  const cameraMarks = cameras.flatMap((e) => [e.fromFrame, e.fromFrame + e.durationFrames]);
  const cuts = timeline.clips.slice(1).map((c) => c.fromFrame);
  // A cut changes the scale only when the next shot is framed or zoomed otherwise.
  const scaleCuts = timeline.clips.slice(1).filter((c, i) => {
    const prev = timeline.clips[i]!;
    return prev.zoom.base !== c.zoom.base || prev.framing.mode !== c.framing.mode || prev.asset !== c.asset;
  }).map((c) => c.fromFrame);

  if (da.maxShotMs !== undefined) {
    const dress = timeline.elements.filter((e) => e.layer === "front" && DRESS_KINDS.has(e.kind)).map((e) => e.fromFrame);
    const gap = longestGap([...cuts, ...cameraMarks, ...dress], end);
    if (((gap.to - gap.from) * 1000) / timeline.fps > da.maxShotMs) {
      out.push({ rule: "da.shot", message: `${s(gap.to - gap.from)} s without a change of scale or dress (${s(gap.from)} s to ${s(gap.to)} s, limit ${da.maxShotMs / 1000} s)`, ids: [] });
    }
  }
  if (da.maxScaleGapMs !== undefined) {
    const gap = longestGap([...scaleCuts, ...cameraMarks], end);
    if (((gap.to - gap.from) * 1000) / timeline.fps > da.maxScaleGapMs) {
      out.push({ rule: "da.scale", message: `${s(gap.to - gap.from)} s without a change of scale (${s(gap.from)} s to ${s(gap.to)} s, limit ${da.maxScaleGapMs / 1000} s)`, ids: [] });
    }
  }
  if (da.windows) {
    const windows = timeline.elements.filter((e) => e.kind === "camera.window");
    const { min, max } = da.windows;
    if (windows.length < min) out.push({ rule: "da.windows", message: `${windows.length} 4:3 window(s), the art direction asks for at least ${min}`, ids: windows.map((w) => w.id) });
    if (max !== undefined && windows.length > max) out.push({ rule: "da.windows", message: `${windows.length} 4:3 windows, the art direction allows ${max} at most`, ids: windows.map((w) => w.id) });
  }
  for (const rare of da.rareColors ?? []) {
    const hex = rare.color.toLowerCase();
    const colors = timeline.style.colors as Record<string, string>;
    const named = new Set(Object.entries(colors).filter(([, v]) => v.toLowerCase() === hex).map(([k]) => k));
    if (named.has("text")) { out.push({ rule: "da.rareColor", message: `${rare.color} is the text colour: it cannot stay rare`, ids: [] }); continue; }
    const users = timeline.elements.filter((e) => namesColor(e.props, hex, named)).map((e) => e.id);
    if (named.has("highlight")) users.push(...timeline.captions.filter((c) => c.highlightRanges.length > 0).map((c) => c.id));
    if (users.length > rare.max) out.push({ rule: "da.rareColor", message: `${rare.color} is used ${users.length} times (at most ${rare.max})`, ids: users });
  }
  if (da.maxCaptionWords !== undefined) {
    for (const c of timeline.captions) {
      const n = c.text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      if (n > da.maxCaptionWords) out.push({ rule: "da.captionWords", message: `Caption "${c.text.replace(/\s+/g, " ")}" has ${n} words (at most ${da.maxCaptionWords})`, ids: [c.id] });
    }
  }
  if (da.cutsOnly) {
    for (const c of timeline.clips) {
      if (c.transitionOut.kind !== "cut") out.push({ rule: "da.cutsOnly", message: `Clip "${c.id}" ends on a ${c.transitionOut.kind} transition: dry cuts only`, ids: [c.id] });
    }
    for (const e of timeline.elements) {
      const p = e.props as { intro?: unknown; outro?: unknown };
      if (ANIMATED_INTROS.has(String(p.intro)) || ANIMATED_INTROS.has(String(p.outro))) out.push({ rule: "da.cutsOnly", message: `"${e.id}" comes in or goes out with a glitch: dry cuts only`, ids: [e.id] });
    }
  }
  if (da.musicFromMs !== undefined) {
    const takes = new Set(timeline.clips.map((c) => c.asset));
    for (const a of timeline.audio) {
      const atMs = Math.round((a.fromFrame * 1000) / timeline.fps);
      if (!takes.has(a.asset) && a.durationFrames >= 8 * timeline.fps && atMs < da.musicFromMs) {
        out.push({ rule: "da.music", message: `Music "${a.id}" starts at ${atMs} ms, before ${da.musicFromMs} ms: let the hook open first`, ids: [a.id] });
      }
    }
  }
  if (da.noShake && timeline.style.motion?.stable === false) out.push({ rule: "da.noShake", message: "motion.stable is off: text and inserts may shake", ids: [] });
  return out;
}

export function lint(project: Project, timeline: Timeline, options: LintOptions = {}): LintWarning[] {
  const out: LintWarning[] = [];
  const warn = (rule: string, message: string, ids: string[] = [], severity: LintWarning["severity"] = "warning") =>
    out.push({ rule, severity, message, ids });
  const frameMs = (f: number) => Math.round((f * 1000) / timeline.fps);
  const rules = timeline.style.lint[timeline.format];
  const kept = keptWords(project);
  const { totalMs } = layoutStory(project);

  // Clips cut past the end of their take (the render would freeze or go black there)
  for (const c of project.story) {
    const dur = project.assets.find((a) => a.id === c.asset)?.meta.durationMs;
    if (dur !== undefined && c.outMs > dur + 50) warn("story.pastEnd", `clip "${c.id}" ends at ${c.outMs} ms, after the end of take "${c.asset}" (${dur} ms)`, [c.id], "error");
  }

  // The first 3 seconds
  const textStarts = [
    ...timeline.elements.filter((e) => TEXT_KINDS.has(e.kind)).map((e) => e.fromFrame),
    ...timeline.captions.map((c) => c.fromFrame),
  ];
  if (textStarts.length === 0 || frameMs(Math.min(...textStarts)) > 3000) {
    warn("hook.first3s", "No text hook appears in the first 3 seconds");
  }
  const firstWord = kept[0];
  if (firstWord && firstWord.startMs > 500) {
    warn("hook.first3s", `Speech starts at ${firstWord.startMs} ms (more than 500 ms)`, [firstWord.id]);
  }

  // Edit ruthlessly
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1]!;
    const b = kept[i]!;
    const gap = b.startMs - a.endMs;
    if (gap > rules.maxPauseMs) warn("pace.pauses", `${gap} ms pause between "${a.text}" and "${b.text}"`, [a.id, b.id]);
  }
  const fillers = new Set((rules.fillers ?? timeline.style.fillers?.[project.transcript.lang] ?? []).map(normalizeWord));
  for (let i = 0; i < kept.length; i++) {
    const one = normalizeWord(kept[i]!.text);
    if (fillers.has(one)) warn("pace.fillers", `Filler "${kept[i]!.text}" is still in the edit`, [kept[i]!.id]);
    const next = kept[i + 1];
    if (next && fillers.has(`${one} ${normalizeWord(next.text)}`)) {
      warn("pace.fillers", `Filler "${kept[i]!.text} ${next.text}" is still in the edit`, [kept[i]!.id, next.id]);
    }
  }

  // Duration
  if (totalMs < rules.minDurationMs || totalMs > rules.maxDurationMs) {
    warn("duration.range", `Duration ${totalMs} ms is outside ${rules.minDurationMs} to ${rules.maxDurationMs} ms for ${timeline.format}`);
  }

  // Structure
  if (project.structure) {
    const fw = getFramework(project.structure.framework);
    if (!fw) {
      warn("structure.beats", `Unknown framework "${project.structure.framework}"`, [], "error");
    } else {
      const roles = fw.beats.map((b) => b.role);
      const missing = roles.filter((r) => !timeline.beats.some((b) => b.role === r));
      if (missing.length) warn("structure.beats", `Missing beats for ${fw.id}: ${missing.join(", ")}`, missing);
      const ordered = [...timeline.beats].sort((a, b) => a.fromFrame - b.fromFrame);
      const inOrder = ordered.every((b, i) => {
        const prev = ordered[i - 1];
        return !prev || (roles.indexOf(prev.role) <= roles.indexOf(b.role) && prev.toFrame <= b.fromFrame);
      });
      if (!inOrder) warn("structure.beats", `Beats are not in the order of ${fw.id}`);
      for (const beat of timeline.beats) {
        const limit = fw.beats.find((b) => b.role === beat.role)?.maxMs;
        const lasts = frameMs(beat.toFrame - beat.fromFrame);
        if (limit !== undefined && lasts > limit) {
          warn("structure.beats", `Beat ${beat.role} lasts ${lasts} ms (limit ${limit} ms)`, [beat.role]);
        }
      }
    }
  }

  // Orphans
  if (timeline.orphans.length) {
    warn("elements.orphans", `${timeline.orphans.length} item(s) anchored to cut words are hidden`, timeline.orphans);
  }

  // Files
  if (options.fileExists && options.projectDir !== undefined) {
    const exists = options.fileExists;
    const dir = options.projectDir;
    const isAbsolute = (p: string) => /^([A-Za-z]:[\\/]|[\\/])/.test(p);
    const assets = new Map(project.assets.map((a) => [a.id, a]));
    for (const a of project.assets) {
      const path = isAbsolute(a.path) ? a.path : `${dir}/${a.path}`;
      if (!exists(path)) warn("assets.missing", `Asset "${a.id}" not found at ${a.path}`, [a.id], "error");
    }
    const need = (asset: string, file: string, step: string) => {
      if (!exists(`${dir}/cache/${asset}/${file}`)) {
        warn("assets.missing", `Missing ${file} for asset "${asset}": run the ${step} analysis step`, [asset], "error");
      }
    };
    const inStory = [...new Set(project.story.map((c) => c.asset))].filter((id) => assets.get(id)?.kind === "video");
    for (const id of inStory) need(id, "edit.mp4", "variants");
    const slide = new Set<string>();
    project.story.forEach((c, i) => {
      if (c.transitionOut.kind !== "subjectSlide") return;
      slide.add(c.asset);
      const next = project.story[i + 1];
      if (next) slide.add(next.asset);
    });
    const behind = new Set<string>();
    for (const el of timeline.elements.filter((e) => e.layer === "behind-subject")) {
      for (const c of timeline.clips) {
        if (c.fromFrame < el.fromFrame + el.durationFrames && el.fromFrame < c.fromFrame + c.durationFrames) behind.add(c.asset);
      }
    }
    for (const id of new Set([...slide, ...behind])) need(id, "subject.webm", "matting");
    for (const id of slide) need(id, "plate.png", "clean plate");
  }

  // The art direction's own checks
  if (rules.da) for (const w of daChecks(timeline, rules.da)) warn(w.rule, w.message, w.ids);

  // Proposals
  const pending = project.proposals.filter((p) => p.status === "pending");
  if (pending.length) {
    warn("proposals.pending", `${pending.length} proposal(s) still pending`, pending.map((p) => p.id), "error");
  }

  return out;
}
