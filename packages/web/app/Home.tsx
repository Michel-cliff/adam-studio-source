import { useEffect, useState } from "react";
import type { ProjectView } from "../server/types";
import { api, enc, ms } from "./api";
import { t, useLang } from "./i18n";
import { IconEdit, IconTrash } from "./icons";
import { LibraryKeys } from "./Setup";
import { GROUPS, openGroup } from "./steps";

/** The library keys, then the AI apps the studio plugs into. */
function Keys() {
  return <div className="keysbox"><LibraryKeys /><Desktop /></div>;
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
  useEffect(() => { api<typeof s>(`/connect/${path}`).then(setS, () => {}); }, []);
  const connect = async () => { try { setS(await api<typeof s>(`/connect/${path}`, { method: "POST" })); setErr(""); } catch (e) { setErr((e as Error).message); } };
  if (!s) return null;
  return (
    <>
      <div className="kv">
        <span>{name}</span>
        {s.connected ? <b className="ok" title={`Quit and reopen ${name} once, then ask it about your Adam Studio projects.`}>CONNECTED · RESTART IT</b>
          : s.app ? <button type="button" className="link" onClick={() => void connect()}>connect</button>
          : <a href={install} target="_blank" rel="noreferrer">install it</a>}
      </div>
      {err && <p className="error">{err}</p>}
    </>
  );
}

type Filter = "All" | "In progress" | "Exported";
const stepLabel = (v: ProjectView) => {
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
      const list = await api<{ name: string }[]>("/projects");
      const full = await Promise.all(list.map((p) => api<ProjectView>(`/projects/${enc(p.name)}`).catch(() => ({ name: p.name, ok: false, takes: [], renders: [], proposals: [], jobs: [], workflow: null, durationMs: null, assets: [] }) as ProjectView)));
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
    if (!confirm(`Delete “${name}”?\n\nIt moves to the .trash folder inside your projects folder: you can still get it back from there.`)) return;
    try { await api(`/projects/${enc(name)}`, { method: "DELETE" }); setPicked(""); await load(); } catch (e) { setError((e as Error).message); }
  };
  const saveRoot = () => api("/settings", { method: "PUT", body: { projectsRoot: root } }).then(() => { setEditRoot(false); void load(); }, (e) => setError(e.message));
  // Most recent first: the three latest take the centre, the others stay in the side list.
  const shown = (projects ?? []).filter((p) => filter === "All" || (filter === "Exported" ? p.renders.length > 0 : p.renders.length === 0))
    .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
  const recent = shown.slice(0, 3), older = shown.slice(3);
  const p = projects?.find((x) => x.name === picked);
  const g = p ? openGroup(p.workflow) : "story";
  const words = p?.takes[0]?.firstWords;
  return (
    <>
      <nav aria-label="Filter" className="subnav">
        {(["All", "In progress", "Exported"] as Filter[]).map((f) => <button key={f} type="button" className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(f)}</button>)}
      </nav>
      {error && <p className="error">{error}</p>}
      <div className="cols projects-cols">
        <section aria-label="Projects" className="list side-list">
          <div className="list-scroll">
          {older.length === 0 && projects && <p className="note">{shown.length > 3 ? "" : "OLDER PROJECTS LAND HERE, THE THREE LATEST STAY IN THE CENTRE."}</p>}
          {older.map((x) => (
            <button key={x.name} type="button" className={`row-item${x.name === picked ? " on" : ""}`} onClick={() => setPicked(x.name)} onDoubleClick={() => { location.hash = `#/p/${enc(x.name)}`; }}>
              <span>{x.name}</span><span className="mono">{x.ok ? stepLabel(x) : "INVALID"}</span>
            </button>
          ))}
          </div>
          <a className="line-btn" href="#/new"><span>{t("NEW PROJECT")}</span><span>+</span></a>
          {p && <button type="button" className="act danger" onClick={() => void remove(p.name)}><span>{t("MOVE TO TRASH")} · {p.name}</span><IconTrash /></button>}
        </section>

        <section aria-label="Selected project" className="center">
          <div className="head"><h1>{p?.name ?? "YOUR VIDEOS"}</h1>{p && <span className="mono">{p.renders.length ? "EXPORTED" : `STEP ${stepLabel(p)}`}</span>}</div>
          <div className="recent">
            {recent.map((x) => (
              <button key={x.name} type="button" className={`rcard${x.name === picked ? " on" : ""}`} onClick={() => setPicked(x.name)} onDoubleClick={() => { location.hash = `#/p/${enc(x.name)}`; }}
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

        <aside aria-label="Status" className="status">
          <div className="h">{t("STATUS")}</div>
          {p && <>
            <div className="kv"><span>Format</span><b>{p.format ?? "?"}</b></div>
            <div className="kv"><span>Duration</span><b>{p.durationMs ? ms(p.durationMs) : "?"}</b></div>
            <div className="kv"><span>Takes</span><b>{p.takes.length}</b></div>
            <div className="kv"><span>Pending proposals</span><b>{p.proposals.filter((x) => x.status === "pending" && x.variants.length).length}</b></div>
            <div className="kv"><span>Last render</span><b>{p.renders[0] ? new Date(p.renders[0].mtime).toLocaleDateString([], { day: "numeric", month: "short" }) : "none"}</b></div>
            <a className="act fill" href={`#/p/${enc(p.name)}`}><span>{t("OPEN IN STUDIO")} · {t(g[0]!.toUpperCase() + g.slice(1)).toUpperCase()}</span><span>→</span></a>
          </>}
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
          <Keys />
          <div className="synced">● SYNCED</div>
        </aside>
      </div>
      <footer className="foot"><span className="hint">{t("Select a project.")}</span></footer>
    </>
  );
}
