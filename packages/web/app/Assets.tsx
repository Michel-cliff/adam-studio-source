import { useEffect, useState } from "react";
import type { ProjectView } from "../server/types";
import { api, enc, fileUrl, uploadFile } from "./api";

type Local = { path: string; rel: string; kind: string; title: string; durationMs?: number; thumb?: string };
type Online = { source: string; kind: string; title: string; url: string; preview: string; page: string; license: string; creator: string };
type Tab = "video" | "inspiration" | "online";
const KINDS = ["image", "video", "audio", "lottie", "font"];
const libFile = (path: string) => `/api/library/file?path=${enc(path)}`;

/** How an asset is named to Claude in the prompt. */
export const mention = (a: { id: string; kind: string }) => `Use the ${a.kind} asset "${a.id}".`;

function Thumb({ kind, src, title }: { kind: string; src: string; title: string }) {
  if (kind === "image") return <img className="athumb" src={src} alt={title} loading="lazy" />;
  if (kind === "video") return <video className="athumb" src={src} muted preload="metadata" aria-label={title} />;
  if (kind === "audio") return <audio controls preload="none" src={src} style={{ width: "100%" }} aria-label={title} />;
  return <div className="athumb none">{kind}</div>;
}

/** Drops files into a project: Inspiration/Uploads keeps a copy, the project gets the asset. */
export async function dropInto(files: FileList | File[], project: string): Promise<{ added: { id: string; kind: string }[]; errors: string[] }> {
  const added: { id: string; kind: string }[] = [], errors: string[] = [];
  for (const f of Array.from(files)) {
    try { const r = await uploadFile(f, project); if (r.imported) added.push(r.imported); }
    catch (e) { errors.push(`${f.name}: ${(e as Error).message}`); }
  }
  return { added, errors };
}

