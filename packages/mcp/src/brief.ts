import { GENERAL_RULES, STEP_RULES } from "@adam-studio/web/server/rules";
import { lookName } from "@adam-studio/web/server/settings";
import { lookBrief } from "@adam-studio/library/src/looks";
import { FRAMEWORKS, resolve } from "@adam-studio/model";
import { scanInspiration } from "@adam-studio/library/src/local";
import { listSeries } from "@adam-studio/render/src/series";
import { keptWords, type FirstPassSummary } from "@adam-studio/web/server/firstpass";
import { load } from "@adam-studio/web/server/store";

const s = (ms: number) => (ms / 1000).toFixed(1);

/** Everything Claude needs to write the creative proposals of a first pass, as one text. */
export function firstPassBrief(dir: string, root: string, summary: FirstPassSummary): string {
  const { project, style } = load(dir);
  const timeline = resolve(project, style);
  const words = keptWords(project);
  // The edit as sentences: one line per sentence, with its first and last word ids and its time in the take.
  const lines: string[] = [];
  let cur: typeof words = [];
  for (const w of words) {
    cur.push(w);
    if (/[.!?…]$/.test(w.text.trim()) || cur.length >= 25) {
      lines.push(`[${cur[0]!.id} .. ${cur[cur.length - 1]!.id}] ${s(cur[0]!.startMs)}s ${cur.map((x) => x.text).join(" ")}`);
      cur = [];
    }
  }
  if (cur.length) lines.push(`[${cur[0]!.id} .. ${cur[cur.length - 1]!.id}] ${s(cur[0]!.startMs)}s ${cur.map((x) => x.text).join(" ")}`);

  const inspiration = scanInspiration().slice(0, 40).map((i) => `- ${i.kind} ${i.rel}${i.notes ? `: ${i.notes.replace(/\s+/g, " ").slice(0, 120)}` : ""}`);
  const series = listSeries().filter((x) => !x.error).map((x) => x.name);
  const pending = project.proposals.filter((p) => p.status === "pending").map((p) => `${p.id} (${p.step}): ${p.variants.map((v) => `${v.key} ${v.label}`).join(" / ")}`);
  // The look chosen on the home page (Inspiration/looks/<name>): its entry file and style guide.
  const lookId = lookName();
  const look = lookId ? lookBrief(lookId) : null;

  return [
    `# First pass: ${project.name}`,
    `Edit: ${s((timeline.durationFrames * 1000) / timeline.fps)} s, ${project.story.length} clips, ${project.canvas.format}, language ${project.transcript.lang}. Workflow step: ${project.workflow?.current ?? "none"}.`,
    "",
    "## Done mechanically (proposals waiting in the panel)",
    `${summary.fillers} filler words, ${summary.stutters} stutters, ${summary.retakes.length} failed takes (${summary.retakes.map((r) => `${r.from}..${r.to}`).join(", ") || "none"}), ${summary.captions} captions.`,
    ...(summary.longPauses.length ? [`Pauses over 3 s (often a failed take worth checking), after: ${summary.longPauses.map((l) => `${l.afterWord} (${(l.ms / 1000).toFixed(1)} s)`).join(", ")}.`] : []),
    `Proposals written: ${summary.proposals.join(", ") || "none"}. Skipped: ${summary.skipped.join("; ") || "none"}.`,
    pending.length ? `Pending: ${pending.join(" | ")}` : "",
    "",
    "## The edit as it stands (sentence, word ids, time in the take)",
    ...lines,
    "",
    "## Frameworks (get_reference frameworks for details)",
    ...FRAMEWORKS.map((f) => `- ${f.id}: ${f.beats.map((b) => b.role).join(", ")}`),
    "",
    "## Inspiration folder (look_at to see one, import_asset to use it)",
    ...(inspiration.length ? inspiration : ["(empty)"]),
    "",
    `Series available: ${series.join(", ") || "none (the creator will design a new series format later)"}.`,
    `Style: colors ${JSON.stringify(style.colors)}, motion speed ${style.motion?.speed ?? 1}.`,
    "",
    "## Your turn: write the creative proposals with propose (one to three variants each, short concrete labels)",
    "1. structure (step structure): setStructure with a framework above, beats from/to on the word ids of the edit.",
    "2. hook (step hook): make the first idea land within 3 s: a title element at 0 ms and/or a tighter opening (setStory); check with still.",
    "3. beats (step beats): at beat changes, text.behindSubject with the beat's key word, or a camera.zoom punch-in.",
    "4. visuals (step visuals): where the speech names something showable, hud.panel / hud.stat / image / lottie, from the Inspiration folder first (search_assets, import_asset).",
    "5. sound (step sound): sfx on reveals and key cuts (search_assets kind audio).",
    "6. look (step look): setStyle grade variants (warmth, contrast, saturation, vignette).",
    "Lean slower on animations (the creator's taste), keep effects few and meaningful, anchor everything on words. Use ids auto.<step>.",
    "Then look at a still or two of your boldest variant, and tell the creator to review everything in the panel (Review, then Choose).",
    "",
    "## Editing rules (every proposal follows them)",
    GENERAL_RULES,
    ...Object.values(STEP_RULES).flatMap((r) => ["", r]),
    ...(look ? ["", "## The video's look (it wins over generic defaults; say plainly what the renderer cannot do yet)", look] : []),
  ].filter((l) => l !== undefined).join("\n");
}
