import { useEffect, useState } from "react";
import { api, enc, go } from "./api";
import { t, useLang } from "./i18n";

type DA = { reference?: { summary: string; guidance: string[]; uncertainties: string[]; sources: { name: string }[] }; notes?: string };
type State = { da: DA; list: { active: string; names: string[] } };

/** The two entrances share the same named profiles and the same renderer style layer. */
export function DaSpace() {
  useLang();
  const [state, setState] = useState<State | null>(null);
  const [mode, setMode] = useState<"import" | "guided">("import");
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const refresh = async () => { const s = await api<State>("/da"); setState(s); setNotes(s.da.notes ?? ""); };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    api<{ name: string; ok: boolean }[]>("/projects").then((r) => {
      const names = r.filter((p) => p.ok).map((p) => p.name); setProjects(names); setProject(names[0] ?? "");
    }, (e) => setError(e.message));
  }, []);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => { if (busy) e.preventDefault(); };
    addEventListener("beforeunload", leave); return () => removeEventListener("beforeunload", leave);
  }, [busy]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); setProgress(""); } };
  const dismiss = async () => { await api("/da/onboarding", { method: "POST", body: {} }); go("#/"); };
  const remove = () => {
    if (!state || state.list.active === "default") return;
    const name = state.list.active;
    if (!confirm(`${t("Delete this art direction?")} ${name}\n${t("Your videos and projects will be kept.")}`)) return;
    void run(async () => { await api(`/da/${enc(name)}`, { method: "DELETE" }); await refresh(); });
  };
  const start = () => run(async () => {
    if (mode === "guided") {
      await api("/da/new", { method: "POST", body: { name, copy: false } });
      await api("/da/onboarding", { method: "POST", body: {} });
      go(`#/p/${enc(project)}/da`); return;
    }
    const ids: string[] = [];
    for (const [i, file] of files.entries()) {
      setProgress(`${t("Uploading references")} ${i + 1} / ${files.length}`);
      const r = await fetch(`/api/da/references?name=${enc(file.name)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
      const body = await r.json(); if (!r.ok) throw new Error(body.error); ids.push(body.id);
    }
    setProgress(t("Analysing your visual identity… Keep this page open."));
    await api("/da/import", { method: "POST", body: { name, ids } });
    await refresh(); setFiles([]); setName("");
  });
  return <>
    <div className="head"><h1>{t("YOUR ART DIRECTION")}</h1><a className="link" href="#/" onClick={(e) => { if (busy) e.preventDefault(); }}>{t("PROJECTS")}</a></div>
    <div className="da-space">
      <header className="da-intro"><div>        <h2>{t("Bring your style to Adam")}</h2>
        <p>{t("Use your existing visual identity or build a new one step by step.")}</p>
        </div><fieldset disabled={busy}>
          <legend>{t("Where do you want to start?")}</legend>
          <div className="da-entry">
            <button className={`act${mode === "import" ? " fill" : ""}`} aria-pressed={mode === "import"} onClick={() => setMode("import")}>{t("I already have an art direction")}</button>
            <button className={`act${mode === "guided" ? " fill" : ""}`} aria-pressed={mode === "guided"} onClick={() => setMode("guided")}>{t("Create mine from scratch")}</button>
          </div></fieldset>
</header>
      <section className="da-create">
        <fieldset disabled={busy}>
          <label>{t("Name of the art direction")}<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("Name")} /></label>
          {mode === "import" ? <>
            <p>{t("Choose 3 to 5 of your finished videos that share the same style. Adam analyses recurring visual choices and creates a new art direction.")}</p>
            <label className="da-drop">{t("Reference videos")}<input type="file" multiple accept=".mp4,.mov,.mkv,.m4v,.webm" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setError(""); }} /></label>
            <p role="status">{files.length} / 5 · {t("Reference videos")}{files.length > 0 && (files.length < 3 || files.length > 5) ? ` · ${t("Choose between 3 and 5 videos.")}` : ""}</p>
            <ul>{files.map((f, i) => <li key={`${f.name}-${i}`}>{f.name} <button className="link" onClick={() => setFiles(files.filter((_, j) => i !== j))}>{t("Remove")}</button></li>)}</ul>
            <p className="note">{t("3–5 videos · 300 MB per video maximum. Visual analysis uses your selected AI. Audio and exact fonts are not identified.")}</p>
          </> : <>
            <p>{t("Try colours, captions, motion and typography on one of your videos. Each choice is saved as you go.")}</p>
            {projects.length ? <label>{t("Preview video")}<select value={project} onChange={(e) => setProject(e.target.value)}>{projects.map((p) => <option key={p}>{p}</option>)}</select></label>
              : <p>{t("Add your first video, then return here to create your art direction.")} <a href="#/new">{t("NEW PROJECT")}</a></p>}
          </>}
          <button className="act fill" disabled={!name.trim() || (mode === "import" ? files.length < 3 || files.length > 5 || files.some((f) => f.size > 300 * 1024 * 1024) : !project)} onClick={() => void start()}>{t(mode === "import" ? "Analyse and create" : "Start the guided path")}</button>
        </fieldset>
        {progress && <p role="status">{progress}</p>}{error && <p role="alert" className="error">{error}</p>}
        <button className="link" disabled={busy} onClick={() => void run(dismiss)}>{t("Do this later")}</button>
      </section>
      <aside className="da-current">
        <h2>{t("Active art direction")}</h2>
        {state && <><label>{t("Art direction")}<select disabled={busy} value={state.list.active} onChange={(e) => { const name = e.target.value; void run(async () => { await api("/da/use", { method: "POST", body: { name } }); await refresh(); }); }}>{state.list.names.map((n) => <option key={n} value={n}>{n === "default" ? t("Default") : n}</option>)}</select></label>
          <button className="act danger" disabled={busy || state.list.active === "default"} onClick={remove}>{t("Delete this art direction")}</button>
          {state.list.active === "default" && <p className="note">{t("The default art direction stays available as a fallback.")}</p>}
          {state.da.reference ? <><p>{state.da.reference.summary}</p><ul>{state.da.reference.guidance.map((s, i) => <li key={i}>{s}</li>)}</ul>
            <details><summary>{t("References and analysis limits")}</summary><ul>{state.da.reference.sources.map((s, i) => <li key={i}>{s.name}</li>)}</ul><ul>{state.da.reference.uncertainties.map((s, i) => <li key={i}>{s}</li>)}</ul></details></> : <p>{t("A guided art direction or Adam's default style.")}</p>}
          <label>{t("Your style instructions")}<textarea disabled={busy} rows={4} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <button className="act" disabled={busy} onClick={() => void run(async () => { await api("/da/notes", { method: "PUT", body: { text: notes } }); await refresh(); })}>{t("SAVE")}</button>
          {project && <a href={`#/p/${enc(project)}/da`}>{t("Refine with the guided path")}</a>}
        </>}
      </aside>
    </div>
  </>;
}