/** The asset window of the studio: this video's assets, the Inspiration folder and free online libraries, without leaving the edit. */
export function AssetsPanel({ name, view, onClose, onMention, onChanged }: {
  name: string; view: ProjectView; onClose: () => void; onMention: (text: string) => void; onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>(view.assets.length ? "video" : "inspiration");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("image");
  const [local, setLocal] = useState<Local[]>([]);
  const [online, setOnline] = useState<Online[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const search = async () => {
    setBusy(true); setNote("");
    try {
      const r = await api<{ local: Local[]; online: Online[]; notes: string[] }>(`/library/search?q=${enc(q)}&kind=${tab === "online" ? kind : ""}&online=${tab === "online" && q ? 1 : 0}`);
      setLocal(r.local); setOnline(r.online);
      if (r.notes.length) setNote(r.notes.join(" "));
    } catch (e) { setNote((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => { if (tab === "inspiration") void search(); }, [tab]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, []);

  const use = async (source: Record<string, unknown>) => {
    setNote("Adding…");
    try {
      const r = await api<{ imported: { id: string; kind: string } ; message?: string }>("/library/import", { method: "POST", body: { project: name, source } });
      setNote(r.message ?? `Added "${r.imported.id}" to ${name}.`);
      onMention(mention(r.imported));
      onChanged();
    } catch (e) { setNote((e as Error).message); }
  };
  // Both are recoverable: an Inspiration file goes to its .trash, a video's asset file to the project's .trash.
  const deleteFile = async (i: Local) => {
    if (!confirm(`Delete “${i.title}” from your Inspiration folder?\n\nIt moves to the folder's .trash.`)) return;
    try { await api(`/library/file?path=${enc(i.path)}`, { method: "DELETE" }); setNote(`${i.title} moved to the trash.`); await search(); }
    catch (e) { setNote((e as Error).message); }
  };
  const removeAsset = async (id: string) => {
    if (!confirm(`Remove “${id}” from ${name}?\n\nIts file moves to the project's .trash.`)) return;
    try { await api(`/projects/${enc(name)}/assets/${enc(id)}`, { method: "DELETE" }); setNote(`${id} removed from this video.`); onChanged(); }
    catch (e) { setNote((e as Error).message); }
  };
  const drop = async (files: FileList) => {
    setOver(false); setNote("Uploading…");
    const r = await dropInto(files, name);
    for (const a of r.added) onMention(mention(a));
    setNote([r.added.length ? `Added ${r.added.map((a) => `"${a.id}"`).join(", ")} to ${name}, and named in your prompt.` : "", ...r.errors].filter(Boolean).join(" "));
    if (r.added.length) { onChanged(); setTab("video"); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`win modal assets${over ? " over" : ""}`} role="dialog" aria-modal="true" aria-label="Assets" onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); void drop(e.dataTransfer.files); }}>
        <div className="bar"><span className="t">assets.exe · {name}</span><button className="ghost" style={{ color: "#fff", padding: "2px 6px" }} aria-label="Close" onClick={onClose}>×</button></div>
        <div className="body">
          <div className="row" style={{ marginBottom: 12 }}>
            <div role="tablist" className="tabs">
              <button role="tab" aria-selected={tab === "video"} className={tab === "video" ? "on" : ""} onClick={() => setTab("video")}>This video ({view.assets.length})</button>
              <button role="tab" aria-selected={tab === "inspiration"} className={tab === "inspiration" ? "on" : ""} onClick={() => setTab("inspiration")}>Inspiration</button>
              <button role="tab" aria-selected={tab === "online"} className={tab === "online" ? "on" : ""} onClick={() => setTab("online")}>Online</button>
            </div>
            <span className="spacer" />
            <label className="button quiet" style={{ cursor: "pointer" }}>
              Add files
              <input type="file" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) void drop(e.target.files); }} />
            </label>
          </div>
          {tab !== "video" && (
            <div className="row" style={{ marginBottom: 12 }}>
              <input aria-label="Search" placeholder={tab === "online" ? "Search free libraries (e.g. whoosh, city night)" : "Search your Inspiration folder"} value={q}
                onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }} style={{ flex: 1, minWidth: 200 }} />
              {tab === "online" && <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.filter((k) => k !== "font" && k !== "lottie").map((k) => <option key={k}>{k}</option>)}</select>}
              <button disabled={busy} onClick={search}>Search</button>
            </div>
          )}
          {note && <p className="muted" style={{ marginTop: 0 }}>{note}</p>}
          <div className="agrid">
            {tab === "video" && view.assets.map((a) => (
              <div className="aitem" key={a.id}>
                <Thumb kind={a.kind} src={fileUrl(name, a.path)} title={a.id} />
                <b>{a.id}</b><span className="muted">{a.kind}</span>
                <button className="quiet" onClick={() => onMention(mention(a))}>Name it to Claude</button>
                <button className="ghost" onClick={() => removeAsset(a.id)}>Remove from this video</button>
              </div>
            ))}
            {tab === "inspiration" && local.map((i) => (
              <div className="aitem" key={i.path}>
                <Thumb kind={i.kind} src={libFile(i.kind === "video" && i.thumb ? i.thumb : i.path)} title={i.title} />
                <b>{i.title}</b><span className="muted">{i.kind}{i.durationMs ? ` · ${(i.durationMs / 1000).toFixed(1)} s` : ""}</span>
                <button onClick={() => use({ path: i.path, kind: i.kind, title: i.title })}>Use in this video</button>
                <button className="ghost" onClick={() => deleteFile(i)}>Delete</button>
              </div>
            ))}
            {tab === "online" && online.map((i) => (
              <div className="aitem" key={i.url}>
                <Thumb kind={i.kind === "video" ? "image" : i.kind} src={i.kind === "audio" ? i.url : i.preview} title={i.title} />
                <b>{i.title.slice(0, 50)}</b><span className="muted">{i.source} · {i.license}</span>
                <button onClick={() => use({ url: i.url, kind: i.kind, title: i.title, license: i.license, creator: i.creator, page: i.page })}>Use in this video</button>
              </div>
            ))}
          </div>
          {tab === "video" && view.assets.length === 0 && <p className="muted">Nothing imported yet. Pick from Inspiration or online, or drop files here.</p>}
          {tab === "inspiration" && local.length === 0 && !busy && <p className="muted">Nothing found in your Inspiration folder.</p>}
          <div className="dropzone">Drop images, videos, sounds, fonts or Lottie files anywhere in this window: they go to this video and to your Inspiration folder.</div>
        </div>
      </div>
    </div>
  );
}
