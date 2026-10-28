import { useEffect, useState } from "react";
import type { ProjectListItem } from "../server/types";
import { api, enc } from "./api";
import { t, useLang } from "./i18n";

type Local = { path: string; rel: string; kind: string; title: string; notes: string; durationMs?: number; thumb?: string };
type Online = { source: string; kind: string; title: string; url: string; preview: string; page: string; license: string; creator: string };
const KINDS = ["", "video", "image", "audio", "font", "lottie"];
type Folder = { id: string; title: string; count: number };
const fileUrl = (path: string) => `/api/library/file?path=${enc(path)}`;
// How Claude uses each folder.
const READS: Record<string, string> = { typo: "as fonts", interdits: "as rules", sons: "as material", "images-textures-palettes": "as material" };

// What each reference folder holds, shown as placeholders while it is empty.
const DUMMIES: Record<string, [string, string][]> = {
  typo: [["Aa", "Your title font"], ["Aa", "Your caption font"], ["Aa", "An accent font"]],
  plans: [["▭", "A close-up you like"], ["▭", "A wide shot"], ["▶", "A camera move"]],
  "sous-titres": [["Ab", "A caption style"], ["▶", "Animated words"], ["Ab", "A highlight colour"]],
  "images-textures-palettes": [["▦", "A texture"], ["●●●", "Your palette"], ["▭", "An image to reuse"]],
  sons: [["♪", "A music bed"], ["▮▯▮", "A click or whoosh"], ["▮▮▯", "A zoom sound"]],
  interdits: [["✕", "A look you never want"], ["✕", "An effect to avoid"]],
  other: [["▭", "Anything to sort later"]],
};

function Thumb({ kind, src, title }: { kind: string; src: string; title: string }) {
  if (kind === "audio") return <audio controls preload="none" src={src} />;
  if (kind === "image" || kind === "video") return <img src={src} alt="" loading="lazy" />;
  return <span className="glyph">{kind === "font" ? "Aa" : title.slice(0, 2)}</span>;
}

