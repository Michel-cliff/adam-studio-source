import { Player, type PlayerRef } from "@remotion/player";
import { Edit } from "@adam-studio/render/edit";
import type { RenderProps } from "@adam-studio/render/src/props";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobEvent, JobView, ProjectView, ProposalView } from "../server/types";
import { api, enc, fileUrl, go, ms } from "./api";
import { AssetsPanel, dropInto, mention } from "./Assets";
import { ClaudeBar } from "./ClaudeBar";
import { ConnectorsPanel, SkillsPanel } from "./Connectors";
import { IconFolder, IconLink, IconSend, IconSpark } from "./icons";
import { JobLog } from "./JobLog";

type StepId = "rushes" | "cuts" | "structure" | "captions" | "hook" | "beats" | "visuals" | "sound" | "look" | "wrap";
const TAGLINE: Record<StepId, string> = {
  rushes: "Your takes", cuts: "What stays", structure: "The arc", captions: "Words on screen", hook: "The first 3 seconds",
  beats: "Each new idea", visuals: "Show it", sound: "What carries the cut", look: "Your signature", wrap: "Out into the world",
};
// The guide's checklist before publishing.
const CHECKLIST = ["Answers one of my 3 problems", "The hook lands in 3 seconds", "I talk to the viewer", "The story has a conflict", "The end gives value", "My visual identity shows"];
const STEPS: { id: StepId; title: string; lede: string; chips: string[] }[] = [
  { id: "rushes", title: "Rushes", lede: "Your takes, analyzed. Start here: the first pass cuts the obvious and proposes captions.", chips: [] },
  { id: "cuts", title: "Cuts", lede: "What stays. Dead air, fillers and failed takes go; the strongest version of each idea stays.",
    chips: ["Tighter: cut every hesitation", "Keep it natural, only the dead air", "Cut the tangent in the middle"] },
  { id: "structure", title: "Story", lede: "The order and the arc. A framework, beats on your words, maybe a reorder.",
    chips: ["Hook, problem, solution, call to action", "Open loop: tease the ending first", "Reorder for the strongest start"] },
  { id: "captions", title: "Captions", lede: "The words on screen: rhythm, length, the word that pops.",
    chips: ["Bold two lines, one highlighted word", "Minimal, one line", "Highlight every number and name"] },
  { id: "hook", title: "Hook", lede: "The first three seconds decide everything.",
    chips: ["A bold question as the title", "Open on the most surprising sentence", "A big number in the first second"] },
  { id: "beats", title: "Beats", lede: "What marks each new idea: a word behind you, a punch-in, a flash.",
    chips: ["Big word behind me at each new idea", "Punch-in zoom on the key moments", "Flash cut between parts"] },
  { id: "visuals", title: "Visuals", lede: "Images, HUD panels, stats and animations where your words name something showable.",
    chips: ["Show what I talk about with images", "A HUD panel when I mention data", "One animated accent, nothing more"] },
  { id: "sound", title: "Sound", lede: "Whooshes, hits and silences that carry the cut.",
    chips: ["Subtle whooshes on the cuts", "A hit on the reveal", "Almost nothing, keep it clean"] },
  { id: "look", title: "Type & look", lede: "Fonts, colors, grade and the pace of the animations.",
    chips: ["Warm cinematic grade, elegant serif titles", "Clean modern sans, high contrast", "Slower, smoother animations"] },
  { id: "wrap", title: "Wrap", lede: "Render the final video and send it to CapCut.", chips: [] },
];
const WORKFLOW_STEPS = ["cuts", "structure", "captions", "hook", "beats", "visuals", "sound", "look"];

