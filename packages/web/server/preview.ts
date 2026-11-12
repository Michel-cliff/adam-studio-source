import { deepMerge, repairCuts, resolve, withVariant, withoutVariant, type Plain, type Project } from "@adam-studio/model";
import { planMedia } from "@adam-studio/render/src/media";
import type { MediaFiles } from "@adam-studio/render/src/props";
import { applyAccent } from "@adam-studio/render/src/lib/accent";
import { readDA, videoColor, withDA, type CreatorDA, type DaStep } from "@adam-studio/render/src/lib/da";
import { applyLegibility } from "@adam-studio/render/src/lib/legibility";
import { load, ToolError } from "./store";

const plans = new Map<string, Map<string, string>>(); // project dir -> public path -> file on disk

function applied(project: Project, apply: { proposal: string; variant: "A" | "B" | "C" }): Project {
  // A decided proposal shows its other variants in place of the chosen one, a pending one on top of the edit.
  try { return withVariant(project, apply.proposal, apply.variant); } catch (e) { throw new ToolError((e as Error).message); }
}

/** What the live preview needs: the timeline, and media and fonts as URLs served by the panel. */
/** An art direction step being tried in the guided path: the creator's art direction with this one choice. */
export type DaTry = { daDir: string; step?: DaStep; value?: string };

export function previewData(dir: string, name: string, apply?: { proposal: string; variant: "A" | "B" | "C" }, without?: string, daTry?: DaTry) {
  const raw = load(dir);
  // Without a choice: the edit as it was before a decided proposal, the base its variants are compared with.
  const chosen = without ? { ...raw, project: withoutVariant(raw.project, without) } : raw;
  // As the render does: no cut inside a word.
  let project0 = repairCuts(chosen.project).project;
  if (daTry) {
    const da = { ...readDA(daTry.daDir), ...(daTry.step && daTry.step !== "donts" ? { [daTry.step]: daTry.value } : {}) } as CreatorDA;
    project0 = withDA(project0, da);
    // One colour per video when the creator rotates: the same one the render gives it.
    if (da.rotate && !da.accent) {
      const c = videoColor(daTry.daDir, project0.name);
      project0 = { ...project0, styleOverrides: deepMerge({ colors: { highlight: c, accent: c } }, project0.styleOverrides as Plain) as typeof project0.styleOverrides };
    }
  }
  const loaded = { ...chosen, project: project0 };
  const style = loaded.style;
  const project = apply ? applied(loaded.project, apply) : loaded.project;
  let timeline;
  try { timeline = resolve(loaded.project, style, apply ? { apply } : {}); } catch (e) { throw new ToolError((e as Error).message); }
  // The captions' legibility as the last render worked it out (cache only: a preview never waits for the analysis).
  timeline = applyLegibility(dir, applyAccent(dir, timeline, loaded.project, null, false), null, false);
  let plan;
  let note: string | undefined;
  try { plan = planMedia(dir, project, timeline, { preview: true }); } catch (e) {
    const msg = (e as Error).message;
    // Only cut-outs missing: the preview shows what goes behind the creator in front of them instead of failing.
    // The export stays strict and asks for the matting analysis.
    const lines = msg.split("\n").filter((l) => l.startsWith("- "));
    if (!lines.length || !lines.every((l) => l.includes("subject.webm"))) throw new ToolError(`${msg}\nRun Analyze first.`);
    timeline = {
      ...timeline,
      elements: timeline.elements.map((el) => (el.layer === "behind-subject" ? { ...el, layer: "front" as const } : el)),
      // A slide of the creator over the next shot needs the cut-out too: a plain cut meanwhile.
      clips: timeline.clips.map((c) => (c.transitionOut.kind === "subjectSlide" ? { ...c, transitionOut: { kind: "cut" as const } } : c)),
    };
    try { plan = planMedia(dir, project, timeline, { preview: true }); } catch (e2) { throw new ToolError(`${(e2 as Error).message}\nRun Analyze first.`); }
    note = "Shown in front: the cut-out of you is not made yet for these takes (run Analyze), so it cannot go behind you.";
  }
  const known = plans.get(dir) ?? new Map<string, string>();
  for (const f of plan.files) known.set(f.to, f.from);
  plans.set(dir, known);
  const url = (to: string) => `/api/projects/${encodeURIComponent(name)}/media/${to.split("/").map(encodeURIComponent).join("/")}`;
  const media: Record<string, MediaFiles> = {};
  for (const [id, m] of Object.entries(plan.media)) {
    media[id] = { ...m };
    for (const k of ["video", "subject", "plate", "file"] as const) if (m[k]) media[id]![k] = url(m[k]!);
  }
  return { timeline, media, fonts: { caption: url(plan.fonts.caption), title: url(plan.fonts.title), ...(plan.fonts.accent ? { accent: url(plan.fonts.accent) } : {}) }, ...(note ? { note } : {}) };
}

/** The file behind a preview media path (planned by the last previewData call for this project). */
export function mediaFile(dir: string, name: string, to: string): string | null {
  if (!plans.get(dir)?.has(to)) { try { previewData(dir, name); } catch { return null; } }
  return plans.get(dir)?.get(to) ?? null;
}