export function Library() {
  useLang();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [online, setOnline] = useState(false);
  const [result, setResult] = useState<{ root: string; local: Local[]; online: Online[]; notes: string[] } | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [project, setProject] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState("");
  const [over, setOver] = useState(false);
  const loadFolders = () => api<{ folders: Folder[] }>("/library/folders").then((f) => { setFolders(f.folders); setFolder((cur) => cur || f.folders[0]?.id || ""); }).catch(() => undefined);
  useEffect(() => { api<ProjectListItem[]>("/projects").then((p) => { setProjects(p); setProject(p[0]?.name ?? ""); }); void loadFolders(); }, []);
  useEffect(() => { if (folder) void search(); }, [folder]);
  // A file dropped on a folder (the open one by default) lands in that folder of the Inspiration folder.
  const drop = async (files: FileList, into = folder) => {
    setOver(false);
    for (const f of Array.from(files)) {
      try { await fetch(`/api/library/upload?name=${enc(f.name)}&category=${enc(into)}`, { method: "POST", body: f }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? r.statusText); }); }
      catch (e) { setMsg(`${f.name}: ${(e as Error).message}`); return; }
    }
    setMsg(`${files.length} file${files.length > 1 ? "s" : ""} added to ${folders.find((x) => x.id === into)?.title ?? into}.`);
    await loadFolders(); await search();
  };
  // A file of the drawer dragged onto another folder's tab moves there, with its notes.
  const DRAG = "application/x-adam-library";
  const [target, setTarget] = useState("");
  // Only files from outside the library can be dropped in: one already in a folder moves by its tab instead.
  const fromOutside = (e: React.DragEvent) => e.dataTransfer.types.includes("Files") && !e.dataTransfer.types.includes(DRAG);
  const move = async (path: string, into: string) => {
    try {
      await api("/library/move", { method: "POST", body: { path, category: into } });
      setMsg(`Moved to ${folders.find((x) => x.id === into)?.title ?? into}.`);
      await loadFolders(); await search();
    } catch (e) { setMsg((e as Error).message); }
  };
  const onTab = (id: string) => ({
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(DRAG) || fromOutside(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setTarget(id); } },
    onDragLeave: () => setTarget((t) => (t === id ? "" : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setTarget("");
      const path = e.dataTransfer.getData(DRAG);
      if (path) { if (id !== folder) void move(path, id); }
      else if (e.dataTransfer.files.length) void drop(e.dataTransfer.files, id);
    },
  });
  async function search() {
    setBusy(true);
    try { setResult(await api(`/library/search?q=${enc(q)}&kind=${kind}&category=${enc(folder)}&online=${online && kind ? 1 : 0}`)); setMsg(""); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  const add = async (source: Record<string, unknown>) => {
    try { const r = await api<{ imported: { id: string; path: string }; message?: string }>("/library/import", { method: "POST", body: { project, source } }); setMsg(r.message ?? `Added to ${project} as "${r.imported.id}".`); }
    catch (e) { setMsg((e as Error).message); }
  };
  // Deleting moves the file (and its notes) to the Inspiration folder's .trash: recoverable.
  const remove = async (i: Local) => {
    if (!confirm(`Delete “${i.title}”?\n\nIt moves to the .trash folder of your Inspiration folder.`)) return;
    try { await api(`/library/file?path=${enc(i.path)}`, { method: "DELETE" }); setMsg(`${i.title} moved to the trash.`); await search(); await loadFolders(); }
    catch (e) { setMsg((e as Error).message); }
  };
  const cur = folders.find((f) => f.id === folder);
  const ROW = 31;
  return (
    <>
      <div className="cols library-cols">
        <section aria-label="Reference folders" className="cabinet">
          <div role="tablist" aria-label="Folders" className="ftabs" style={{ height: Math.max(0, folders.length - 1) * ROW + 40 }}>
            {folders.map((f, i) => (
              <span key={f.id}>
                <span className="sheet" aria-hidden="true" style={{ top: i * ROW + 38, zIndex: i * 2 }} />
                <button type="button" role="tab" aria-selected={f.id === folder} className={`ftab${i % 2 ? " right" : ""}${f.id === folder ? " on" : ""}${f.id === "interdits" ? " donts" : ""}${target === f.id ? " target" : ""}`}
                  style={{ top: i * ROW, zIndex: i * 2 + 1 }} onClick={() => setFolder(f.id)} {...onTab(f.id)}>
                  <span className="in"><span>{String(i + 1).padStart(3, "0")}</span><span>{f.title}</span><span className="n">{f.count}</span></span>
                </button>
              </span>
            ))}
          </div>
          <div role="tabpanel" aria-label={cur?.title} className={`drawer${over ? " over" : ""}`}
            onDragOver={(e) => { if (fromOutside(e)) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); void drop(e.dataTransfer.files); }}>
            {result && result.local.length === 0 && <p className="mono note">EMPTY. DROP FILES HERE: A .TXT NEXT TO A FILE ADDS NOTES.</p>}
            {/* An empty folder shows what belongs in it, where it will sit. */}
            {result && result.local.length === 0 && (
              <div className="items">
                {(DUMMIES[folder] ?? DUMMIES.other!).map(([kind, label]) => (
                  <figure key={label} className="item dummy"><div className="pic"><span className="glyph">{kind}</span></div><figcaption>{label}<br /><span className="dim">example</span></figcaption></figure>
                ))}
              </div>
            )}
            {result && result.local.length > 0 && <p className="mono note">DRAG A FILE ONTO ANOTHER FOLDER TO MOVE IT.</p>}
            <div className="items">
              {result?.local.map((i) => (
                <figure key={i.path} className="item" title={i.notes || i.rel} draggable
                  onDragStart={(e) => { e.dataTransfer.setData(DRAG, i.path); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setTarget("")}>
                  <div className="pic"><Thumb kind={i.kind} title={i.title} src={i.kind === "video" && i.thumb ? fileUrl(i.thumb) : fileUrl(i.path)} /></div>
                  <figcaption>{i.title}<br /><span className="dim">{i.kind}{i.durationMs ? ` · ${(i.durationMs / 1000).toFixed(1)} s` : ""}</span></figcaption>
                  <div className="acts">
                    <button type="button" className="link" disabled={!project} onClick={() => add({ path: i.path, kind: i.kind, title: i.title })}>+ {project}</button>
                    <button type="button" className="link" aria-label={`Delete ${i.title}`} onClick={() => remove(i)}>×</button>
                  </div>
                </figure>
              ))}
            </div>
            {result && result.online.length > 0 && <div className="h mono">ONLINE</div>}
            {result?.notes.map((n) => <p key={n} className="mono note">{n}</p>)}
            <div className="items">
              {result?.online.map((i) => (
                <figure key={i.url} className="item" title={`${i.source} · ${i.license} · ${i.creator}`}>
                  <div className="pic"><Thumb kind={i.kind === "video" ? "image" : i.kind} title={i.title} src={i.kind === "audio" ? i.url : i.preview} /></div>
                  <figcaption>{i.title.slice(0, 50)}<br /><span className="dim">{i.source} · {i.license} · <a href={i.page} target="_blank" rel="noreferrer">source</a></span></figcaption>
                  <div className="acts"><button type="button" className="link" disabled={!project} onClick={() => add({ url: i.url, kind: i.kind, title: i.title, license: i.license, creator: i.creator, page: i.page })}>+ {project}</button></div>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <aside aria-label="Use" className="status">
          <div className="h">{(cur?.title ?? "").toUpperCase()}</div>
          <div className="kv"><span>Files</span><b>{cur?.count ?? 0}</b></div>
          <div className="kv"><span>Folder</span><b>references/{folder}</b></div>
          <div className="kv"><span>Your AI reads it</span><b>{READS[folder] ?? "as references"}</b></div>
          <label htmlFor="lib-q" className="h small">{t("SEARCH THIS FOLDER")}</label>
          <input id="lib-q" placeholder="yellow, grain, whoosh…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }} />
          <div className="kv"><span>Kind</span><select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{k || "any"}</option>)}</select></div>
          <label className="kv"><span>Online too</span><input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /></label>
          {online && !kind && <p className="mono note">PICK A KIND TO SEARCH ONLINE.</p>}
          <button type="button" className="act" disabled={busy} onClick={search}>SEARCH</button>
          <div className="kv"><span>Add to</span><select aria-label="Project to add to" value={project} onChange={(e) => setProject(e.target.value)}>{projects.map((p) => <option key={p.name}>{p.name}</option>)}</select></div>
          <div className={`dropzone${over ? " over" : ""}`} onDragOver={(e) => { if (fromOutside(e)) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); void drop(e.dataTransfer.files); }}>
            {t("DROP FILES HERE")}<br />→ {(cur?.title ?? "").toUpperCase()}
          </div>
          {msg && <p className="mono note">{msg}</p>}
          <div className="synced plain">ONLINE: PIXABAY · FREESOUND</div>
        </aside>
      </div>
      <footer className="foot"><span className="hint">{t("Click a folder to open it.")}</span></footer>
    </>
  );
}
