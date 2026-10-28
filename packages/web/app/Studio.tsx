import { Player, type PlayerRef } from "@remotion/player";
import { Edit } from "@adam-studio/render/edit";
import type { RenderProps } from "@adam-studio/render/src/props";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobEvent, JobView, ProjectView, ProposalView } from "../server/types";
import { api, enc, fileUrl, go, ms } from "./api";
import { AssetsPanel, dropInto, mention } from "./Assets";
import { ClaudeBar, ENGINE_EVENT } from "./ClaudeBar";
import { aiOf, readEvent } from "./feed";
import { ConnectorsPanel, SkillsPanel } from "./Connectors";
import { t, useLang } from "./i18n";
import { JobLog } from "./JobLog";
import { askStep, GROUPS, groupOf, groupState, openGroup, type GroupId } from "./steps";
import { keyFrame } from "./frames";
import { PRESETS, ScriptPanel, SoundTracks } from "./StepViews";
import { VariantShot } from "./VariantShot";
import { Halftone } from "./halftone";

const ICONS: Record<GroupId, string> = {
  story: "M4 6h16M4 12h10M4 18h13", captions: "M4 7h16v10H4zM8 12h3M13 12h3", hook: "M12 3v8a4 4 0 1 1-4-4",
  visuals: "M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4", sound: "M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2", wrap: "M5 12l5 5 9-10",
};
const NAMES: Record<GroupId, string> = { story: "Story", captions: "Captions", hook: "Hook", visuals: "Visuals", sound: "Sound", wrap: "Wrap" };

const HELP: Record<GroupId, string> = {
  story: "Your AI cut the silences and failed takes. Pick the cut you like (A tight, B light), then paste your script or let your AI write it from what you say. Press SCRIPT READY, NEXT to move on. Story shapes are optional.",
  captions: "How your words show on screen. Press PROPOSE 3 CAPTION STYLES, pick one with CHOOSE, or skip the step to keep plain captions.",
  hook: "The first three seconds decide if people stay. Ask for three hooks, pick one with CHOOSE. You can skip it.",
  visuals: "Images, icons, effects and the color treatment, anchored on what you say. Ask for three directions, pick one, or skip.",
  sound: "Music bed and sound effects. Ask for three soundtracks, listen to them in place, pick one, or skip.",
  wrap: "Every step is done: pick a format and export the MP4, or send the edit to CapCut to finish by hand.",
};
const AUTO_HELP = "Auto mode runs every step for you and picks the first variant, then renders the video. Open any step afterwards and pick another variant: the video is rendered again.";

function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest(".help")) setOpen(false); };
    addEventListener("click", close); addEventListener("keydown", close);
    return () => { removeEventListener("click", close); removeEventListener("keydown", close); };
  }, [open]);
  return (
    <span className="help">
      <button type="button" className="q" aria-expanded={open} aria-label="Help on this step" onClick={() => setOpen(!open)}>?</button>
      <span className={`tip${open ? " open" : ""}`} role="tooltip">{text}</span>
    </span>
  );
}

const ACTIVITY: Record<string, string> = {
  get_project: "Reading the project", get_transcript: "Reading what you say", get_reference: "Checking the formats",
  search_assets: "Searching your Inspiration and free libraries", look_at: "Looking at a reference", import_asset: "Importing a file",
  propose: "Writing the proposal", still: "Rendering a frame to check it", list_series: "Looking at the series",
  apply_patch: "Changing the edit", update_item: "Changing the edit", set_value: "Changing the edit",
};

