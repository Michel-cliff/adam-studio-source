import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { exportSchemas, type Decision } from "@adam-studio/model";
import { addCommand, checkVideos, newProjectCommand, textProjectCommand } from "@adam-studio/web/server/actions";
import { safeName } from "@adam-studio/web/server/guards";
import { listProjects } from "@adam-studio/web/server/projects";
import { projectsRoot, SETTINGS_FILE, uiLang } from "@adam-studio/web/server/settings";
import { daFirstPass, readDA } from "@adam-studio/render/src/lib/da";
import { z } from "zod";
import { nameInRoot, runAction, runSetup, stills, tail } from "./run";
import { importAsset, lookAt } from "@adam-studio/library/src/importer";
import { inspirationRoot, searchLocal, type LibraryKind } from "@adam-studio/library/src/local";
import { searchOnline } from "@adam-studio/library/src/online";
import { saveSeries } from "@adam-studio/render/src/series";
import { firstPassBrief } from "./brief";
import { addAssetIn, applySeriesIn, firstPassIn, closeCurrentStep, listSeries, decideProposal, patchProject, projectDir, propose, setValue, ToolError, undo, updateItem } from "@adam-studio/web/server/store";
import { projectSummary, transcriptText } from "./view";

const INSTRUCTIONS = `Adam Studio: video edits described in project.json (story clips cut from takes, elements anchored on words,
captions, style), rendered by Remotion and exported to CapCut. Times are milliseconds; word ids are "<take>.w<n>".
Start with get_project and get_transcript; get_reference gives the schemas (project, style, element kinds, frameworks).
Explicit requests from the creator: edit directly (apply_patch, update_item, set_value), then look with still.
Creative choices: propose one to three variants (A, B, C) with propose; the creator reviews them in the control panel
(npm run ui) or you render them with run review; decide records the choice. Guided steps run in order: cuts, structure,
captions, hook, beats, visuals, sound, look. Every write is validated and backed up: undo puts back the previous version.
Preserve the existing story and captions in unsolicited proposals, including hooks: no cuts, trimming or setStory.
Every variant is checked by propose before saving. If it fails, repair the invalid variant and call propose again before announcing success.
Use stable smooth zooms and blur, no shake, whip, glitch or strobing by default.
Creator taste so far: default effect animations feel a bit fast; lean slower (style motion.speed below 1 slows every effect).
Effects: element kinds hud.panel, hud.stat, lottie, camera.zoom (punch-in), camera.window (4:3 window on a flat colour);
image intro/outro fade, pop, pixel, step, window, glitch; style fx {grain, scanlines, zoomBlur}; transitions flash, whip,
zoom (get_reference kind:<name>, get_reference style).`;

// stdout carries the protocol: library logs go to stderr.
console.log = console.error;

const server = new McpServer({ name: "adam-studio", version: "0.1.0" }, { instructions: INSTRUCTIONS });
const root = () => projectsRoot();
const dirOf = (project: string) => projectDir(project, root());
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const written = (r: { lint: string[]; durationMs: number }) => text(`saved. duration ${r.durationMs} ms\n${r.lint.length ? r.lint.join("\n") : "lint: clean"}`);
const project = z.string().describe("project name in the projects folder, or an absolute path");

function tool<S extends z.ZodRawShape>(name: string, description: string, shape: S, fn: (args: z.infer<z.ZodObject<S>>) => Promise<any> | any) {
  server.registerTool(name, { description, inputSchema: shape }, (async (args: z.infer<z.ZodObject<S>>) => {
    try { return await fn(args); } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: e instanceof ToolError ? e.message : `${(e as Error).message}` }] };
    }
  }) as never);
}

tool("list_projects", "The projects of the projects folder.", {}, () => text(JSON.stringify({ root: root(), projects: listProjects(root()) }, null, 1)));

tool("get_project", "The whole project (without transcript words), its duration and lint.", { project }, ({ project: p }) => text(projectSummary(dirOf(p))));

tool("get_transcript", "Words with ids and times, and the pauses, per take; optionally one take and a range of the take.",
  { project, asset: z.string().optional(), fromMs: z.number().optional(), toMs: z.number().optional() },
  ({ project: p, ...o }) => text(transcriptText(dirOf(p), o)));

tool("get_reference", "JSON schemas and references: project, style, timeline, frameworks, kinds (list) or kind:<name>.",
  { topic: z.string() }, ({ topic }) => {
    const all = exportSchemas();
    if (topic === "kinds") return text(Object.keys(all).filter((k) => k.startsWith("kinds/")).map((k) => k.slice(6, -12)).join("\n"));
    const key = topic.startsWith("kind:") ? `kinds/${topic.slice(5)}.schema.json` : topic === "frameworks" ? "frameworks.json" : `${topic}.schema.json`;
    if (!(key in all)) throw new ToolError(`unknown topic "${topic}": project, style, timeline, frameworks, kinds, kind:<name>`);
    return text(JSON.stringify(all[key]));
  });

