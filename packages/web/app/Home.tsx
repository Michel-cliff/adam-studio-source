import { ClaudeBar } from "./ClaudeBar";
import { t as uiText } from "./i18n";
import { useEffect, useState } from "react";
import type { ProjectView } from "../server/types";
import { api, enc, ms, go } from "./api";
import { t, useLang } from "./i18n";
import { IconEdit, IconTrash } from "./icons";
import { GROUPS, openGroup } from "./steps";

/** The library keys, then the AI apps the studio plugs into. */
function Keys({ project }: { project?: string }) {
  return <div className="keysbox"><DaLine project={project} /><Desktop /></div>;
}

/** The creator's art direction: how many of its six lines they set; the path opens on the picked video. */
function DaLine({ project }: { project?: string }) {
  const [set, setSet] = useState<[number, number] | null>(null);
  useEffect(() => { api<{ status: { set: boolean }[] }>("/da").then((r) => setSet([r.status.filter((x) => x.set).length, r.status.length]), () => {}); }, []);
  if (set === null) return null;
  return (
    <div className="kv sep"><span>ART DIRECTION</span>
      {project ? <a className="link" href={`#/p/${enc(project)}/da`}>{set[0]} / {set[1]} · OPEN</a> : <b className="dim">{set[0]} / {set[1]}</b>}
    </div>
  );
}

type DaList = { active: string; names: string[] };
/** Which art direction the videos use, when the creator has several: switch, or open the dedicated creation page. */
function DaPicker() {
  const [list, setList] = useState<DaList | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ list: DaList; needsSetup: boolean }>("/da").then((r) => { setList(r.list); if (r.needsSetup) void api<{ completed: boolean }>("/onboarding").then(s => { if (s.completed && !document.querySelector(".onboard-root")) go("#/da"); }, () => {}); }, () => {}); }, []);
  const call = async (path: string, body: Record<string, unknown>) => {
    try { const r = await api<{ list: DaList }>(path, { method: "POST", body }); setList(r.list); setErr(""); }
    catch (e) { setErr((e as Error).message); }
  };
  if (!list) return null;
  return (
    <div className="da-pick">
      <a className="mono link" href="#/da">{t("ART DIRECTION")} ↗</a>
        <select aria-label="Art direction" value={list.active} onChange={(e) => {
          const v = e.target.value;
          if (v === "+new") go("#/da"); else void call("/da/use", { name: v });
        }}>
          {list.names.map((n) => <option key={n} value={n}>{n === "default" ? t("Default") : n}</option>)}
          <option value="+new">{t("+ New")}</option>
        </select>
      {err && <span className="error">{err}</span>}
    </div>
  );
}

/** Use the creator's Claude subscription the allowed way: Adam Studio as a connector of their own Claude Desktop. */
function Desktop() {
  return (
    <>
      <div className="kv sep"><span>ADAM'S ENGINE</span><b className="dim">ON YOUR SUBSCRIPTION</b></div>
      <Connect name="Claude Desktop" path="claude-desktop" install="https://claude.ai/download" />
      <Connect name="Codex" path="codex" install="https://openai.com/codex/" />
    </>
  );
}

