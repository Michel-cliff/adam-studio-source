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
import { VariantShot } from "./VariantShot";

const NAMES: Record<GroupId, string> = { story: "Story", captions: "Captions", hook: "Hook", visuals: "Visuals", sound: "Sound", wrap: "Wrap" };

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
      <span className="who">{state === "running" ? <i className="pulse" /> : null}{(aiOf(job.label)?.ai ?? "Claude").toUpperCase()}{state === "running" ? " · WORKING" : state === "done" ? "" : ` · ${state.toUpperCase()}`}</span>
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
  const addMention = (text: string) => setPrompt((p) => (p.includes(text) ? p : `${p.trimEnd()}${p.trim() ? " " : ""}${text}`));
  const load = useCallback(() => api<ProjectView>(`/projects/${enc(name)}`).then((v) => { setView(v); setError(""); }, (e) => setError(e.message)), [name]);
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
    try { await api(`/projects/${enc(name)}/edit`, { method: "POST", body }); if (done) setToast(done); await load(); return true; }
    catch (e) { setError((e as Error).message); return false; }
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
  const nextGroup = () => setGroup(openGroup(view.workflow));
  const decide = async (d: string) => { if (pending && await edit({ op: "decide", proposal: pending.id, decision: d }, d === "reject" ? "Proposal set aside" : `Variant ${d} applied`)) setPick(null); };
  const historyLabel = (p: ProposalView) => {
    const key = p.status.replace(/^accepted\s*/, "");
    return { k: p.status.startsWith("accepted") ? key : "×", label: p.variants.find((v) => v.key === key)?.label ?? p.reason ?? (p.id.startsWith("auto.") ? "First pass" : "Proposal") };
  };
  const hint = g === "wrap" ? "Pick a format, then export." : !wf ? "Run the first pass to start." : pending ? t("Select a variant.") : canClose ? "Ask Claude, or move on." : lockedWhy ?? "";

  return (
    <>
      <div className="subbar">
        <span className="mono">{view.name} · {view.format} · {ms(view.durationMs).toUpperCase()}</span>
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
                onClick={() => { setGroup(x.id); setPick(null); }}>
                <span>{t(NAMES[x.id])}</span><span className="mono">{n ? `${n} NEW` : st === "done" ? "✓" : ""}</span>
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
              <span className="mono">{t(NAMES[g]).toUpperCase()} · STEP {String(stepNo).padStart(2, "0")} / {String(GROUPS.length).padStart(2, "0")}</span>
            </div>
            {error && <p className="error" onClick={() => setError("")}>{error}</p>}
            {otherJob && <JobLog key={otherJob.id} id={otherJob.id} onEnd={() => load()} />}
            {!wf && g === "story" ? <Rushes name={name} view={view} run={run} firstPass={firstPass} /> : pending ? (
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
                <p className="mono note">{lockedWhy ?? (claudeJob?.state === "running" ? "" : t("Nothing proposed yet for this step."))}</p>
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
              <button type="button" className="act fill" disabled={locked} title={lockedWhy ?? ""} onClick={() => void decide(chosen.key)}>{t("CHOOSE")} {chosen.key}</button>
              <a className="line-btn" href={`#/p/${enc(name)}/edit`}><span>{t("FINE-TUNE IN THE TIMELINE")}</span><span>→</span></a>
              <button type="button" className="line-link" onClick={() => { setRefill(pending); setPrompt(""); }}><span>{t("More options")}</span><span>+</span></button>
              <button type="button" className="line-link" onClick={() => void decide("reject")}><span>{t("None of these")}</span><span>×</span></button>
            </>}
            {canClose && <button type="button" className="act" onClick={() => edit({ op: "close_step" }, "Step done").then((ok) => ok && nextGroup())}>{decided.length ? t("STEP DONE, NEXT") : t("SKIP THIS STEP")} →</button>}
            {decided.slice(-3).map((p) => { const h = historyLabel(p); return <div key={p.id} className="line-link dim"><span>History: {h.label}</span><span>{h.k}</span></div>; })}
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
            <label htmlFor="ask">{t("ASK CLAUDE").replace("CLAUDE", ai.toUpperCase())}</label>
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
