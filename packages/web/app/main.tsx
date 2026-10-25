import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "./Editor";
import { Home } from "./Home";
import { IconBook, IconHome } from "./icons";
import { Library } from "./Library";
import { NewProject } from "./NewProject";
import { Studio } from "./Studio";
import "./style.css";

function useHash(): string[] {
  const read = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => { const on = () => setParts(read()); addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  return parts;
}

function App() {
  const [page, name, sub, id] = useHash();
  let body;
  let shell = "";
  if (page === "new") body = <NewProject />;
  else if (page === "library") body = <Library />;
  else if (page === "p" && name && sub === "add") body = <NewProject addTo={name} />;
  else if (page === "p" && name && sub === "edit") { body = <Editor key={name} name={name} />; shell = "wide"; }
  else if (page === "p" && name) { body = <Studio key={name} name={name} jobId={sub === "job" ? id : undefined} />; shell = "full"; }
  else body = <Home />;
  const on = (p: string) => (page === p || (!page && p === "") ? "pill on" : "pill");
  return (
    <>
      <header className="topbar">
        <nav aria-label="Main" className="row" style={{ gap: 8 }}>
          <a className={on("")} href="#/">HOME <IconHome /></a>
          <a className={on("library")} href="#/library">LIBRARY <IconBook /></a>
        </nav>
        {/* On the home page the big title says it already. */}
        <a className={`wordmark${page ? "" : " hidden"}`} href="#/">THE STUDIO</a>
        <span aria-hidden="true" />
      </header>
      <main className={shell}>{body}</main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
