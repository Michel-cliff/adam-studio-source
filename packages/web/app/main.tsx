import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "./Editor";
import { Home } from "./Home";
import { setLang, t, useLang } from "./i18n";
import { Library } from "./Library";
import { NewProject } from "./NewProject";
import { Stats } from "./Stats";
import { Studio } from "./Studio";
import "./style.css";

function useHash(): string[] {
  const read = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => { const on = () => setParts(read()); addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  return parts;
}

const lastProject = () => { try { return localStorage.getItem("adam.lastProject") ?? ""; } catch { return ""; } };

function App() {
  const lang = useLang();
  const [page, name, sub, id] = useHash();
  useEffect(() => { if (page === "p" && name) try { localStorage.setItem("adam.lastProject", name); } catch { /* private mode */ } }, [page, name]);
  let body;
  if (page === "new") body = <NewProject />;
  else if (page === "library") body = <Library />;
  else if (page === "stats") body = <Stats />;
  else if (page === "p" && name && sub === "add") body = <NewProject addTo={name} />;
  else if (page === "p" && name && sub === "edit") body = <Editor key={name} name={name} />;
  else if (page === "p" && name) body = <Studio key={name} name={name} jobId={sub === "job" ? id : undefined} />;
  else body = <Home />;
  const tab = page === "p" ? "studio" : page === "library" ? "library" : page === "stats" ? "stats" : "projects";
  const last = name && page === "p" ? name : lastProject();
  const tabs: [string, string, string][] = [
    ["projects", "PROJECTS", "#/"], ["studio", "STUDIO", last ? `#/p/${encodeURIComponent(last)}` : "#/"],
    ["library", "LIBRARY", "#/library"], ["stats", "STATISTICS", "#/stats"],
  ];
  return (
    <div className="page">
      <nav aria-label="Main" className="topnav">
        {tabs.map(([k, label, href]) => <a key={k} href={href} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined}>{t(label)}</a>)}
        <div role="group" aria-label="Language" className="lang">
          {(["fr", "en"] as const).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
        </div>
      </nav>
      <div className="marks" aria-hidden="true" />
      {body}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