/** Claude's job, as a feed: what it does (from the stream-json tool calls) and what it says at the end. */
function ClaudeFeed({ job, onEnd }: { job: JobView; onEnd: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [say, setSay] = useState("");
  const [state, setState] = useState(job.state);
  useEffect(() => {
    let buf = "";
    const seen: string[] = [];
    const take = (text: string) => {
      buf += text;
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        let e: any;
        try { e = JSON.parse(line); } catch { continue; }
        const r = readEvent(e);
        for (const tool of r.tools ?? []) {
          const label = ACTIVITY[tool];
          if (label && seen[seen.length - 1] !== label) { seen.push(label); setLines([...seen]); }
        }
        if (r.say) setSay(r.say);
      }
    };
    const ev = new EventSource(`/api/jobs/${job.id}/events`);
    ev.onmessage = (m) => {
      const e = JSON.parse(m.data) as JobEvent;
      if (e.type === "output") take(e.text);
      else { setState(e.job.state); ev.close(); onEnd(); }
    };
    return () => ev.close();
  }, [job.id]);
  return (
    <div className="feed" aria-live="polite">
      {state === "running" && <Halftone fx="wave" step={5} className="feedwave" />}<span className="who">{state === "running" ? <i className="pulse" /> : null}YOUR AI{state === "running" ? " · WORKING" : state === "done" ? "" : ` · ${state.toUpperCase()}`}</span>
      <span className="what">{say || lines[lines.length - 1] || "Getting ready"}</span>
      {state === "running" && <button type="button" className="link" onClick={() => api(`/jobs/${job.id}/stop`, { method: "POST" })}>Stop</button>}
    </div>
  );
}

/** The edit, playable: as it stands, or with a variant applied (then it opens on what the variant adds). */
function Screen({ name, view, proposal, variant, className = "" }: { name: string; view: ProjectView; proposal: string | null; variant: string | null; className?: string }) {
  const [props, setProps] = useState<RenderProps | null>(null);
  const [base, setBase] = useState<RenderProps | null>(null);
  const [error, setError] = useState("");
  const player = useRef<PlayerRef>(null);
  const stamp = JSON.stringify(view.proposals.map((p) => [p.id, p.status, p.variants.length])) + (view?.durationMs ?? "");
  useEffect(() => {
    let alive = true;
    // Another variant: the player waits for its own edit, so it mounts on that variant's frame.
    setProps(null); setBase(null);
    const q = proposal && variant ? `?proposal=${enc(proposal)}&variant=${variant}` : "";
    Promise.all([api<RenderProps>(`/projects/${enc(name)}/preview${q}`), q ? api<RenderProps>(`/projects/${enc(name)}/preview`) : Promise.resolve(null)])
      .then(([p, b]) => { if (alive) { setProps(p); setBase(b); setError(""); } })
      .catch((e) => { if (alive) { setProps(null); setError(e.message); } });
    return () => { alive = false; };
  }, [name, proposal, variant, stamp]);
  const tl = props?.timeline;
  return (
    <div className={`screen ${className}`} style={tl ? { aspectRatio: `${tl.width} / ${tl.height}` } : undefined}>
      {tl && props ? (
        // A variant opens on the same frame as its card (keyFrame), set at mount so it cannot be lost while the player loads.
        <Player key={`${proposal}:${variant}:${stamp}`} ref={player} component={Edit} inputProps={props} durationInFrames={Math.max(1, tl.durationFrames)} fps={tl.fps}
          initialFrame={proposal && variant && base ? keyFrame(tl, base.timeline) : 0} acknowledgeRemotionLicense
          compositionWidth={tl.width} compositionHeight={tl.height} controls style={{ width: "100%", height: "100%" }} />
      ) : <div className="empty">{error ? <span className="error">{error}</span> : "LOADING"}</div>}
    </div>
  );
}

function Rushes({ name, view, run, firstPass }: { name: string; view: ProjectView; run: (action: string) => void; firstPass: () => void }) {
  const cacheOrder = ["edit", "proxy", "transcript", "silences"];
  return (
    <div className="rushes">
      <div className="takes">
        {view.takes.map((tk) => (
          <div className="take" key={tk.id}>
            <span className="mono">{tk.id} · {ms(tk.durationMs)}</span>
            <span className="words1">{tk.firstWords || "no words"}</span>
            <span className="cachebar">{cacheOrder.map((k) => <i key={k} className={tk.cache[k]} title={`${k}: ${tk.cache[k]}`} />)}</span>
          </div>
        ))}
      </div>
      <div className="row">
        <button type="button" className="act fill" onClick={firstPass}>{t("RUN THE FIRST PASS")}</button>
        <a className="act" href={`#/p/${enc(name)}/add`}>{t("ADD RUSHES")}</a>
        <button type="button" className="link" onClick={() => run("analyze")}>Analyze again</button>
      </div>
    </div>
  );
}

