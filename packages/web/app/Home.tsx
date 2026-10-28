import { useEffect, useState } from "react";
import type { ProjectView } from "../server/types";
import { api, enc, ms } from "./api";
import { t, useLang } from "./i18n";
import { IconEdit, IconTrash } from "./icons";
import { GROUPS, openGroup } from "./steps";

/** The creator's own API keys for the AI: set once, stored on this computer, used before any subscription. */
function Keys() {
  const [k, setK] = useState<{ anthropic: string | null; openai: string | null } | null>(null);
  const [edit, setEdit] = useState<"" | "anthropic" | "openai">("");
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { api<typeof k>("/keys").then(setK, () => {}); }, []);
  const save = async (p: "anthropic" | "openai", v: string) => {
    try { setK(await api<typeof k>("/keys", { method: "PUT", body: { [p]: v } })); setEdit(""); setVal(""); setErr(""); } catch (e) { setErr((e as Error).message); }
  };
  if (!k) return null;
  return (
    <div className="keysbox">
      <div className="kv sep"><span>API KEYS</span><b className="dim">FOR YOUR AI</b></div>
      {(["anthropic", "openai"] as const).map((p) => (
        <div key={p} className="kv">
          <span>{p === "anthropic" ? "Anthropic (Claude)" : "OpenAI (Codex)"}</span>
          {edit === p ? (
            <input type="password" autoFocus aria-label={`${p} API key`} placeholder={p === "anthropic" ? "sk-ant-…" : "sk-…"} value={val} onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(p, val); if (e.key === "Escape") setEdit(""); }} />
          ) : (
            <span className="row tight">
              <button type="button" className="link" onClick={() => { setEdit(p); setVal(""); }}>{k[p] ? `${k[p]} · change` : "add"}</button>
              {k[p] && <button type="button" className="link" aria-label={`Remove the ${p} key`} onClick={() => void save(p, "")}>×</button>}
            </span>
          )}
        </div>
      ))}
      <Desktop />
      {err && <p className="error">{err}</p>}
    </div>
  );
}

/** Use the creator's Claude subscription the allowed way: Adam Studio as a connector of their own Claude Desktop. */
function Desktop() {
  return (
    <>
      <div className="kv sep"><span>OR YOUR SUBSCRIPTION</span><b className="dim">IN THE AI'S OWN APP</b></div>
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
  const shown = (projects ?? []).filter((p) => filter === "All" || (filter === "Exported" ? p.renders.length > 0 : p.renders.length === 0));
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
        <section aria-label="Projects" className="list">
          {shown.map((x) => (
            <button key={x.name} type="button" className={`row-item${x.name === picked ? " on" : ""}`} onClick={() => setPicked(x.name)} onDoubleClick={() => { location.hash = `#/p/${enc(x.name)}`; }}>
              <span>{x.name}</span><span className="mono">{x.ok ? stepLabel(x) : "INVALID"}</span>
            </button>
          ))}
          {projects && shown.length === 0 && <p className="muted">Nothing here.</p>}
          <a className="line-btn" href="#/new"><span>{t("NEW PROJECT")}</span><span>+</span></a>
          {p && <button type="button" className="act danger" onClick={() => void remove(p.name)}><span>{t("MOVE TO TRASH")} · {p.name}</span><IconTrash /></button>}
        </section>

        <section aria-label="Selected project" className="center">
          <div className="head"><h1>{p?.name ?? ""}</h1>{p && <span className="mono">{p.renders.length ? "EXPORTED" : `STEP ${stepLabel(p)}`}</span>}</div>
          <div className="stage">
            {p && <div className={`frame lit${p.format === "16:9" ? " wide" : ""}`}><img src={`/api/projects/${enc(p.name)}/thumb`} alt={`First frame of ${p.name}`} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /></div>}
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