tool("apply_patch", "Applies a patch (the same shape as a variant's patch: addElements, addCaptions, setStory, setStructure, setStyle, removeElements).",
  { project, patch: z.record(z.string(), z.unknown()) }, ({ project: p, patch }) => written(patchProject(dirOf(p), patch)));

tool("update_item", "Deep-merges changes into one story clip or element, found by id (arrays and scalars replace).",
  { project, collection: z.enum(["story", "elements"]), id: z.string(), changes: z.record(z.string(), z.unknown()) },
  ({ project: p, collection, id, changes }) => written(updateItem(dirOf(p), collection, id, changes)));

tool("set_value", "Sets any value of project.json by JSON Pointer (e.g. /captions/0/text, /styleOverrides/grade/warmth); remove: true deletes it; /list/- appends.",
  { project, pointer: z.string(), value: z.unknown().optional(), remove: z.boolean().optional() },
  ({ project: p, pointer, value, remove }) => {
    if (!remove && value === undefined) throw new ToolError("give a value, or remove: true");
    return written(setValue(dirOf(p), pointer, remove ? undefined : value));
  });

tool("propose", "Adds a proposal {id, step, anchor?, reason, variants: [{key: A|B|C, label, why, patch}]} (why: what changes, where, what the viewer gets, in the transcript's language), or new variants for one sent back with \"more\". Follow the editing rules in the first-pass brief.",
  { project, proposal: z.record(z.string(), z.unknown()) }, ({ project: p, proposal }) => written(propose(dirOf(p), proposal)));

tool("decide", "Records the creator's decision on a proposal: A, B or C applies that variant; reject; more asks for new variants.",
  { project, proposal: z.string(), decision: z.enum(["A", "B", "C", "reject", "more"]), note: z.string().optional() },
  ({ project: p, proposal, decision, note }) => written(decideProposal(dirOf(p), proposal, decision as Decision, note)));

tool("close_step", "Closes the current guided step when it needs no proposal, and opens the next.", { project },
  ({ project: p }) => written(closeCurrentStep(dirOf(p))));

tool("undo", "Puts back project.json as it was before the last change made through these tools.", { project },
  ({ project: p }) => text(undo(dirOf(p))));

tool("list_series", "The series (shared style, assets and treatments) in ~/AdamStudioSeries.", {}, () => text(JSON.stringify(listSeries(), null, 1)));

tool("apply_series", "Applies a series to a project: its style, assets and treatment elements (start, transition, beat, end); re-applying replaces them.",
  { project, series: z.string() }, ({ project: p, series }) => written(applySeriesIn(dirOf(p), series)));

tool("save_series", "Starts a series from a project: its style, the images and sounds its elements use, and its elements at 0 ms as the start treatment. Edit series.json afterwards for transition, beat and end treatments ({{beat.word}}, {{project.name}} placeholders).",
  { project, series: z.string() }, ({ project: p, series }) => text(`saved in ${saveSeries(dirOf(p), series)}`));

const kind = z.enum(["video", "image", "audio", "font", "lottie"]);

tool("search_assets", "Searches the creator's Inspiration folder first (their own references: videos, images, sounds, fonts, Lottie, notes), then, with online, Pixabay (images, videos) and Freesound (CC0 sounds). category narrows to one reference folder: typo, plans (shots), sous-titres (caption styles), images-textures-palettes, sons (sounds), interdits (don'ts: what the creator never wants, never use them as material).",
  { query: z.string(), kind: kind.optional(), online: z.boolean().optional(), category: z.enum(["typo", "plans", "sous-titres", "images-textures-palettes", "sons", "interdits", "other"]).optional() },
  async ({ query, kind: k, online, category }) => {
    const local = searchLocal(query, k as LibraryKind | undefined, inspirationRoot(), category).slice(0, 30).map(({ path, kind: kk, title, notes, durationMs, rel, category: c }) => ({ path, kind: kk, title, rel, category: c, notes: notes.slice(0, 300), durationMs }));
    const web = online && k ? await searchOnline(query, k as LibraryKind) : { items: [], notes: online ? ["give a kind to search online"] : [] };
    return text(JSON.stringify({ inspiration: inspirationRoot(), local, online: web.items, notes: web.notes }, null, 1));
  });

tool("look_at", "Shows a file or URL as a picture: four frames of a video, an image, the waveform of a sound, a font sample.",
  { source: z.string().describe("absolute path or https URL") }, async ({ source }) => {
    const l = await lookAt(source);
    return { content: [{ type: "text" as const, text: `${l.kind}: ${l.note}` }, ...(l.jpeg ? [{ type: "image" as const, data: l.jpeg, mimeType: "image/jpeg" }] : [])] };
  });