function Wrap({ name, view, run }: { name: string; view: ProjectView; run: (action: string, options?: Record<string, unknown>) => void }) {
  const [format, setFormat] = useState<"mp4" | "capcut">("mp4");
  const latest = view.renders[0];
  const job = view.jobs.find((j) => j.state === "running" && (j.label === "Render" || j.label === "Export to CapCut"));
  return (
    <section aria-label="Final video" className="wrap">
      <div className="wrap-video">
        {latest ? <video className="frame lit" controls preload="metadata" src={fileUrl(name, latest.file, latest.mtime)} />
          : <Screen name={name} view={view} proposal={null} variant={null} className="frame lit" />}
      </div>
      <div className="wrap-side">
        <h1>{name} {latest ? "IS READY" : ""}</h1>
        <div role="radiogroup" aria-label="Format" className="list">
          {([["mp4", "MP4 video", "renders/"], ["capcut", "CapCut project", "EDITABLE"]] as const).map(([k, label, tag]) => (
            <button key={k} type="button" role="radio" aria-checked={format === k} className={`row-item act${format === k ? " on" : ""}`} onClick={() => setFormat(k)}>
              <span>{label}</span><span className="mono">{tag}</span>
            </button>
          ))}
        </div>
        {job ? <p className="mono">{job.label.toUpperCase()} · RUNNING</p>
          : <button type="button" className="act fill big" onClick={() => run(format === "mp4" ? "render" : "capcut", format === "capcut" ? { name } : {})}>{t("EXPORT")} {format === "mp4" ? "MP4" : "CAPCUT"}</button>}
        {latest && <p className="mono note">LAST · {new Date(latest.mtime).toLocaleString()} · <a href={fileUrl(name, latest.file)} download>DOWNLOAD</a></p>}
        <p className="mono note">{format === "mp4" ? "SAVED TO renders/ IN THE PROJECT FOLDER" : "NATIVE CLIPS, EDITABLE TITLES AND CAPTIONS. EXPERIMENTAL."}</p>
      </div>
    </section>
  );
}

