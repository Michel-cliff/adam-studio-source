import { exportSchemas, mergeStyle, resolve, type Project } from "@adam-studio/model";
import { searchLocal } from "@adam-studio/library/src/local";
import { readScript } from "./script";
import { lintLines, load } from "./store";

/** Element kinds each step works with: their schemas travel with the ask, and the step sees its elements. */
const STEP_KINDS: Record<string, string[]> = {
  hook: ["title", "image", "text.behindSubject", "camera.zoom"],
  beats: ["camera.zoom", "text.behindSubject", "camera.window"],
  visuals: ["image", "hud.panel", "hud.stat", "lottie", "camera.window"],
  sound: ["sfx"],
};
const HOOK_MS = 6000;
const TRANSCRIPT_CHARS = 14000;
const json = (v: unknown) => JSON.stringify(v);
let schemaCache: ReturnType<typeof exportSchemas> | undefined;
const schemasOnce = () => schemaCache ??= exportSchemas();

function patchSchema(): unknown {
  const project = schemasOnce()["project.schema.json"] as { properties: { proposals: { items: { properties: { variants: { items: { properties: { patch: unknown } } } } } } } };
  return project.properties.proposals.items.properties.variants.items.properties.patch;
}

/** One line per word of the takes the story uses ("c01.w12 1.2 bonjour"), capped so a long video stays affordable. */
function transcript(project: Project): string {
  const used = new Set(project.story.map((c) => c.asset));
  const lines: string[] = [];
  for (const [asset, words] of Object.entries(project.transcript.words)) {
    if (used.size && !used.has(asset)) continue;
    lines.push(`# ${asset} (seconds of the take)`);
    for (const w of words) lines.push(`${w.id} ${(w.startMs / 1000).toFixed(1)} ${w.text}`);
  }
  const text = lines.join("\n");
  return text.length > TRANSCRIPT_CHARS ? `${text.slice(0, TRANSCRIPT_CHARS)}\n… (cut here: get_transcript with a range for the rest)` : text;
}

/** The creator's don'ts folder as rules: each file by name, with its notes. */
function donts(): string {
  let items: ReturnType<typeof searchLocal> = [];
  try { items = searchLocal("", undefined, undefined, "interdits"); } catch { /* no Inspiration folder */ }
  if (!items.length) return "none";
  return items.slice(0, 20).map((i) => `- ${i.title} (${i.kind}, ${i.path})${i.notes ? `: ${i.notes.slice(0, 200)}` : ""}`).join("\n");
}

/**
 * What Claude needs to work on one step, sent with the ask so it starts working at once instead of exploring:
 * the project without the transcript words or past patches, the step's elements, the transcript in one line per
 * word, the patch shape and the step's element schemas, and the creator's past choices.
 */
export function stepContext(dir: string, step: string): string {
  const { project, style } = load(dir);
  const timeline = resolve(project, style);
  const s = mergeStyle(style, project.styleOverrides);
  const kinds = STEP_KINDS[step] ?? [];
  const startMs = new Map(timeline.elements.map((e) => [e.id, Math.round((e.fromFrame * 1000) / timeline.fps)]));
  const elements = project.elements.filter((e) => step === "hook"
    ? (startMs.get(e.id) ?? Infinity) < HOOK_MS
    : kinds.includes(e.kind));
  const decided = project.proposals.filter((p) => p.status !== "pending" || p.history.length).slice(-6).map((p) => {
    const key = typeof p.status === "object" ? p.status.accepted : null;
    const v = key ? p.variants.find((x) => x.key === key) : null;
    const note = p.history.map((h) => h.note).filter(Boolean).at(-1);
    const what = v ? `chose ${v.key} "${v.label}"` : p.status === "rejected" ? "rejected all" : "asked for more";
    return `${p.step}: ${what}${note ? `, note "${note}"` : ""}`;
  });
  const pending = project.proposals.filter((p) => p.status === "pending").map((p) => `${p.id} (${p.step}, ${p.variants.length} variants)`);
  const schemas = schemasOnce() as Record<string, unknown>;
  const script = readScript(dir).text;
  const parts = [
    "## Project (transcript words and past patches left out)",
    json({
      name: project.name, canvas: project.canvas, durationMs: Math.round((timeline.durationFrames * 1000) / timeline.fps),
      lint: lintLines(dir, project, timeline),
      style: { fonts: s.fonts, colors: s.colors, grade: s.grade, motion: s.motion, fx: s.fx, caption: s.caption },
      assets: project.assets.map((a) => ({ id: a.id, kind: a.kind })),
      story: project.story, structure: project.structure,
      captions: { count: project.captions.length, first: project.captions.slice(0, 3) },
    }),
    `## Elements of this step (${step === "hook" ? `starting before ${HOOK_MS / 1000} s` : kinds.join(", ") || "none"}; edit by id)`,
    json(elements.map((e) => ({ ...e, startMs: startMs.get(e.id) }))),
    ...(script ? ["## The creator's script", script] : []),
    "## Transcript",
    transcript(project),
    "## Patch shape (variant patch, apply_patch)",
    json(patchSchema()),
    ...kinds.flatMap((k) => [`## Props of ${k}`, json(schemas[`kinds/${k}.schema.json`])]),
    "## Don'ts (references/interdits: what the creator never wants; rules, never material)",
    donts(),
    "## The creator's past choices",
    decided.length ? decided.join("\n") : "none yet",
    ...(pending.length ? ["## Pending proposals", pending.join("\n")] : []),
  ];
  return parts.join("\n");
}