/** One AI app the studio can plug into as a connector: the creator works in that app, on their own subscription. */
function Connect({ name, path, install }: { name: string; path: string; install: string }) {
  const [s, setS] = useState<{ app: boolean; connected: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [download, setDownload] = useState(false);
  useEffect(() => {
    const refresh = () => { void api<typeof s>(`/connect/${path}`).then(setS, () => {}); };
    refresh(); window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [path]);
  const checkLocal = async () => {
    setChecking(true); setDownload(false); setErr("");
    try { const found = await api<NonNullable<typeof s>>(`/connect/${path}?refresh=1`); setS(found); setDownload(!found.app); }
    catch (e) { setErr((e as Error).message); }
    finally { setChecking(false); }
  };
  const connect = async () => { try { setS(await api<typeof s>(`/connect/${path}`, { method: "POST" })); setErr(""); } catch (e) { setErr((e as Error).message); } };
  if (!s) return null;
  return (
    <>
      <div className="kv">
        <span>{name}</span>
        {s.connected ? <b className="ok" title={`Quit and reopen ${name} once, then ask it about your Adam Studio projects.`}>CONNECTED · RESTART IT</b>
          : s.app ? <button type="button" className="link" onClick={() => void connect()}>connect</button>
          : download ? <a href={install} target="_blank" rel="noreferrer">{t("Download")}</a>
          : <button type="button" className="link" disabled={checking} onClick={() => void checkLocal()}>{t(checking ? "Checking locally…" : "Check locally")}</button>}
      </div>
      {err && <p className="error">{err}</p>}
    </>
  );
}

type Filter = "All" | "In progress" | "Exported";
const stepLabel = (v: ProjectView) => {
  if (v.importing) return t("Importing…");
  if (v.renders.length) return "EXPORTED";
  const g = openGroup(v.workflow);
  return `${String(GROUPS.findIndex((x) => x.id === g) + 1).padStart(2, "0")}/${String(GROUPS.length).padStart(2, "0")}`;
};

export function Home() {
  useLang();
  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const [picked, setPicked] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [root, setRoot] = useState("");
  const [error, setError] = useState("");
  const [editRoot, setEditRoot] = useState(false);
  const [look, setLook] = useState("");
  const [looks, setLooks] = useState<{ name: string; title: string }[]>([]);
  const pickLook = (name: string) => { setLook(name); api("/settings", { method: "PUT", body: { look: name } }).catch((e) => setError(e.message)); };
  const load = async () => {
    try {
      const list = await api<ProjectView[]>("/projects?full=1");
      // A running old server may still answer with compact rows until its jobs finish.
      const full = list.some(p => !Array.isArray(p.renders)) ? await Promise.all(list.map(p => api<ProjectView>(`/projects/${enc(p.name)}`))) : list;
      setProjects(full);
      setPicked((cur) => cur && full.some((p) => p.name === cur) ? cur : full[0]?.name ?? "");
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => {
    void load();
    api<{ projectsRoot: string; look: string; looks: { name: string; title: string }[] }>("/settings").then((s) => { setRoot(s.projectsRoot); setLook(s.look); setLooks(s.looks); });
    const ev = new EventSource("/api/events");
    ev.onmessage = () => void load();
    return () => ev.close();
  }, []);
  // Deleting moves the folder to the projects folder's .trash: recoverable until emptied by hand.
  const remove = async (name: string) => {
    if (!confirm(uiText(`Delete “${name}”?\n\nIt moves to the .trash folder inside your projects folder: you can still get it back from there.`))) return;
    try { await api(`/projects/${enc(name)}`, { method: "DELETE" }); setPicked(""); await load(); } catch (e) { setError((e as Error).message); }
  };
  const saveRoot = () => api("/settings", { method: "PUT", body: { projectsRoot: root } }).then(() => { setEditRoot(false); void load(); }, (e) => setError(e.message));
  // The sidebar lists every matching project; only three recent previews occupy the centre.
  const shown = (projects ?? []).filter((p) => filter === "All" || (filter === "Exported" ? p.renders.length > 0 : p.renders.length === 0))
    .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
  const recent = shown.slice(0, 3);
  const p = projects?.find((x) => x.name === picked);
  const g = p ? openGroup(p.workflow) : "story";
  const words = p?.takes[0]?.firstWords;
  const keyboardProject = shown.some(x => x.name === picked) ? picked : "";
  useEffect(() => {
    const openSelected = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !keyboardProject) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable], button, a, [role='button']")) return;
      if (document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"], .onboard-root')) return;
      event.preventDefault();
      go(`#/p/${enc(keyboardProject)}`);
    };
    window.addEventListener("keydown", openSelected);
    return () => window.removeEventListener("keydown", openSelected);
  }, [keyboardProject]);
  return (
    <>
      <nav aria-label="Filter" className="subnav">
        {(["All", "In progress", "Exported"] as Filter[]).map((f) => <button key={f} type="button" className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(f)}</button>)}
      </nav>
      {error && <p className="error">{error}</p>}
      <div className="cols projects-cols">
        <section aria-label="Projects" className="list side-list">
          <div className="list-scroll" tabIndex={0} aria-label={t("All projects")}>
          {shown.length === 0 && projects && <p className="note">{t("No projects match this filter.")}</p>}
          {shown.map((x) => (
            <button key={x.name} type="button" className={`row-item${x.name === picked ? " on" : ""}`} onClick={() => setPicked(x.name)} onDoubleClick={() => { location.hash = `#/p/${enc(x.name)}`; }} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.repeat && !event.nativeEvent.isComposing) { event.preventDefault(); go(`#/p/${enc(x.name)}`); }
              }} title={t("Double-click or press Enter to open this project.")} aria-describedby="project-open-help">
              <span>{x.name}</span><span className="mono">{x.ok ? stepLabel(x) : "INVALID"}</span>
            </button>
          ))}
          </div>
          <div className="project-controls">
          <a className="line-btn" href="#/new"><span>{t("NEW PROJECT")}</span><span>+</span></a>
          {p && <button type="button" className="act danger" onClick={() => void remove(p.name)}><span>{t("MOVE TO TRASH")} · {p.name}</span><IconTrash /></button>}
          <DaPicker />
          </div>
        </section>

        <section aria-label="Selected project" className="center">
          <div className="head"><h1>{p?.name ?? "YOUR VIDEOS"}</h1>{p && <span className="mono">{p.renders.length ? "EXPORTED" : `STEP ${stepLabel(p)}`}</span>}</div>
          {shown.length > 0 && <div className="project-open-guide">
            <p id="project-open-help">{t("Choose a project to enter the Studio. Double-click it, or select it and press Enter.")}</p>
            {keyboardProject && <a className="act" href={`#/p/${enc(keyboardProject)}`}>{t("OPEN IN STUDIO")} →</a>}
          </div>}
          <div className="recent">
            {recent.map((x) => (
              <button key={x.name} type="button" className={`rcard${x.name === picked ? " on" : ""}`} onClick={() => setPicked(x.name)} onDoubleClick={() => { location.hash = `#/p/${enc(x.name)}`; }} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.repeat && !event.nativeEvent.isComposing) { event.preventDefault(); go(`#/p/${enc(x.name)}`); }
              }} title={t("Double-click or press Enter to open this project.")} aria-describedby="project-open-help"
                aria-pressed={x.name === picked} aria-label={`${x.name}, ${x.ok ? stepLabel(x) : "invalid"}`}>
                <span className={`frame${x.name === picked ? " lit" : ""}`}><img src={`/api/projects/${enc(x.name)}/thumb`} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /></span>
                <span className="rname"><b>{x.name}</b><span className="mono">{x.ok ? stepLabel(x) : "INVALID"}</span></span>
              </button>
            ))}
            {/* Empty places show what will land there: a video card, and where to start. */}
            {projects && Array.from({ length: Math.max(0, 3 - recent.length) }, (_, i) => (
              <a key={`dummy${i}`} className="rcard dummy" href="#/new" aria-label="New project">
                <span className="frame"><span className="dummy-in"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h11v12H4zM15 10l5-3v10l-5-3" /></svg>
                  <span className="mono">{i === 0 && recent.length === 0 ? "YOUR FIRST VIDEO" : "YOUR NEXT VIDEO"}</span><span className="mono dim">9:16 · DROP YOUR TAKES</span></span></span>
                <span className="rname"><b>New project</b><span className="mono">+</span></span>
              </a>
            ))}
          </div>
          {words && <p className="quote">“{words}”</p>}
        </section>

        <aside aria-label="Status" className="status home-status">
          <div className="h">{t("STATUS")}</div>
          {p && <>
            <div className="kv"><span>Format</span><b>{p.format ?? "?"}</b></div>
            <div className="kv"><span>Duration</span><b>{p.durationMs ? ms(p.durationMs) : "?"}</b></div>
            <div className="kv"><span>Takes</span><b>{p.takes.length}</b></div>
            <div className="kv"><span>Pending proposals</span><b>{p.proposals.filter((x) => x.status === "pending" && x.variants.length).length}</b></div>
            <div className="kv"><span>Last render</span><b>{p.renders[0] ? new Date(p.renders[0].mtime).toLocaleDateString([], { day: "numeric", month: "short" }) : "none"}</b></div>
            <a className="act fill" href={`#/p/${enc(p.name)}`}><span>{t("OPEN IN STUDIO")} · {t(g[0]!.toUpperCase() + g.slice(1)).toUpperCase()}</span><span>→</span></a>
          </>}
          <div className="kv sep"><span>{t("AI")}</span></div>
          <div className="kv claude"><ClaudeBar stamp="home" /></div>
          <div className="kv sep">
            {editRoot ? (
              <input aria-label="Projects folder" value={root} onChange={(e) => setRoot(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveRoot(); if (e.key === "Escape") setEditRoot(false); }} autoFocus />
            ) : (<><span>Folder</span><button type="button" className="link" title={root} onClick={() => setEditRoot(true)}>{root.split(/[\\/]/).pop()} <IconEdit /></button></>)}
          </div>
          {looks.length > 0 && (
            <label className="kv"><span>Look</span>
              <select aria-label="Look applied to every video" value={look} onChange={(e) => pickLook(e.target.value)}>
                <option value="">None</option>
                {looks.map((l) => <option key={l.name} value={l.name}>{l.title}</option>)}
              </select>
            </label>
          )}
          <Keys project={p?.name} />
          <div className="synced">● SYNCED</div>
        </aside>
      </div>
      <footer className="foot"><span className="hint">{t("Select a project, then press Enter to open the Studio.")}</span></footer>
    </>
  );
}
