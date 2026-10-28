import { execFileSync } from "node:child_process";
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readSync, renameSync, rmSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { addConnector, askServers, listConnectors, removeConnector, setEnabled } from "./connectors";
import { listSkills } from "./skills";
import { ActionError, addCommand, buildCommand, checkVideos, newProjectCommand, VIDEO_EXT } from "./actions";
import { serveFile } from "./files";
import { listFolder } from "./fsbrowse";
import { hostAllowed, inside, originAllowed, safeName } from "./guards";
import { BusyError, JobManager } from "./jobs";
import { venvPython, WEB } from "./paths";
import { askCommand, claudeBin } from "./claude";
import { codexAskCommand, codexBin, installed, parseCodexUsage } from "./codex";
import { stepContext } from "./context";
import { libraryRoute } from "./library-routes";
import { aiRunner, type AskAI } from "./ai";
import { learnedFor } from "./stats";
import { Doctor } from "./doctor-routes";
import { keyStatus, PROVIDERS, setKey } from "./keys";
import { claudeDesktopConfig, claudeDesktopStatus, codexConfig, codexStatus, connectClaudeDesktop, connectCodex } from "./desktop";
import { adamServer } from "./claude";
import { statsRoute } from "./stats-routes";
import { draftScript, readScript, saveScript } from "./script";
import { mediaFile, previewData } from "./preview";
import { listProjects, projectView } from "./projects";
import { moveIn } from "./store";
import { applySeriesIn, closeCurrentStep, removeAssetIn, cutWordsIn, decideProposal, firstPassIn, listSeries, loadRaw, patchProject, setValue, ToolError, tightenIn, undo, updateItem } from "./store";
import { listLooks, lookBrief } from "@adam-studio/library/src/looks";
import { CLAUDE_MODELS, claudeModel, codexModel, engine, lookName, projectsRoot, setClaudeModel, setCodexModel, setEngine, setLookName, SETTINGS_FILE, setProjectsRoot } from "./settings";
import { parseUsage, recordUsage, usageSummary } from "./usage";
import { thumbnail } from "./thumb";
import { watchProjects } from "./watch";

