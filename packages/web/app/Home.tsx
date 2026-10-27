import { useEffect, useState } from "react";
import type { ProjectListItem } from "../server/types";
import { api, enc } from "./api";
import { IconEdit, IconTrash } from "./icons";

type Item = ProjectListItem & { steps?: Record<string, string> };
// The art direction's halftone keyboards, if they are on this machine (public/da, not in git).
const FALLBACK = ["/da/kb-blue.webp", "/da/kb-yellow.webp", "/da/kb-pink.webp"];

export function Home() {
  const [projects, setProjects] = useState<Item[] | null>(null);
  const [root, setRoot] = useState("");
  const [error, setError] = useState("");
  const [editRoot, setEditRoot] = useState(false);
  const [hand, setHand] = useState(true);
  const [look, setLook] = useState("");
  const [looks, setLooks] = useState<{ name: string; title: string }[]>([]);
  const pickLook = (name: string) => { setLook(name); api("/settings", { method: "PUT", body: { look: name } }).catch((e) => setError(e.message)); };
  const load = async () => {
    try {
      const list = await api<Item[]>("/projects");
      // The workflow of each project gives the progress dots.
      const full = await Promise.all(list.map(async (p) => {
        try { const v = await api<{ workflow: { steps: Record<string, string> } | null }>(`/projects/${enc(p.name)}`); return { ...p, steps: v.workflow?.steps }; } catch { return p; }
      }));
      setProjects(full);
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
    try { await api(`/projects/${enc(name)}`, { method: "DELETE" }); await load(); } catch (e) { setError((e as Error).message); }
  };
  const saveRoot = () => api("/settings", { method: "PUT", body: { projectsRoot: root } }).then(() => { setEditRoot(false); void load(); }, (e) => setError(e.message));
  return (
    <>
      <div className="home-hero">
        {/* The hand hangs from the D itself, so its forearm always ends on the D's bottom edge. */}
        <h1 className="big">THE STU<span className="d">D{hand && <img src="/da/hand.png" alt="" onError={() => setHand(false)} />}</span>IO</h1>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="projects">
        <a className="pwrap" href="#/new">
          <span className="lbl">New video</span>
          <span className="pcard new" aria-hidden="true">+</span>
        </a>
        {projects?.map((p, i) => (
          <div key={p.name} className="pslot">
            <a className="pwrap" href={`#/p/${enc(p.name)}`}>
              <span className="lbl">{p.name}</span>
              <span className={`pcard c${i % 3}`}>
                <span className="thumb" style={{ backgroundImage: `url(/api/projects/${enc(p.name)}/thumb), url(${FALLBACK[i % 3]})` }} />
                {p.steps && <span className="dots">{Object.values(p.steps).map((s, k) => <i key={k} className={s} />)}</span>}
                {!p.ok && <span className="err">invalid project.json</span>}
              </span>
              <span className="meta">{p.format} · {p.takes} take{p.takes === 1 ? "" : "s"}{p.lastRender ? " · rendered" : ""}</span>
            </a>
            <button className="pdel" aria-label={`Delete ${p.name}`} title="Move to the trash" onClick={() => void remove(p.name)}><IconTrash /></button>
          </div>
        ))}
      </div>
      <div className="folder">
        {editRoot ? (
          <>
            <label htmlFor="root">Projects folder:</label>
            <input id="root" value={root} onChange={(e) => setRoot(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveRoot(); }} />
            <button className="quiet" style={{ padding: "6px 10px", boxShadow: "none" }} onClick={saveRoot}>Save</button>
          </>
        ) : (
          <>
            <span>Projects folder: {root}</span>
            <button aria-label="Change the projects folder" onClick={() => setEditRoot(true)}><IconEdit /></button>
          </>
        )}
      </div>
      {/* The look Claude applies to every video: a folder of Inspiration/looks, organised like a skill. */}
      {looks.length > 0 && (
        <label className="folder look">
          <span>Look:</span>
          <select aria-label="Look applied to every video" value={look} onChange={(e) => pickLook(e.target.value)}>
            <option value="">None</option>
            {looks.map((l) => <option key={l.name} value={l.name}>{l.title}</option>)}
          </select>
        </label>
      )}
    </>
  );
}
