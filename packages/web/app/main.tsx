import { useEffect, useState } from "react";
import { AiFailureBar } from "./AiFailureBar";
import { SupportPrompt } from "./SupportPrompt";
import { Onboarding } from "./Onboarding";
import { DaSpace } from "./DaSpace";
import { DaPath } from "./DaPath";
import { SetupNote } from "./Setup";
import { createRoot } from "react-dom/client";
import { Editor } from "./Editor";
import { Home } from "./Home";
import { setLang, startLang, t, useLang } from "./i18n";
import { Library } from "./Library";
import { NewProject } from "./NewProject";
import { Stats } from "./Stats";
import { Tasks } from "./Tasks";
import { Studio } from "./Studio";
import "./style.css";
import "./responsive.css";

function useHash(): string[] {
  const read = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => { const on = () => setParts(read()); addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  return parts;
}


function App() {
  const lang = useLang();
  const [page, name, sub, id] = useHash();
  const [activeProject, setActiveProject] = useState(page === "p" ? name ?? "" : "");
  const [studioNotice, setStudioNotice] = useState(false);
  useEffect(() => {
    if (page === "p" && name) {
      setActiveProject(name); setStudioNotice(false);
      try { localStorage.setItem("adam.lastProject", name); } catch { /* private mode */ }
    }
  }, [page, name]);
  let body;
  if (page === "da") body = <DaSpace />;
  else if (page === "new") body = <NewProject />;
  else if (page === "library") body = <Library />;
  else if (page === "stats") body = <Stats view={name} />;
  else if (page === "p" && name && sub === "add") body = <NewProject addTo={name} />;
  else if (page === "p" && name && sub === "edit") body = <Editor key={name} name={name} />;
  // The guided art direction path opens over the studio of the video it is played on.
  else if (page === "p" && name && sub === "da") body = <><Studio key={name} name={name} /><DaPath name={name} /></>;
  else if (page === "p" && name) body = <Studio key={name} name={name} jobId={sub === "job" ? id : undefined} />;
  else body = <Home />;
  const tab = page === "da" ? "da" : page === "p" ? "studio" : page === "library" ? "library" : page === "stats" ? "stats" : "projects";
  const last = name && page === "p" ? name : activeProject;
  const tabs: [string, string, string][] = [
    ["projects", "PROJECTS", "#/"], ["studio", "STUDIO", last ? `#/p/${encodeURIComponent(last)}` : "#/"],
    ["da", "ART DIRECTION", "#/da"], ["library", "LIBRARY", "#/library"], ["stats", "STATISTICS", "#/stats"],
  ];
  return (
    <div className="page">
      <nav aria-label="Main" className="topnav">
        {tabs.map(([k, label, href]) => <a key={k} href={href} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} onClick={(event) => {
          if (k === "studio" && !last) {
            event.preventDefault(); location.hash = "#/"; setStudioNotice(true);
          } else setStudioNotice(false);
        }}>{t(label)}</a>)}
        <Tasks />
        <button className="tour-trigger" onClick={() => dispatchEvent(new Event("adam:tour"))}>{t("Guide")}</button>
        <div role="group" aria-label="Language" className="lang">
          {(["fr", "en"] as const).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
        </div>
      </nav>
      <div className="marks" aria-hidden="true" />
      {studioNotice && <div className="toast studio-entry-notice" role="status" aria-live="polite">
        <span>{t("Choose a project on the home page first.")}</span>
        <button type="button" className="link" aria-label={t("Close")} onClick={() => setStudioNotice(false)}>×</button>
      </div>}
      {body}
      <SetupNote />
      <Onboarding />
      <SupportPrompt />
      <AiFailureBar />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
startLang();