export function Studio({ name, jobId }: { name: string; jobId?: string }) {
  useLang();
  const [view, setView] = useState<ProjectView | null>(null);
  const [error, setError] = useState("");
  const [group, setGroup] = useState<GroupId | null>(null);
  const [pick, setPick] = useState<{ proposal: string; key: string } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [refill, setRefill] = useState<ProposalView | null>(null);
  const [toast, setToast] = useState("");
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [pop, setPop] = useState<"connectors" | "skills" | null>(null);
  const [connCount, setConnCount] = useState<number | null>(null);
  // Skills picked for the next ask (Claude Code's own skills, called with its Skill tool).
  const [skills, setSkills] = useState<string[]>([]);
  // Skills are Claude Code's: with Codex the button and the picked skills go away.
  const [ai, setAi] = useState<"claude" | "codex">("claude");
  useEffect(() => {
    api<{ engine: "claude" | "codex" }>("/settings").then((x) => setAi(x.engine), () => {});
    const on = (e: Event) => { setAi((e as CustomEvent).detail); setSkills([]); setPop(null); };
    addEventListener(ENGINE_EVENT, on);
    return () => removeEventListener(ENGINE_EVENT, on);
  }, []);
  const toggleSkill = (s: string) => setSkills((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  const [dropping, setDropping] = useState(false);
  // Step by step (each step waits for the creator) or auto (every step runs, then the render).
  const [mode, setMode] = useState<"steps" | "auto">("steps");
  const [auto, setAuto] = useState<{ state: string; label: string; error?: string } | null>(null);
  // A click on a locked step: the action that is needed now pulses for a moment.
  const [nudge, setNudge] = useState(false);
  useEffect(() => { api<{ mode: "steps" | "auto" }>("/settings").then((x) => setMode(x.mode ?? "steps"), () => {}); }, []);
  useEffect(() => { if (!nudge) return; const id = setTimeout(() => setNudge(false), 2600); return () => clearTimeout(id); }, [nudge]);
  const addMention = (text: string) => setPrompt((p) => (p.includes(text) ? p : `${p.trimEnd()}${p.trim() ? " " : ""}${text}`));
  const load = useCallback(() => {
    void api<{ state: string; label: string; error?: string } | null>(`/projects/${enc(name)}/auto`).then(setAuto, () => {});
    return api<ProjectView>(`/projects/${enc(name)}`).then((v) => { setView(v); setError(""); return v; }, (e) => { setError(e.message); return null; });
  }, [name]);
  // While auto mode runs, look again every two seconds.
  useEffect(() => {
    if (auto?.state !== "running") return;
    const id = setInterval(() => void load(), 2000);
    return () => clearInterval(id);
  }, [auto?.state, load]);
  const startAuto = async () => {
    try { setAuto(await api(`/projects/${enc(name)}/auto`, { method: "POST", body: { action: "start" } })); } catch (e) { setError((e as Error).message); }
  };
  const pickMode = async (m: "steps" | "auto") => {
    setMode(m);
    try { await api("/settings", { method: "PUT", body: { mode: m } }); } catch (e) { setError((e as Error).message); }
    if (m === "auto" && view?.workflow && !Object.values(view.workflow.steps).every((x) => x === "done")) void startAuto();
  };
  useEffect(() => {
    void load();
    api<{ enabled: boolean }[]>("/connectors").then((l) => setConnCount(l.filter((c) => c.enabled).length), () => {});
    const ev = new EventSource("/api/events");
    ev.onmessage = (m) => { if (JSON.parse(m.data).project === name) void load(); };
    return () => ev.close();
  }, [name]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 3200); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (view && group === null) setGroup(openGroup(view.workflow)); }, [view]);
  // T switches to the timeline, as the toggle says; Ctrl+Z undoes the last change to the project.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); void api(`/projects/${enc(name)}/edit`, { method: "POST", body: { op: "undo" } }).then(() => { setToast("Undone"); void load(); }, (err) => setError((err as Error).message)); return; }
      if (e.key === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) go(`#/p/${enc(name)}/edit`);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [name]);

  const edit = async (body: Record<string, unknown>, done?: string) => {
    try {
      await api(`/projects/${enc(name)}/edit`, { method: "POST", body });
      if (done) setToast(done);
      const v = await load();
      // A choice or a close that finishes the step: straight to the next one.
      if (v && (body.op === "decide" || body.op === "close_step") && group && groupState(group, v.workflow) === "done") { setGroup(openGroup(v.workflow)); setPick(null); }
      return true;
    } catch (e) { setError((e as Error).message); return false; }
  };
  const run = async (action: string, options: Record<string, unknown> = {}) => {
    try { const { job } = await api<{ job: JobView }>(`/projects/${enc(name)}/jobs`, { method: "POST", body: { action, options } }); go(`#/p/${enc(name)}/job/${job.id}`); await load(); }
    catch (e) { setError((e as Error).message); }
  };
  const wf = view?.workflow ?? null;
  const g: GroupId = group ?? "story";
  const step = askStep(g, wf);
  const ask = async (text: string, mode: "do" | "propose" = "propose") => {
    if (g === "wrap" || !wf) return;
    const full = refill ? `${text}\n\n(The creator sent proposal ${refill.id} back for more options: refill that proposal with propose, same id, new variants.)` : text;
    try { await api(`/projects/${enc(name)}/ask`, { method: "POST", body: { step, prompt: full, skills, mode: refill ? "propose" : mode } }); setPrompt(""); setRefill(null); setSkills([]); await load(); }
    catch (e) { setError((e as Error).message); }
  };
  const firstPass = async () => {
    try {
      const r = await api<{ summary: { fillers: number; retakes: unknown[]; captions: number } }>(`/projects/${enc(name)}/edit`, { method: "POST", body: { op: "first_pass" } });
      setToast(`First pass: ${r.summary.fillers} fillers, ${r.summary.retakes.length} failed takes, ${r.summary.captions} captions`);
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const members = GROUPS.find((x) => x.id === g)?.members ?? [];
  const ofGroup = useMemo(() => (view?.proposals ?? []).filter((p) => members.includes(p.step)), [view, g]);
  const pending = ofGroup.find((p) => p.status === "pending" && p.variants.length);
  const decided = ofGroup.filter((p) => p.status !== "pending");
  const cardStamp = JSON.stringify((view?.proposals ?? []).map((p) => [p.id, p.status, p.variants.length])) + (view?.durationMs ?? "");
  // The variant picked on screen: the creator's click, else the first one.
  const chosenKey = pending && pick?.proposal === pending.id ? pick.key : pending?.variants[0]?.key ?? null;
  const chosen = pending?.variants.find((v) => v.key === chosenKey);

  // A project being created: its analysis job writes project.json at the end. Show the job, then open the studio.
  if (!view && jobId) return (
    <div className="creating">
      <Halftone fx="wave" step={6} className="creatingwave" />
      <p className="mono">ANALYZING {name.toUpperCase()}: TAKES, TRANSCRIPT, CUT-OUT… A FEW MINUTES</p>
      <JobLog id={jobId} onEnd={() => void load()} />
    </div>
  );
  if (!view) return <div className="center-msg">{error ? <p className="error">{error}</p> : <p className="mono">OPENING THE PROJECT</p>}</div>;
  const running = view.jobs.find((j) => j.state === "running");
  const claudeJob = view.jobs.find((j) => aiOf(j.label) && (j.state === "running" || Date.now() - (j.endedAt ?? 0) < 60_000) && groupOf(aiOf(j.label)!.step) === g);
  const otherJob = jobId ? view.jobs.find((j) => j.id === jobId && !aiOf(j.label)) : running && !aiOf(running.label) ? running : undefined;
  const state = groupState(g, wf);
  const locked = state === "locked" && g !== "wrap";
  const lockedWhy = locked && wf ? `Finish ${t(NAMES[groupOf(wf.current)])} first` : null;
  const stepNo = GROUPS.findIndex((x) => x.id === g) + 1;
  const canAsk = Boolean(wf) && g !== "wrap";
  const busy = Boolean(claudeJob && claudeJob.state === "running") || Boolean(running && aiOf(running.label));
  const canClose = wf && members.includes(wf.current) && !pending;
  const decide = async (d: string) => { if (pending && await edit({ op: "decide", proposal: pending.id, decision: d }, d === "reject" ? "Proposal set aside" : `Variant ${d} applied`)) setPick(null); };
  const accepted = [...decided].reverse().find((p) => p.status.startsWith("accepted") && p.variants.length > 1);
  const acceptedKey = accepted?.status.replace(/^accepted\s*/, "");
  const switchTo = (key: string) => accepted && edit({ op: "switch", proposal: accepted.id, variant: key }, mode === "auto" ? `Variant ${key} applied, the video is rendered again` : `Variant ${key} applied`);
  const pickRow = accepted && (
                  <div className="switchrow" role="group" aria-label="Your pick">
                    <span className="mono">YOUR PICK</span>
                    {accepted.variants.map((v) => (
                      <button key={v.key} type="button" className={`vchip${v.key === acceptedKey ? " on" : ""}`} aria-pressed={v.key === acceptedKey} title={v.label}
                        disabled={v.key === acceptedKey || busy || auto?.state === "running"} onClick={() => void switchTo(v.key)}><b>{v.key}</b> {v.label}</button>
                    ))}
                  </div>
  );
  const historyLabel = (p: ProposalView) => {
    const key = p.status.replace(/^accepted\s*/, "");
    return { k: p.status.startsWith("accepted") ? key : "×", label: p.variants.find((v) => v.key === key)?.label ?? p.reason ?? (p.id.startsWith("auto.") ? "First pass" : "Proposal") };
  };
  const current = wf ? openGroup(wf) : "story";
  const nextAction = !wf ? "Run the first pass on your takes."
    : current === "wrap" ? "Every step is done: export your video."
    : g !== current ? (groupState(g, wf) === "done" ? `Next step: ${t(NAMES[current])}.` : `Finish ${t(NAMES[current])} first.`)
    : pending ? `Pick a variant, then press CHOOSE ${chosenKey}.`
    : g === "story" ? "Paste your script or let your AI write it, then press SCRIPT READY, NEXT."
    : PRESETS[g] && !decided.length ? `Press ${PRESETS[g]!.button}, or skip the step.`
    : "Press STEP DONE, NEXT.";
  const need = nudge ? " nudge" : "";
  const openStep = (id: GroupId) => {
    setPick(null);
    // Step by step: a locked step sends the creator back to the open one, with the action to do highlighted.
    if (mode === "steps" && wf && groupState(id, wf) === "locked") {
      setGroup(current); setNudge(true); setToast(`${t(NAMES[current])} first: ${nextAction}`);
      return;
    }
    setGroup(id);
  };
  const hint = g === "wrap" ? "Pick a format, then export." : nextAction;

  return (
    <>
      <div className="subbar">
        <span className="mono">{view.name} · {view.format} · {ms(view.durationMs).toUpperCase()}</span>
        <div className="modebar">
          <div role="group" aria-label="Mode" className="toggle small">
            <button type="button" aria-pressed={mode === "steps"} className={mode === "steps" ? "on" : ""} onClick={() => void pickMode("steps")}>STEP BY STEP</button>
            <button type="button" aria-pressed={mode === "auto"} className={mode === "auto" ? "on" : ""} onClick={() => void pickMode("auto")}>AUTO</button>
          </div>
          {mode === "auto" && <Help text={AUTO_HELP} />}
          {auto?.state === "running" ? <>
            <span className="mono autostate"><i className="pulse" /> AUTO · {auto.label.toUpperCase()}…</span>
            <button type="button" className="link" onClick={() => void api<{ state: string; label: string; error?: string }>(`/projects/${enc(name)}/auto`, { method: "POST", body: { action: "stop" } }).then(setAuto)}>stop</button>
          </> : mode === "auto" && wf && current !== "wrap" ? <button type="button" className="act small" onClick={() => void startAuto()}>RUN THE REMAINING STEPS ▶</button>
            : auto?.state === "failed" ? <span className="mono error">AUTO STOPPED: {auto.error}</span> : null}
        </div>
        <div role="group" aria-label="View" className="toggle">
          <a href={`#/p/${enc(name)}`} aria-current="page" className="on">{t("STEPS")}</a>
          <a href={`#/p/${enc(name)}/edit`}>{t("TIMELINE")} · T</a>
        </div>
      </div>
      <div className={`cols studio-cols${g === "wrap" ? " no-aside" : ""}`}>
        <nav aria-label="Steps" className="list steps">
          {GROUPS.map((x) => {
            const st = groupState(x.id, wf);
            const n = (view.proposals ?? []).filter((p) => x.members.includes(p.step) && p.status === "pending" && p.variants.length).reduce((a, p) => a + p.variants.length, 0);
            return (
              <button key={x.id} type="button" className={`step ${st}${g === x.id ? " on" : ""}`} style={{ borderLeftColor: x.color }} aria-current={g === x.id ? "step" : undefined}
                onClick={() => openStep(x.id)}>
                <span className="sname"><svg className="sicon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[x.id]} /></svg>{t(NAMES[x.id])}</span><span className={`mono${n ? " newbadge" : ""}`}>{n ? `${n} NEW` : st === "done" ? "✓" : ""}</span>
              </button>
            );
          })}
          {/* What the picked variant adds and why, under the steps: the centre stays for the pictures. */}
          {g !== "wrap" && pending && chosen && (
            <div className="chosen-info">
              <div className="adds mono">{chosen.key} · ADDS {(chosen.summary || "").toUpperCase()}</div>
              {chosen.why && <p className="why">{chosen.why}</p>}
            </div>
          )}
        </nav>

        {g === "wrap" ? <Wrap name={name} view={view} run={run} /> : (
          <section aria-label="Variants" className="center">
            <div className="head">
              <h1>{chosen ? `${chosen.key} · ${chosen.label.toUpperCase()}` : t(NAMES[g]).toUpperCase()}</h1>
              {/* While the AI works: the dot wave stretched between the title and the step count. */}
              {claudeJob?.state === "running" && <Halftone fx="wave" step={5} className="headwave" label="Your AI is working" />}
              <span className="mono">{t(NAMES[g]).toUpperCase()} · STEP {String(stepNo).padStart(2, "0")} / {String(GROUPS.length).padStart(2, "0")}</span>
            </div>
            <p className="nextline mono"><Help text={HELP[g]} />
              {state === "done" ? (accepted ? "DONE · PICK ANOTHER VARIANT BELOW TO CHANGE IT" : "DONE") : auto?.state === "running" ? "AUTO MODE IS ON IT" : `NEXT · ${nextAction.toUpperCase()}`}</p>
            {error && <p className="error" onClick={() => setError("")}>{error}</p>}
            {/* During an auto run, its progress is in the top bar: the render log stays out of the step. */}
            {otherJob && auto?.state !== "running" && <JobLog key={otherJob.id} id={otherJob.id} onEnd={() => load()} />}
            {!wf && g === "story" ? <Rushes name={name} view={view} run={run} firstPass={firstPass} /> : g === "story" ? (
              // Story: the edit on the left (or the picked shape), the script on the right.
              <div className="story-view">
                <div className="story-video">
                  {pending && (
                    <div className="vchips" role="group" aria-label="Story shapes">
                      {pending.variants.map((v) => <button key={v.key} type="button" className={`vchip${v.key === chosenKey ? " on" : ""}`} aria-pressed={v.key === chosenKey}
                        title={v.label} onClick={() => setPick({ proposal: pending.id, key: v.key })}><b>{v.key}</b> {v.label}</button>)}
                    </div>
                  )}
                  <Screen name={name} view={view} proposal={pending ? pending.id : null} variant={pending ? chosenKey : null} className="frame lit" />
                  {!pending && pickRow}
                  {!pending && canClose && <button type="button" className={`act fill${need}`} onClick={() => void edit({ op: "close_step" }, "Story done")}>{t("SCRIPT READY, NEXT")} →</button>}
                  {!pending && <button type="button" className="act" disabled={busy || locked} onClick={() => void ask(PRESETS.story!.prompt)}>{PRESETS.story!.button} · OPTIONAL</button>}
                </div>
                <ScriptPanel name={name} aiName={ai.toUpperCase()} />
              </div>
            ) : g === "sound" && pending ? (
              // Sound: the three soundtracks on the left, the edit with the picked one on the right to hear it in place.
              <div className="sound-view">
                <SoundTracks name={name} p={pending} chosen={chosenKey} stamp={cardStamp} onPick={(key) => setPick({ proposal: pending.id, key })} />
                <div className="sound-video"><Screen name={name} view={view} proposal={pending.id} variant={chosenKey} className="frame lit" /></div>
              </div>
            ) : pending ? (
              <>
                <div className="variants" style={{ "--ar": view.format === "16:9" ? 16 / 9 : 9 / 16 } as React.CSSProperties}>
                  {pending.variants.map((v) => {
                    const on = v.key === chosenKey;
                    return (
                      <div key={v.key} className={`variant${on ? " on" : ""}`}>
                        {on ? <Screen name={name} view={view} proposal={pending.id} variant={v.key} className="shot" />
                          : <button type="button" className="shot-btn" aria-label={`Variant ${v.key}: ${v.label}`} onClick={() => setPick({ proposal: pending.id, key: v.key })}>
                            <VariantShot name={name} proposal={pending.id} variant={v.key} stamp={cardStamp} />
                          </button>}
                        <button type="button" className="vlabel" aria-pressed={on} onClick={() => setPick({ proposal: pending.id, key: v.key })}>
                          <b>{v.key}</b><span>{v.label}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="stage">
                <Screen name={name} view={view} proposal={null} variant={null} className="frame lit" />
                {pickRow}
                {PRESETS[g] && !lockedWhy && !decided.length && claudeJob?.state !== "running"
                  ? <button type="button" className={`act fill big${need}`} disabled={busy} onClick={() => void ask(PRESETS[g]!.prompt)}>{PRESETS[g]!.button}</button>
                  : <p className="mono note">{lockedWhy ?? ""}</p>}
              </div>
            )}
          </section>
        )}

        {g !== "wrap" && (
          <aside aria-label="Status" className="status">
            <div className="h">{t("STATUS")}</div>
            <div className="kv"><span>Project</span><b>{view.name}</b></div>
            <div className="kv"><span>Format</span><b>{view.format}</b></div>
            <div className="kv"><span>Duration</span><b>{ms(view.durationMs)}</b></div>
            <div className="kv"><span>Takes</span><b>{view.takes.length}</b></div>
            <div className="kv"><span>Assets</span><button type="button" className="link" onClick={() => setAssetsOpen(true)}>{view.assets.length} · OPEN</button></div>
            <div className="kv claude"><ClaudeBar stamp={`${claudeJob?.id ?? ""}:${claudeJob?.state ?? ""}`} /></div>
            {pending && chosen && <>
              <button type="button" className={`act fill${need}`} disabled={locked} title={lockedWhy ?? ""} onClick={() => void decide(chosen.key)}>{t("CHOOSE")} {chosen.key}</button>
              <a className="line-btn" href={`#/p/${enc(name)}/edit`}><span>{t("FINE-TUNE IN THE TIMELINE")}</span><span>→</span></a>
              <button type="button" className="line-link" onClick={() => { setRefill(pending); setPrompt(""); }}><span>{t("More options")}</span><span>+</span></button>
              <button type="button" className="line-link" onClick={() => void decide("reject")}><span>{t("None of these")}</span><span>×</span></button>
            </>}
            {canClose && <button type="button" className={`act${g !== "story" && decided.length ? need : ""}`} onClick={() => void edit({ op: "close_step" }, "Step done")}>{decided.length || g === "story" ? t("STEP DONE, NEXT") : t("SKIP THIS STEP")} →</button>}
            {decided.slice(-2).map((p) => { const h = historyLabel(p); return <div key={p.id} className="line-link dim" title={h.label}><span>History: {h.label}</span><span>{h.k}</span></div>; })}
            <div className="synced">{running ? `● ${running.label.toUpperCase()}` : "● SYNCED"}</div>
          </aside>
        )}
      </div>

      {canAsk && (
        <div className="askbar-wrap">
          {claudeJob && <ClaudeFeed key={claudeJob.id} job={claudeJob} onEnd={() => void load()} />}
          {(refill || skills.length > 0) && (
            <div className="askmeta mono">
              {refill && <span>NEW OPTIONS FOR “{refill.reason || refill.id}” <button type="button" className="link" onClick={() => setRefill(null)}>cancel</button></span>}
              {skills.map((s) => <button key={s} type="button" className="link" title="Remove" onClick={() => toggleSkill(s)}>/{s} ×</button>)}
            </div>
          )}
          <div className={`askbar${dropping ? " over" : ""}`}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true); } }}
            onDragLeave={() => setDropping(false)}
            onDrop={async (e) => {
              e.preventDefault(); setDropping(false);
              const r = await dropInto(e.dataTransfer.files, name);
              r.added.forEach((a) => addMention(mention(a)));
              if (r.errors.length) setError(r.errors.join("\n"));
              if (r.added.length) { setToast(`Added ${r.added.map((a) => a.id).join(", ")} to this video`); await load(); }
            }}>
            <label htmlFor="ask">{t("ASK YOUR AI")}</label>
            <input id="ask" value={prompt} placeholder={`${t(NAMES[g])}: what do you want?`} onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && prompt.trim() && !busy) void ask(prompt, e.ctrlKey || e.metaKey ? "propose" : "do"); }} />
            <button type="button" className="act" disabled={!prompt.trim() || busy} title="Applies your request directly (Undo puts it back)" onClick={() => ask(prompt, "do")}>{t("DO IT")}</button>
            <button type="button" className="act fill" disabled={!prompt.trim() || busy} title="Two or three options to choose from (Ctrl+Enter)" onClick={() => ask(prompt)}>{t("PROPOSE A / B / C")}</button>
          </div>
        </div>
      )}
      <footer className="foot">
        <button type="button" className="circ" aria-haspopup="dialog" aria-expanded={pop === "connectors"} onClick={() => setPop(pop === "connectors" ? null : "connectors")}>
          <span className="ring" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5" /></svg></span>
          {t("CONNECTORS")}{connCount !== null ? ` · ${connCount}` : ""}
        </button>
        {ai === "claude" && <button type="button" className="circ" aria-haspopup="dialog" aria-expanded={pop === "skills"} onClick={() => setPop(pop === "skills" ? null : "skills")}>
          <span className="ring" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" /></svg></span>
          {t("SKILLS")} · {skills.length}
        </button>}
        <span className="hint">{hint}</span>
      </footer>
      {pop === "connectors" && <ConnectorsPanel onClose={() => setPop(null)} onCount={setConnCount} />}
      {pop === "skills" && <SkillsPanel picked={skills} onToggle={toggleSkill} onClose={() => setPop(null)} />}
      {assetsOpen && <AssetsPanel name={name} view={view} onClose={() => setAssetsOpen(false)} onMention={addMention} onChanged={() => void load()} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