/** Two files with the same size and bytes (videos are big: compared in chunks, stopping at the first difference). */
function sameBytes(a: string, b: string): boolean {
  if (statSync(a).size !== statSync(b).size) return false;
    const fa = openSync(a, "r"), fb = openSync(b, "r");
  try {
    const ba = Buffer.alloc(1 << 20), bb = Buffer.alloc(1 << 20);
    for (;;) {
      const na = readSync(fa, ba, 0, ba.length, null), nb = readSync(fb, bb, 0, bb.length, null);
      if (na !== nb || !ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
      if (na === 0) return true;
    }
  } finally { closeSync(fa); closeSync(fb); }
}

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<Record<string, any>> {
  let text = "";
  for await (const chunk of req) { text += chunk; if (text.length > 1_000_000) throw new HttpError(413, "body too large"); }
  try { const v = JSON.parse(text); if (v && typeof v === "object" && !Array.isArray(v)) return v; } catch { /* below */ }
  throw new HttpError(400, "body must be a JSON object");
}

function sse(res: ServerResponse): (data: unknown) => void {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
  res.write(": open\n\n");
  return (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function createApp(opts: { settingsFile?: string; jobs?: JobManager; capcutPython?: () => string | null; dist?: string; home?: string; ai?: AskAI } = {}): Server {
  const home = opts.home ?? homedir();
  const settingsFile = opts.settingsFile ?? SETTINGS_FILE;
  const doctor = new Doctor(dirname(settingsFile));
  const jobs = opts.jobs ?? new JobManager();
  const capcutPython = opts.capcutPython ?? (() => venvPython("capcut", "ADAM_CAPCUT_PYTHON"));
  const dist = opts.dist ?? join(WEB, "dist");
  // The AI for questions outside the edit (statistics): the one the creator picked, with its model.
  const ai = opts.ai ?? aiRunner(() => engine(settingsFile), () => (engine(settingsFile) === "codex" ? codexModel(settingsFile) : claudeModel(settingsFile)), 240_000);
  const clients = new Set<(d: unknown) => void>();
  const notify = (project: string) => { for (const c of clients) c({ type: "change", project }); };
  let unwatch = watchProjects(projectsRoot(settingsFile), notify);

  const projectDir = (raw: string): { name: string; dir: string } => {
    const name = decodeURIComponent(raw);
    if (!safeName(name)) throw new HttpError(404, "no such project");
    return { name, dir: join(projectsRoot(settingsFile), name) };
  };
  const existing = (raw: string) => {
    const p = projectDir(raw);
    if (!existsSync(join(p.dir, "project.json"))) throw new HttpError(404, `no project "${p.name}"`);
    return p;
  };
  const started = (res: ServerResponse, job: unknown) => send(res, 202, { job });

  async function route(req: IncomingMessage, res: ServerResponse, port: number): Promise<void> {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const path = url.pathname;
    const method = req.method ?? "GET";
    let m: RegExpMatchArray | null;

    if (path === "/api/ping") return send(res, 200, { app: "adam-studio" });
    if (path.startsWith("/api/stats")) {
      const handled = await statsRoute({ req, res, url, method, dir: dirname(settingsFile), root: projectsRoot(settingsFile), ai, send: (s, b) => send(res, s, b), body: () => body(req) });
      if (handled) return;
    }
    if (path.startsWith("/api/library/")) {
      const handled = await libraryRoute({ req, res, url, method, port, root: projectsRoot(settingsFile), send: (s, b) => send(res, s, b), body: () => body(req) });
      if (handled) return;
    }
    // The AIs this computer has: Claude Code and Codex CLI, each with its model.
    const settings = () => ({ projectsRoot: projectsRoot(settingsFile), claudeModel: claudeModel(settingsFile), models: CLAUDE_MODELS,
      engine: engine(settingsFile),
      engines: { claude: { installed: installed(claudeBin()), model: claudeModel(settingsFile) }, codex: { installed: installed(codexBin()), model: codexModel(settingsFile) } },
      look: lookName(settingsFile), looks: listLooks() });
    if (path === "/api/settings" && method === "GET") return send(res, 200, settings());
    // The creator's API keys: only whether they are set (last four characters) ever leaves the server.
    // Adam Studio as a connector of the creator's own Claude Desktop (their subscription, Anthropic's app).
    if (path === "/api/connect/claude-desktop" && method === "GET") return send(res, 200, claudeDesktopStatus());
    if (path === "/api/connect/claude-desktop" && method === "POST") {
      try { connectClaudeDesktop(claudeDesktopConfig(), adamServer()); } catch (e) { throw new HttpError(400, (e as Error).message); }
      // Claude Desktop's Code tab is Claude Code, with its own config: add the server there too (user scope), if it has Claude Code.
      try {
        const srv = adamServer();
        execFileSync(claudeBin(), ["mcp", "add", "--scope", "user", "adam-studio", "--", srv.command, ...srv.args], { stdio: "ignore", windowsHide: true, timeout: 30_000 });
      } catch { /* no Claude Code, or already added */ }
      return send(res, 200, claudeDesktopStatus());
    }
    if (path === "/api/connect/codex" && method === "GET") return send(res, 200, codexStatus());
    if (path === "/api/connect/codex" && method === "POST") {
      try { connectCodex(codexConfig(), adamServer()); } catch (e) { throw new HttpError(400, (e as Error).message); }
      return send(res, 200, codexStatus());
    }
    if (path === "/api/doctor" && method === "GET") return send(res, 200, doctor.view());
    if (path === "/api/doctor/refresh" && method === "POST") { doctor.refresh(); return send(res, 202, doctor.view()); }
    if (path === "/api/doctor/fix" && method === "POST") {
      const b = await body(req);
      try { doctor.fix(String(b.id ?? "")); } catch (e) { throw new HttpError(409, (e as Error).message); }
      return send(res, 202, doctor.view());
    }
    if (path === "/api/keys" && method === "GET") return send(res, 200, keyStatus(dirname(settingsFile)));
    if (path === "/api/keys" && method === "PUT") {
      const b = await body(req);
      try { for (const p of PROVIDERS) if (typeof b[p] === "string") setKey(dirname(settingsFile), p, b[p]); }
      catch (e) { throw new HttpError(400, (e as Error).message); }
      return send(res, 200, keyStatus(dirname(settingsFile)));
    }
    if (path === "/api/settings" && method === "PUT") {
      const b = await body(req);
      if ([b.projectsRoot, b.claudeModel, b.look, b.engine, b.codexModel].every((v) => v === undefined)) throw new HttpError(400, "give projectsRoot, claudeModel, engine, codexModel or look");
      if (b.projectsRoot !== undefined && typeof b.projectsRoot !== "string") throw new HttpError(400, "projectsRoot must be text");
      if (b.look !== undefined && b.look !== "" && !listLooks().some((l) => l.name === b.look)) throw new HttpError(400, `no look "${b.look}" in the Inspiration folder's looks/`);
      try {
        if (b.look !== undefined) setLookName(String(b.look), settingsFile);
        if (b.claudeModel !== undefined) setClaudeModel(String(b.claudeModel), settingsFile);
        if (b.engine !== undefined) setEngine(String(b.engine), settingsFile);
        if (b.codexModel !== undefined) setCodexModel(String(b.codexModel), settingsFile);
        if (typeof b.projectsRoot === "string") {
          setProjectsRoot(b.projectsRoot, settingsFile);
          unwatch();
          unwatch = watchProjects(b.projectsRoot, notify);
        }
      } catch (e) { throw new HttpError(400, (e as Error).message); }
      return send(res, 200, settings());
    }
    // What Claude used: today's asks and the subscription windows Claude Code last reported.
    if (path === "/api/usage" && method === "GET") return send(res, 200, usageSummary(dirname(settingsFile)));
    // Skills Claude Code has, and the connectors (MCP servers) Claude may use from the studio.
    const connectorsFile = join(dirname(settingsFile), "connectors.json");
    if (path === "/api/skills" && method === "GET") return send(res, 200, listSkills(home));
    if (path === "/api/connectors" && method === "GET") return send(res, 200, listConnectors(home, connectorsFile));
    if (path === "/api/connectors" && method === "PUT") {
      const b = await body(req);
      if (!Array.isArray(b.enabled)) throw new HttpError(400, "enabled must be a list of names");
      setEnabled(b.enabled.map(String), home, connectorsFile);
      return send(res, 200, listConnectors(home, connectorsFile));
    }
    if (path === "/api/connectors" && method === "POST") {
      const b = await body(req);
      try { addConnector({ name: String(b.name ?? ""), url: b.url ? String(b.url) : undefined }, connectorsFile); }
      catch (e) { throw new HttpError(400, (e as Error).message); }
      return send(res, 200, listConnectors(home, connectorsFile));
    }
    if ((m = path.match(/^\/api\/connectors\/([^/]+)$/)) && method === "DELETE") {
      removeConnector(decodeURIComponent(m[1]!), connectorsFile);
      return send(res, 200, listConnectors(home, connectorsFile));
    }
    if (path === "/api/projects" && method === "GET") return send(res, 200, listProjects(projectsRoot(settingsFile)));
    if (path === "/api/projects" && method === "POST") {
      const b = await body(req);
      const name = typeof b.name === "string" ? b.name : "";
      if (!safeName(name)) throw new HttpError(400, `not a valid project name: "${name}"`);
      const dir = join(projectsRoot(settingsFile), name);
      if (existsSync(join(dir, "project.json"))) throw new HttpError(409, `a project "${name}" already exists: add rushes to it instead`);
      return started(res, jobs.start(name, newProjectCommand(dir, checkVideos(b.videos), String(b.format ?? "9:16"), b.lang || undefined, b.series || undefined)));
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)$/)) && method === "GET") {
      const { name } = existing(m[1]!);
      const view = projectView(projectsRoot(settingsFile), name);
      return send(res, 200, { ...view, jobs: jobs.list(name) });
    }
    // Removing an asset from a video: refused while the edit uses it; the file goes to the project's .trash.
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)$/)) && method === "DELETE") {
      const { name, dir } = existing(m[1]!);
      try { const r = removeAssetIn(dir, decodeURIComponent(m[2]!)); notify(name); return send(res, 200, r); }
      catch (e) {
        const msg = (e as Error).message;
        throw new HttpError(/^no asset/.test(msg) ? 404 : /is used by/.test(msg) ? 409 : 400, msg);
      }
    }
    // Deleting moves the folder to <projects>/.trash/<name> <date>: nothing is lost until the creator empties it.
    if ((m = path.match(/^\/api\/projects\/([^/]+)$/)) && method === "DELETE") {
      const { name, dir } = existing(m[1]!);
      if (jobs.running(name)) throw new HttpError(409, `${name} is busy: stop its job first`);
      const trash = join(projectsRoot(settingsFile), ".trash");
      mkdirSync(trash, { recursive: true });
      const to = join(trash, `${name} ${new Date().toISOString().replace(/[:.]/g, "-")}`);
      renameSync(dir, to);
      notify(name);
      return send(res, 200, { trashed: to });
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/add$/)) && method === "POST") {
      const { name, dir } = existing(m[1]!);
      const b = await body(req);
      return started(res, jobs.start(name, addCommand(dir, checkVideos(b.videos), b.lang || undefined)));
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/jobs$/)) && method === "POST") {
      const { name, dir } = existing(m[1]!);
      const b = await body(req);
      const options = b.options && typeof b.options === "object" ? b.options : {};
      return started(res, jobs.start(name, buildCommand(String(b.action), dir, options, capcutPython())));
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/files\/(.+)$/)) && (method === "GET" || method === "HEAD")) {
      const { dir } = existing(m[1]!);
      const file = inside(dir, m[2]!.split("/").map(decodeURIComponent).join("/"));
      if (!file) throw new HttpError(404, "no such file");
      return serveFile(req, res, file);
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/preview$/)) && method === "GET") {
      const { name, dir } = existing(m[1]!);
      const proposal = url.searchParams.get("proposal");
      const variant = url.searchParams.get("variant");
      if (proposal && variant && !["A", "B", "C"].includes(variant)) throw new HttpError(400, "variant must be A, B or C");
      return send(res, 200, previewData(dir, name, proposal && variant ? { proposal, variant: variant as "A" | "B" | "C" } : undefined));
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/media\/(.+)$/)) && (method === "GET" || method === "HEAD")) {
      const { name, dir } = existing(m[1]!);
      const file = mediaFile(dir, name, m[2]!.split("/").map(decodeURIComponent).join("/"));
      if (!file) throw new HttpError(404, "no such media");
      return serveFile(req, res, file);
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/ask$/)) && method === "POST") {
      const { name, dir } = existing(m[1]!);
      const b = await body(req);
      const step = String(b.step ?? "");
      const ai = engine(settingsFile);
      if (ai === "codex" && !installed(codexBin())) throw new HttpError(400, "Codex is not installed on this computer: install Codex CLI (npm i -g @openai/codex), sign in with codex login, or pick Claude.");
      const record = (job: { output: string }) => {
        const u = ai === "codex" ? parseCodexUsage(job.output) : parseUsage(job.output);
        if (u) { try { recordUsage(dirname(settingsFile), { project: name, step, ...u }); } catch { /* a full disk must not break the job */ } }
      };
      const look = lookName(settingsFile);
      // Only skills Claude Code really has; the connectors the creator turned on.
      const known = new Set(listSkills(home).map((s) => s.name));
      const skills = Array.isArray(b.skills) ? b.skills.map(String).filter((s: string) => known.has(s)) : [];
      const mode = b.mode === "do" ? "do" as const : "propose" as const;
      let context: string | undefined;
      try { context = stepContext(dir, step); } catch { /* an unreadable project: Claude reads it with its tools */ }
      const extras = { ...askServers(home, connectorsFile), skills, mode, context, learned: learnedFor(dirname(settingsFile), step) };
      const brief = look ? lookBrief(look) : null;
      const command = ai === "codex"
        ? codexAskCommand(name, step, String(b.prompt ?? ""), codexModel(settingsFile), brief, extras)
        : askCommand(name, step, String(b.prompt ?? ""), claudeModel(settingsFile), brief, extras);
      return started(res, jobs.start(name, command, record));
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/thumb$/)) && method === "GET") {
      const { dir } = existing(m[1]!);
      const file = thumbnail(dir);
      if (!file) throw new HttpError(404, "no picture yet");
      return serveFile(req, res, file);
    }
    // The video's script: read, edited by the creator, or drafted by the AI from the transcript.
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/script$/)) && (method === "GET" || method === "PUT")) {
      const { dir } = existing(m[1]!);
      if (method === "GET") return send(res, 200, readScript(dir));
      return send(res, 200, saveScript(dir, String((await body(req)).text ?? ""), "you"));
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/script\/draft$/)) && method === "POST") {
      return send(res, 200, await draftScript(existing(m[1]!).dir, ai));
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/raw$/)) && method === "GET") {
      return send(res, 200, loadRaw(existing(m[1]!).dir));
    }
    if ((m = path.match(/^\/api\/projects\/([^/]+)\/edit$/)) && method === "POST") {
      const { dir } = existing(m[1]!);
      const b = await body(req);
      switch (b.op) {
        // A block dragged on the timeline: an element or a sound to a moment, a caption to other words, a clip to another place.
        case "move": return send(res, 200, moveIn(dir, String(b.what), b.what === "caption" ? Number(b.index) : String(b.id), Number(b.to)));
        case "update_item": return send(res, 200, updateItem(dir, b.collection === "story" ? "story" : "elements", String(b.id), b.changes ?? {}));
        case "set_value": return send(res, 200, setValue(dir, String(b.pointer), b.remove ? undefined : b.value));
        case "patch": return send(res, 200, patchProject(dir, b.patch));
        case "cut_words": return send(res, 200, cutWordsIn(dir, Array.isArray(b.words) ? b.words.map(String) : []));
        case "tighten": return send(res, 200, tightenIn(dir, Number(b.minPauseMs ?? 600), Number(b.keepMs ?? 200)));
        case "undo": return send(res, 200, { message: undo(dir) });
        case "first_pass": return send(res, 200, firstPassIn(dir));
        case "decide": {
          const d = String(b.decision);
          if (!["A", "B", "C", "reject", "more"].includes(d)) throw new HttpError(400, "decision must be A, B, C, reject or more");
          return send(res, 200, decideProposal(dir, String(b.proposal), d as "A", b.note ? String(b.note) : undefined));
        }
        case "close_step": return send(res, 200, closeCurrentStep(dir));
        case "apply_series": return send(res, 200, applySeriesIn(dir, String(b.series)));
        default: throw new HttpError(400, `unknown edit "${b.op}"`);
      }
    }
    if ((m = path.match(/^\/api\/jobs\/([^/]+)$/)) && method === "GET") {
      const job = jobs.get(m[1]!);
      if (!job) throw new HttpError(404, "no such job");
      return send(res, 200, job);
    }
    if ((m = path.match(/^\/api\/jobs\/([^/]+)\/stop$/)) && method === "POST") {
      if (!jobs.get(m[1]!)) throw new HttpError(404, "no such job");
      return send(res, 200, { stopped: jobs.stop(m[1]!) });
    }
    if ((m = path.match(/^\/api\/jobs\/([^/]+)\/events$/)) && method === "GET") {
      const job = jobs.get(m[1]!);
      if (!job) throw new HttpError(404, "no such job");
      const push = sse(res);
      push({ type: "output", text: job.output });
      if (job.state !== "running") { push({ type: "end", job }); res.end(); return; }
      const off = jobs.subscribe(job.id, (e) => { push(e); if (e.type === "end") res.end(); });
      req.on("close", off);
      return;
    }
    // A video dropped on New video: the browser gives bytes, not a path, so it is kept in <projects>/.rushes
    // (the same video dropped twice is the same file; another one with that name gets its own).
    if (path === "/api/rushes" && method === "POST") {
      const name = basename(url.searchParams.get("name") ?? "").replace(/[<>:"|?*\u0000-\u001f]/g, "_");
      if (!name || !VIDEO_EXT.test(name)) throw new HttpError(400, `not a video file: ${name || "?"}`);
      const folder = join(projectsRoot(settingsFile), ".rushes");
      mkdirSync(folder, { recursive: true });
      const tmp = join(folder, `.incoming-${Date.now().toString(36)}`);
      try { await pipeline(req, createWriteStream(tmp)); } catch (e) { rmSync(tmp, { force: true }); throw new HttpError(400, `upload failed: ${(e as Error).message}`); }
      const ext = extname(name), stem = basename(name, ext);
      for (let i = 1; ; i++) {
        const target = join(folder, i === 1 ? name : `${stem} (${i})${ext}`);
        if (!existsSync(target)) { renameSync(tmp, target); return send(res, 200, { path: target }); }
        if (sameBytes(tmp, target)) { rmSync(tmp, { force: true }); return send(res, 200, { path: target }); }
      }
    }
    if (path === "/api/series" && method === "GET") return send(res, 200, listSeries());
    if (path === "/api/fs" && method === "GET") {
      try { return send(res, 200, listFolder(url.searchParams.get("path") || undefined)); } catch (e) { throw new HttpError(400, (e as Error).message); }
    }
    if (path === "/api/events" && method === "GET") {
      const push = sse(res);
      clients.add(push);
      req.on("close", () => clients.delete(push));
      return;
    }
    if (path.startsWith("/api/")) throw new HttpError(404, "unknown route");
    if (method !== "GET" && method !== "HEAD") throw new HttpError(404, "unknown route");
    if (!existsSync(join(dist, "index.html"))) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" }).end("The page is not built yet. Run: npm run build -w packages/web");
      return;
    }
    const file = path === "/" ? join(dist, "index.html") : inside(dist, decodeURIComponent(path.slice(1)));
    return serveFile(req, res, file && existsSync(file) ? file : join(dist, "index.html"));
  }

  const server = createServer((req, res) => {
    const port = (server.address() as AddressInfo).port;
    if (!hostAllowed(req.headers.host, port) || !originAllowed(req.method ?? "GET", req.headers.origin, port)) {
      send(res, 403, { error: "refused: the panel only answers itself" });
      return;
    }
    route(req, res, port).catch((e: unknown) => {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof ActionError || e instanceof ToolError) return send(res, 400, { error: e.message });
      if (e instanceof BusyError) return send(res, 409, { error: e.message });
      if (e instanceof URIError) return send(res, 404, { error: "bad path" });
      send(res, 500, { error: (e as Error).message });
    });
  });
  server.on("close", () => unwatch());
  return server;
}
