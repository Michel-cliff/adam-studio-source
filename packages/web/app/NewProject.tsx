import { useEffect, useState } from "react";
import type { FolderView } from "../server/types";
import { api, enc, go } from "./api";
import { IconFolder } from "./icons";

const LANGS = ["auto", "fr", "en", "es", "de", "it", "pt"];
// What the video is: it sets what Adam does on its own (the push on a face, the pauses of a tutorial, cards alone).
const KINDS: [string, string][] = [["facecam", "Face camera"], ["tutorial", "Tutorial"], ["motion", "Motion design"], ["text", "Text only"]];
const leaf = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

function FolderPicker({ picked, setPicked }: { picked: string[]; setPicked: (v: string[]) => void }) {
  const [view, setView] = useState<FolderView | null>(null);
  const [error, setError] = useState("");
  const open = (path?: string) => api<FolderView>(`/fs${path ? `?path=${enc(path)}` : ""}`).then((v) => { setView(v); setError(""); return true; }, (e) => { setError(e.message); return false; });
  // The folder of the last visit, or the drives when it is gone.
  useEffect(() => { const last = localStorage.getItem("adam.lastFolder"); void (last ? open(last).then((ok) => ok || open()) : open()); }, []);
  useEffect(() => { try { if (view?.path) localStorage.setItem("adam.lastFolder", view.path); } catch { /* private mode */ } }, [view?.path]);
  const toggle = (v: string) => setPicked(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]);
  return (
    <section className="picker">
      <div className="row">
        <strong>{view?.path ?? "This PC"}</strong>
        {view && view.parent !== null && <button className="quiet" onClick={() => open(view.parent || undefined)}>Up</button>}
      </div>
      {error && <p className="error">{error}</p>}
      <ul>
        {view?.folders.map((f) => <li key={f}><a href="" onClick={(e) => { e.preventDefault(); open(f); }}><IconFolder /> {leaf(f)}</a></li>)}
        {view?.videos.map((v) => (
          <li key={v}><label><input type="checkbox" checked={picked.includes(v)} onChange={() => toggle(v)} /> {leaf(v)}</label></li>
        ))}
        {view && view.folders.length + view.videos.length === 0 && <li className="muted">No folder or video here.</li>}
      </ul>
      {view?.videos.length ? <button className="quiet" onClick={() => setPicked([...new Set([...picked, ...view.videos])])}>Pick all videos here</button> : null}
    </section>
  );
}

/** Videos dropped from the computer: copied into the projects folder's rushes, then picked like the others. */
function DropRushes({ onAdd }: { onAdd: (paths: string[]) => void }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const take = async (files: FileList) => {
    setOver(false); setError("");
    const videos = Array.from(files).filter((f) => /\.(mp4|mov|mkv|m4v|avi|webm)$/i.test(f.name));
    if (!videos.length) { setError("Drop video files (mp4, mov, mkv, m4v, avi, webm)."); return; }
    const added: string[] = [];
    for (const [i, f] of videos.entries()) {
      setBusy(`COPYING ${i + 1} / ${videos.length} · ${f.name}`);
      try {
        const r = await fetch(`/api/rushes?name=${enc(f.name)}`, { method: "POST", body: f });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        added.push(j.path);
      } catch (e) { setError(`${f.name}: ${(e as Error).message}`); }
    }
    setBusy("");
    if (added.length) onAdd(added);
  };
  return (
    <div className={`rushdrop${over ? " over" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); void take(e.dataTransfer.files); }}>
      <span className="mono">{busy || "OR DROP YOUR VIDEOS HERE"}</span>
      <label className="link">browse<input type="file" accept="video/*" multiple hidden onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = ""; }} /></label>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function NewProject({ addTo }: { addTo?: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  // No name yet: the first video picked names the project (the creator can change it).
  useEffect(() => {
    if (addTo || name.trim() || !picked[0]) return;
    setName(leaf(picked[0]).replace(/\.[^.]+$/, "").replace(/[<>:"/\|?*]/g, " ").trim().slice(0, 60));
  }, [picked]);
  const [format, setFormat] = useState("9:16");
  const [kind, setKind] = useState("facecam");
  const [script, setScript] = useState("");
  const text = !addTo && kind === "text";
  const [lang, setLang] = useState("fr");
  const [series, setSeries] = useState("");
  const [allSeries, setAllSeries] = useState<{ name: string; error?: string }[]>([]);
  useEffect(() => { api<{ name: string; error?: string }[]>("/series").then(setAllSeries, () => {}); }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const body = { videos: picked, lang: lang === "auto" ? undefined : lang };
      const project = addTo ?? name.trim();
      const { job } = text
        ? await api<{ job: { id: string } }>("/projects", { method: "POST", body: { name: project, video: "text", script } })
        : addTo
        ? await api<{ job: { id: string } }>(`/projects/${enc(addTo)}/add`, { method: "POST", body })
        : await api<{ job: { id: string } }>("/projects", { method: "POST", body: { ...body, name: project, format, video: kind, series: series || undefined } });
      go(`#/p/${enc(project)}/job/${job.id}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <h1>{addTo ? `Add rushes to ${addTo}` : "New video"}</h1>
      {!addTo && (
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
          <select aria-label="Kind of video" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {!text && <select value={format} onChange={(e) => setFormat(e.target.value)}><option>9:16</option><option>16:9</option></select>}
          {allSeries.length > 0 && (
            <select value={series} onChange={(e) => setSeries(e.target.value)}>
              <option value="">No series</option>
              {allSeries.filter((s) => !s.error).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          )}
        </div>
      )}
      {text ? (
        <section className="script-in">
          <textarea aria-label="Script" value={script} onChange={(e) => setScript(e.target.value)} rows={12}
            placeholder={"One line, one card.\n73 % of creators stop before their tenth video\nTalent vs habit\nWhat keeps them going:\n- a fixed day\n- a short format\n« Done is better than perfect » - Sheryl Sandberg\nConsistency"} />
          <p className="mono note">A NUMBER, A « QUOTE », A VS B, A LIST WITH - , ONE WORD: EACH LINE'S SHAPE PICKS ITS CARD. YOUR WORDS ARE NEVER CHANGED.</p>
        </section>
      ) : <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span>Language</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map((l) => <option key={l}>{l}</option>)}</select>
      </div>
      <FolderPicker picked={picked} setPicked={setPicked} />
      <DropRushes onAdd={(paths) => setPicked([...new Set([...picked, ...paths])])} />
      {picked.length > 0 && (
        <section>
          <strong>{picked.length} video{picked.length === 1 ? "" : "s"} picked</strong>
          <ul>{picked.map((p) => <li key={p}>{p} <button className="quiet" onClick={() => setPicked(picked.filter((x) => x !== p))}>Remove</button></li>)}</ul>
        </section>
      )}
      </>}
      {error && <p className="error">{error}</p>}
      {!busy && !text && (picked.length === 0 || (!addTo && !name.trim())) && <p className="mono note">{picked.length === 0 ? "PICK OR DROP AT LEAST ONE VIDEO." : "GIVE THE PROJECT A NAME (TOP OF THE PAGE)."}</p>}
      {text
        ? <button disabled={busy || !script.trim() || !name.trim()} onClick={submit}>Lay out the cards</button>
        : <button disabled={busy || picked.length === 0 || (!addTo && !name.trim())} onClick={submit}>{addTo ? "Add and analyze" : "Create and analyze"}</button>}
    </>
  );
}