tool("import_asset", "Copies a file (path) or downloads one (url) into the project's assets folder, records credits, and adds it as an asset. cutout: an image comes in as a paper cut-out (background removed, transparent PNG); show it with an image element whose props.paper is true. Fonts are copied only (use them in the style).",
  { project, source: z.strictObject({ path: z.string().optional(), url: z.string().optional(), kind: kind.optional(), title: z.string().optional(), license: z.string().optional(), creator: z.string().optional(), page: z.string().optional(), cutout: z.boolean().optional() }), id: z.string().optional() },
  async ({ project: p, source, id }) => {
    const dir = dirOf(p);
    const a = await importAsset(dir, source, id);
    if (a.kind === "font") return text(`font copied to ${a.path}`);
    const r = addAssetIn(dir, { id: a.id, kind: a.kind, path: a.path });
    return text(`asset "${a.id}" (${a.kind}) added: ${a.path}\n${r.lint.join("\n") || "lint: clean"}`);
  });

tool("first_pass", "Automatic first pass of a project: writes the mechanical proposals (cuts: fillers, failed takes, dead air; captions) and returns a brief (the edit as sentences with word ids, frameworks, Inspiration, style) for you to write the creative proposals (structure, hook, beats, visuals, sound, look) with propose.",
  { project }, ({ project: p }) => {
    const dir = dirOf(p);
    const r = firstPassIn(dir, uiLang(), daFirstPass(readDA(dirname(SETTINGS_FILE))));
    return text(`${firstPassBrief(dir, root(), r.summary)}\n\nlint now: ${r.lint.join(" | ") || "clean"}`);
  });

tool("still", "Renders frames of the edit (or of a variant, \"p1:B\") and shows them.",
  { project, atMs: z.array(z.number()).min(1).max(6), variant: z.string().optional() },
  async ({ project: p, atMs, variant }) => {
    const { job, images } = await stills(dirOf(p), atMs, variant);
    if (job.state !== "done") return { isError: true, content: [{ type: "text" as const, text: tail(job) }] };
    return { content: images.flatMap((im, i) => [
      { type: "text" as const, text: `${atMs[i]} ms: ${im.file}` },
      { type: "image" as const, data: im.data, mimeType: "image/jpeg" },
    ]) };
  });

tool("run", "Runs analyze, render, review or capcut (export) and waits for it; shown live in the control panel when it is open. Options: analyze {assets, steps, force}; render {force}; review {step}; capcut {name, force, replace}; cards (a text-only video: its cards laid out again from its script.json, which replaces cards edited by hand).",
  { project, action: z.enum(["analyze", "render", "review", "capcut", "cards"]), options: z.record(z.string(), z.unknown()).optional() },
  async ({ project: p, action, options }) => {
    if (action === "capcut" && options?.replace) throw new ToolError("replace overwrites edits the creator made in CapCut: ask them, and let them press Replace in the panel");
    const job = await runAction(dirOf(p), root(), action, options ?? {});
    return { isError: job.state !== "done", content: [{ type: "text" as const, text: tail(job) }] };
  });

tool("create_project", "Creates a project in the projects folder from rushes (absolute paths) and runs the import analysis. video: face camera (default), tutorial (keeps 0.40 s pauses, no push) or motion design. A text-only video (video: text) needs no rushes: give its script, one line per card (a number, a « quote », A vs B, a list with - , one word on its own; the words are kept as written).",
  { name: z.string(), videos: z.array(z.string()).default([]), format: z.enum(["9:16", "16:9"]).default("9:16"), lang: z.string().optional(),
    video: z.enum(["facecam", "motion", "tutorial", "text"]).default("facecam"), script: z.string().optional() },
  async ({ name, videos, format, lang, video, script }) => {
    if (!safeName(name)) throw new ToolError(`not a valid project name: "${name}"`);
    const dir = join(root(), name);
    if (video === "text") {
      const job = await runSetup("new", name, textProjectCommand(dir, script ?? ""), { name, video });
      return { isError: job.state !== "done", content: [{ type: "text" as const, text: tail(job) }] };
    }
    const job = await runSetup("new", name, newProjectCommand(dir, checkVideos(videos), format, lang, undefined, video), { name, videos, format, lang, video });
    return { isError: job.state !== "done", content: [{ type: "text" as const, text: tail(job) }] };
  });

tool("add_rushes", "Adds rushes (absolute paths) to a project and analyzes them.",
  { project, videos: z.array(z.string()).min(1), lang: z.string().optional() },
  async ({ project: p, videos, lang }) => {
    const dir = dirOf(p);
    const job = await runSetup("add", nameInRoot(dir, root()), addCommand(dir, checkVideos(videos), lang), { videos, lang });
    return { isError: job.state !== "done", content: [{ type: "text" as const, text: tail(job) }] };
  });

await server.connect(new StdioServerTransport());