const ACTIVITY: Record<string, string> = {
  get_project: "Reading the project", get_transcript: "Reading what you say", get_reference: "Checking the formats",
  search_assets: "Searching your Inspiration and free libraries", look_at: "Looking at a reference", import_asset: "Importing a file",
  propose: "Writing the proposal", still: "Rendering a frame to check it", list_series: "Looking at the series",
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
        if (e.type === "assistant") {
          for (const c of e.message?.content ?? []) {
            if (c.type === "tool_use") {
              const name = String(c.name).replace(/^mcp__adam-studio__/, "");
              const label = ACTIVITY[name];
              if (label && seen[seen.length - 1] !== label) { seen.push(label); setLines([...seen]); }
            }
          }
        }
        if (e.type === "result") {
          // Plain words only: no markdown, no internal ids; the last paragraph is the message to the creator.
          const plain = String(e.result ?? "").replace(/\*\*|`/g, "").replace(/\bask\.[\w.]+/g, "").trim();
          const last = plain.split(/\n\s*\n/).pop() ?? plain;
          setSay(last.length > 320 ? `${last.slice(0, 317)}...` : last);
        }
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
    <div className="feed">
      <div className="who">{state === "running" ? <span className="pulse" /> : null} Claude {state === "running" ? "is working" : state === "done" ? "" : `(${state})`}</div>
      <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}{state === "running" && lines.length === 0 ? <li>Getting ready</li> : null}</ul>
      {say && <div className="say">{say}</div>}
      {state === "running" && <div style={{ marginTop: 8 }}><button className="ghost" onClick={() => api(`/jobs/${job.id}/stop`, { method: "POST" })}>Stop</button></div>}
    </div>
  );
}

function ProposalCard({ p, seen, onSee, onDecide, onMore, locked }: {
  p: ProposalView; seen: string | null; locked: string | null;
  onSee: (key: string | null) => void; onDecide: (decision: string) => void; onMore: (p: ProposalView) => void;
}) {
  const pending = p.status === "pending";
  const source = p.id.startsWith("auto.") ? "First pass" : p.id.startsWith("ask.") ? "Claude" : "Proposal";
  if (!pending) {
    const key = p.status.replace(/^accepted\s*/, "");
    const label = p.variants.find((v) => v.key === key)?.label;
    return (
      <div className="decided">
        <span className="chosen">{p.status.startsWith("accepted") ? `✓ ${key}` : p.status}</span>
        <span>{label ?? p.reason ?? source}</span>
      </div>
    );
  }
  return (
    <div className="proposal">
      <div className="head"><span className="tag">{source}</span>{p.reason && <span className="why">{p.reason}</span>}</div>
      {p.variants.length === 0 && <p className="muted">Sent back for new options{p.notes.length ? `: “${p.notes.at(-1)}”` : ""}. Ask Claude below.</p>}
      <div className="variants">
        {p.variants.map((v, i) => (
          <article key={v.key} className={`variant v${i % 4}${seen === v.key ? " seen" : ""}`} onClick={() => onSee(seen === v.key ? null : v.key)}>
            <div className="top"><span className="k">{v.key}</span><span className="label">{v.label}</span></div>
            {v.why && <div className="what">{v.why}</div>}
            <div className="adds">{v.summary}</div>
            <div className="acts">
              <button onClick={(e) => { e.stopPropagation(); onDecide(v.key); }} disabled={Boolean(locked)} title={locked ?? ""}>Choose {v.key}</button>
              <button className="quiet" onClick={(e) => { e.stopPropagation(); onSee(v.key); }}>{seen === v.key ? "Watching" : "Watch"}</button>
            </div>
          </article>
        ))}
      </div>
      {p.variants.length > 0 && (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="ghost" onClick={() => onMore(p)}>More options…</button>
          <button className="ghost" onClick={() => onDecide("reject")}>None of these</button>
        </div>
      )}
    </div>
  );
}

/** The checklist before publishing, ticked per project on this computer. */
function Checklist({ name }: { name: string }) {
  const key = `adam.checklist.${name}`;
  const [ticks, setTicks] = useState<boolean[]>(() => { try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; } });
  const flip = (i: number) => {
    const next = CHECKLIST.map((_, k) => (k === i ? !ticks[k] : Boolean(ticks[k])));
    setTicks(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
  };
  const n = CHECKLIST.filter((_, i) => ticks[i]).length;
  return (
    <section className="checklist" aria-label="Checklist before publishing">
      <b>checklist_before_publishing.txt</b>
      {CHECKLIST.map((c, i) => <label key={c}><input type="checkbox" checked={Boolean(ticks[i])} onChange={() => flip(i)} />{c}</label>)}
      <span className="done">{n} of {CHECKLIST.length}</span>
    </section>
  );
}

function Screen({ name, view, proposal, variant }: { name: string; view: ProjectView; proposal: string | null; variant: string | null }) {
  const [props, setProps] = useState<RenderProps | null>(null);
  const [base, setBase] = useState<RenderProps | null>(null);
  const [error, setError] = useState("");
  const player = useRef<PlayerRef>(null);
  const stamp = JSON.stringify(view.proposals.map((p) => [p.id, p.status, p.variants.length])) + view.durationMs;
  useEffect(() => {
    let alive = true;
    const q = proposal && variant ? `?proposal=${enc(proposal)}&variant=${variant}` : "";
    Promise.all([api<RenderProps>(`/projects/${enc(name)}/preview${q}`), q ? api<RenderProps>(`/projects/${enc(name)}/preview`) : Promise.resolve(null)])
      .then(([p, b]) => { if (alive) { setProps(p); setBase(b); setError(""); } })
      .catch((e) => { if (alive) { setProps(null); setError(e.message); } });
    return () => { alive = false; };
  }, [name, proposal, variant, stamp]);
  // Jump to what the variant adds: its first new element, caption or changed clip.
  useEffect(() => {
    if (!props || !base || !player.current) return;
    const known = new Set(base.timeline.elements.map((e) => e.id));
    const added = props.timeline.elements.filter((e) => !known.has(e.id)).map((e) => e.fromFrame);
    const caps = props.timeline.captions.length !== base.timeline.captions.length ? [props.timeline.captions[0]?.fromFrame ?? 0] : [];
    const frame = [...added, ...caps].sort((a, b) => a - b)[0] ?? 0;
    // A little into it: titles and words reveal over their first frames.
    player.current.seekTo(Math.min(props.timeline.durationFrames - 1, frame + Math.round(props.timeline.fps * 0.7)));
  }, [props, base]);
  const t = props?.timeline;
  const wide = t ? t.width > t.height : view.format === "16:9";
  return (
    <div className={`screen${wide ? " wide" : ""}`}>
      {t && props ? (
        <Player ref={player} component={Edit} inputProps={props} durationInFrames={Math.max(1, t.durationFrames)} fps={t.fps}
          compositionWidth={t.width} compositionHeight={t.height} controls style={{ width: "100%", height: "100%" }} />
      ) : (
        <div className="empty">{error ? <span className="error">{error}</span> : "Loading the preview"}</div>
      )}
    </div>
  );
}

function Rushes({ name, view, run, firstPass }: { name: string; view: ProjectView; run: (action: string, options?: Record<string, unknown>) => void; firstPass: () => void }) {
  const cacheOrder = ["edit", "proxy", "transcript", "silences"];
  return (
    <>
      <div className="card cta">
        <h3>First pass</h3>
        <p className="muted" style={{ margin: "0 0 12px" }}>Cuts fillers, failed takes and dead air, and drafts the captions. You choose before anything changes.</p>
        <div className="row"><button className="yellow" onClick={firstPass}>Run the first pass</button><a className="button quiet" href={`#/p/${enc(name)}/add`}>Add rushes</a></div>
      </div>
      <div className="takes">
        {view.takes.map((t) => (
          <div className="take" key={t.id}>
            <div className="id">{t.id}<div className="muted" style={{ fontSize: 12, marginTop: 6, fontFamily: "var(--sans)" }}>{ms(t.durationMs)}</div></div>
            <div>
              <div>{t.firstWords || <span className="muted">no words</span>}</div>
              <div className="muted" style={{ fontSize: 12 }}>{t.file}</div>
              <div className="cachebar">{cacheOrder.map((k) => <i key={k} className={t.cache[k]} title={`${k}: ${t.cache[k]}`} />)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14 }}><button className="quiet" onClick={() => run("analyze")}>Analyze again</button></div>
    </>
  );
}

function Wrap({ name, view, run }: { name: string; view: ProjectView; run: (action: string, options?: Record<string, unknown>) => void }) {
  const [capcut, setCapcut] = useState(name);
  const latest = view.renders[0];
  return (
    <>
      <div className="card cta">
        <h3>Final video</h3>
        <p className="muted" style={{ margin: "0 0 12px" }}>Renders the full edit as an MP4 in the project's renders folder.</p>
        <button onClick={() => run("render")}>Render the video</button>
      </div>
      <div className="card cta">
        <h3>CapCut</h3>
        <p className="muted" style={{ margin: "0 0 12px" }}>Native clips, editable titles and captions; the effects CapCut cannot do come baked.</p>
        <div className="row"><input value={capcut} onChange={(e) => setCapcut(e.target.value)} style={{ flex: 1 }} /><button onClick={() => run("capcut", { name: capcut })}>Export</button></div>
      </div>
      {latest && (
        <section>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Latest render · {new Date(latest.mtime).toLocaleString()}</div>
          <video controls preload="metadata" src={fileUrl(name, latest.file, latest.mtime)} />
          <div className="row" style={{ marginTop: 10 }}><a className="button quiet" href={fileUrl(name, latest.file)} download>Download</a></div>
        </section>
      )}
    </>
  );
}

export function Studio({ name, jobId }: { name: string; jobId?: string }) {
  const [view, setView] = useState<ProjectView | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState<StepId | null>(null);
  const [seen, setSeen] = useState<{ proposal: string; key: string } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [refill, setRefill] = useState<ProposalView | null>(null);
  const [toast, setToast] = useState("");
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  // Skills picked for the next ask (Claude Code's own skills, called with its Skill tool).
  const [skills, setSkills] = useState<string[]>([]);
  const toggleSkill = (s: string) => setSkills((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  const [dropping, setDropping] = useState(false);
  // An asset named to Claude goes on its own line at the end of the prompt.
  const addMention = (text: string) => setPrompt((p) => (p.includes(text) ? p : `${p.trimEnd()}${p.trim() ? "\n" : ""}${text}`));
  const load = useCallback(() => api<ProjectView>(`/projects/${enc(name)}`).then((v) => { setView(v); setError(""); }, (e) => setError(e.message)), [name]);
  useEffect(() => {
    void load();
    const ev = new EventSource("/api/events");
    ev.onmessage = (m) => { if (JSON.parse(m.data).project === name) void load(); };
    return () => ev.close();
  }, [name]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);
  // Open on the step the workflow is at (or the rushes before any first pass).
  useEffect(() => { if (view && step === null) setStep((view.workflow?.current as StepId) ?? "rushes"); }, [view]);

  const edit = async (body: Record<string, unknown>, done?: string) => {
    try { await api(`/projects/${enc(name)}/edit`, { method: "POST", body }); if (done) setToast(done); await load(); return true; }
    catch (e) { setError((e as Error).message); return false; }
  };
  const run = async (action: string, options: Record<string, unknown> = {}) => {
    try { const { job } = await api<{ job: JobView }>(`/projects/${enc(name)}/jobs`, { method: "POST", body: { action, options } }); go(`#/p/${enc(name)}/job/${job.id}`); await load(); }
    catch (e) { setError((e as Error).message); }
  };
  const ask = async (text: string) => {
    if (!step || step === "rushes" || step === "wrap") return;
    const full = refill ? `${text}\n\n(The creator sent proposal ${refill.id} back for more options: refill that proposal with propose, same id, new variants.)` : text;
    try { await api(`/projects/${enc(name)}/ask`, { method: "POST", body: { step, prompt: full, skills } }); setPrompt(""); setRefill(null); setSkills([]); await load(); }
    catch (e) { setError((e as Error).message); }
  };
  const firstPass = async () => {
    try {
      const r = await api<{ summary: { fillers: number; retakes: unknown[]; captions: number } }>(`/projects/${enc(name)}/edit`, { method: "POST", body: { op: "first_pass" } });
      setToast(`First pass: ${r.summary.fillers} fillers, ${r.summary.retakes.length} failed takes, ${r.summary.captions} captions`);
      await load();
      setStep("cuts");
    } catch (e) { setError((e as Error).message); }
  };

  const proposals = useMemo(() => (view?.proposals ?? []).filter((p) => p.step === step).sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1)), [view, step]);
  const running = view?.jobs.find((j) => j.state === "running");
  const claudeJob = view?.jobs.find((j) => j.label.startsWith("Claude") && (j.state === "running" || Date.now() - (j.endedAt ?? 0) < 60_000) && j.label === `Claude: ${step}`);
  const otherJob = jobId ? view?.jobs.find((j) => j.id === jobId && !j.label.startsWith("Claude")) : running && !running.label.startsWith("Claude") ? running : undefined;
  if (!view) return <main>{error ? <p className="error">{error}</p> : <p className="muted">Opening the project</p>}</main>;
  const wf = view.workflow;
  const meta = STEPS.find((s) => s.id === step) ?? STEPS[0]!;
  const lockedWhy = step && wf && WORKFLOW_STEPS.includes(step) && wf.steps[step] === "locked" ? `Finish “${STEPS.find((s) => s.id === wf.current)?.title}” first` : null;
  const pendingHere = proposals.some((p) => p.status === "pending" && p.variants.length);
  const stateOf = (id: StepId) => (id === "rushes" ? (wf ? "done" : "open") : id === "wrap" ? (view.renders.length ? "done" : "") : wf?.steps[id] ?? "");
  const pendingCount = (id: StepId) => view.proposals.filter((p) => p.step === id && p.status === "pending" && p.variants.length).length;

  const stepNo = STEPS.indexOf(meta);
  // The decisions so far, in workflow order: what was chosen at each step.
  const pins = STEPS.filter((s) => s.id !== "rushes" && s.id !== "wrap").map((s) => {
    const accepted = view.proposals.filter((p) => p.step === s.id && p.status.startsWith("accepted"));
    const labels = accepted.map((p) => p.variants.find((v) => v.key === p.status.replace(/^accepted\s*/, ""))?.label ?? p.reason ?? "chosen");
    const st = stateOf(s.id);
    const text = labels.length ? `${s.title} · ${labels.join(", ")}` : st === "done" ? `${s.title} · kept as is` : wf?.current === s.id ? `${s.title} · ${pendingCount(s.id) ? "pick one below" : "ask Claude"}` : s.title;
    return { id: s.id, text, kind: labels.length || st === "done" ? "" : wf?.current === s.id ? "now" : "later" };
  });

  return (
    <div className="studio">
      <aside className="rail">
        <div className="title">{view.name}</div>
        <div className="sub">{ms(view.durationMs)} · {view.format}</div>
        {STEPS.map((s, i) => (
          <button key={s.id} className={`step ${stateOf(s.id)}${step === s.id ? " on" : ""}`} onClick={() => { setStep(s.id); setSeen(null); }}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>{s.title}
            {pendingCount(s.id) ? <span className="badge">{pendingCount(s.id)}</span> : stateOf(s.id) === "done" ? <span className="mk">✓</span> : null}
          </button>
        ))}
        <div className="foot">
          <a href={`#/p/${enc(name)}/edit`}>Fine-tune the timeline</a>
          <a href="" onClick={(e) => { e.preventDefault(); setAssetsOpen(true); }}>Assets of this video</a>
          <a href="#/library">Library</a>
          <a href="" onClick={(e) => { e.preventDefault(); void run("studio"); }}>Open Remotion Studio</a>
        </div>
      </aside>

      <div className="work dotted">
        {wf && (
          <nav className="pinned" aria-label="Pinned so far">
            <span className="h">PINNED SO FAR</span>
            {pins.map((p) => <button key={p.id} className={`pin ${p.kind}`} onClick={() => { setStep(p.id); setSeen(null); }}>{p.text}</button>)}
          </nav>
        )}
        <div className="row" style={{ gap: 8 }}>
          <span className="tag y">{String(stepNo + 1).padStart(2, "0")} / {STEPS.length}</span>
          <span className="tag">{step === "rushes" ? "Before the cut" : step === "wrap" ? "Publishing" : "In the edit room"}</span>
        </div>
        <div className="headline">
          <h1>{meta.title}</h1>
          <div className="sub2">{TAGLINE[meta.id]}</div>
          <div className="halftone" aria-hidden="true" />
        </div>
        <p className="lede">{meta.lede}</p>
        {error && <p className="error" onClick={() => setError("")}>{error}</p>}
        {otherJob && <JobLog key={otherJob.id} id={otherJob.id} onEnd={() => load()} />}
        {step === "rushes" && <Rushes name={name} view={view} run={run} firstPass={firstPass} />}
        {step === "wrap" && <Wrap name={name} view={view} run={run} />}
        {claudeJob && <ClaudeFeed key={claudeJob.id} job={claudeJob} onEnd={() => void load()} />}
        {step !== "rushes" && step !== "wrap" && (
          <>
            {lockedWhy && <p className="muted">{lockedWhy} to choose here; you can already explore.</p>}
            {proposals.length === 0 && !claudeJob && <p className="muted">Nothing proposed yet for this step. Ask Claude below, or skip it.</p>}
            {proposals.map((p) => (
              <ProposalCard key={p.id} p={p} locked={lockedWhy} seen={seen?.proposal === p.id ? seen.key : null}
                onSee={(key) => setSeen(key ? { proposal: p.id, key } : null)}
                onDecide={async (d) => { if (await edit({ op: "decide", proposal: p.id, decision: d }, d === "reject" ? "Proposal set aside" : `Variant ${d} applied`)) setSeen(null); }}
                onMore={(pp) => { setRefill(pp); setPrompt(""); }} />
            ))}
            {wf && wf.current === step && !pendingHere && (
              <div className="row"><button className="quiet" onClick={() => edit({ op: "close_step" }, `${meta.title} done`).then((ok) => ok && setStep((WORKFLOW_STEPS[WORKFLOW_STEPS.indexOf(step) + 1] as StepId) ?? "wrap"))}>
                {proposals.length ? "Step done, next" : "Skip this step"} →</button></div>
            )}
            <div className={`composer${dropping ? " over" : ""}`}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true); } }}
              onDragLeave={() => setDropping(false)}
              onDrop={async (e) => {
                e.preventDefault(); setDropping(false);
                const r = await dropInto(e.dataTransfer.files, name);
                r.added.forEach((a) => addMention(mention(a)));
                if (r.errors.length) setError(r.errors.join("\n"));
                if (r.added.length) { setToast(`Added ${r.added.map((a) => a.id).join(", ")} to this video`); await load(); }
              }}>
              <div className="win">
                <div className="bar"><span className="t">ask_claude.exe</span><i /><i className="x" /></div>
                <div className="body">
                  {refill && <div className="muted" style={{ marginBottom: 8 }}>New options for “{refill.reason || refill.id}”. <button className="ghost" onClick={() => setRefill(null)}>cancel</button></div>}
                  <div className="chips">{meta.chips.map((c) => <button key={c} className="chip" onClick={() => setPrompt(c)}>{c}</button>)}</div>
                  {skills.length > 0 && (
                    <div className="chips" aria-label="Skills for this ask">
                      {skills.map((s) => <button key={s} className="chip skill" title="Remove" onClick={() => toggleSkill(s)}>/{s} ×</button>)}
                    </div>
                  )}
                  <textarea aria-label={`Tell Claude what you want for the ${meta.title.toLowerCase()}`} value={prompt} placeholder={`Tell Claude what you want for the ${meta.title.toLowerCase()}…`} onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim()) void ask(prompt); }} />
                  <div className="tools">
                    <button className="ghost" onClick={() => setAssetsOpen(true)}><IconFolder />Assets{view.assets.length ? ` (${view.assets.length})` : ""}</button>
                    <button className="ghost" onClick={() => setConnectorsOpen(true)}><IconLink />Connectors</button>
                    <button className="ghost" onClick={() => setSkillsOpen(true)}><IconSpark />Skills{skills.length ? ` (${skills.length})` : ""}</button>
                    <ClaudeBar stamp={`${claudeJob?.id ?? ""}:${claudeJob?.state ?? ""}`} />
                    <span className="spacer" />
                    <button className="claude" title="Ctrl+Enter" disabled={!prompt.trim() || Boolean(claudeJob && claudeJob.state === "running") || Boolean(running && running.label.startsWith("Claude"))} onClick={() => ask(prompt)}>Ask Claude <IconSend /></button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        {(step === "rushes" || step === "wrap") && <div style={{ height: 24 }} />}
      </div>

      <aside className="side" aria-label="Preview">
        <Screen name={name} view={view} proposal={seen?.proposal ?? null} variant={seen?.key ?? null} />
        {seen && (
          <div className="tabs">
            <button onClick={() => setSeen(null)}>As it stands</button>
            {view.proposals.find((p) => p.id === seen.proposal)?.variants.map((v) => (
              <button key={v.key} className={seen.key === v.key ? "on" : ""} onClick={() => setSeen({ proposal: seen.proposal, key: v.key })}>{v.key}</button>
            ))}
          </div>
        )}
        <Checklist name={name} />
      </aside>
      {assetsOpen && <AssetsPanel name={name} view={view} onClose={() => setAssetsOpen(false)} onMention={addMention} onChanged={() => void load()} />}
      {connectorsOpen && <ConnectorsPanel onClose={() => setConnectorsOpen(false)} />}
      {skillsOpen && <SkillsPanel picked={skills} onToggle={toggleSkill} onClose={() => setSkillsOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
