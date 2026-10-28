import { useEffect, useState } from "react";
import type { ProjectView } from "../server/types";
import { api, enc, fileUrl } from "./api";
import { t, useLang } from "./i18n";

/** Statistics, first version: the videos already exported. Numbers, references and what Claude learned come next. */
export function Stats() {
  useLang();
  const [done, setDone] = useState<{ name: string; file: string; mtime: number }[] | null>(null);
  useEffect(() => {
    api<{ name: string }[]>("/projects")
      .then((list) => Promise.all(list.map((p) => api<ProjectView>(`/projects/${enc(p.name)}`).catch(() => null))))
      .then((views) => setDone(views.flatMap((v) => (v?.renders[0] ? [{ name: v.name, file: v.renders[0].file, mtime: v.renders[0].mtime }] : []))
        .sort((a, b) => b.mtime - a.mtime)), () => setDone([]));
  }, []);
  return (
    <>
      <nav aria-label="Statistics views" className="subnav">
        <button type="button" className="on" aria-pressed="true">{t("My videos")}</button>
        <button type="button" disabled title="Coming next">{t("References & trends")}</button>
        <button type="button" disabled title="Coming next">{t("What Claude learned")}</button>
      </nav>
      <div className="stats-grid">
        {done?.map((d) => (
          <figure key={d.name} className="item">
            <video className="frame" controls preload="metadata" src={fileUrl(d.name, d.file, d.mtime)} />
            <figcaption><b>{d.name}</b><br /><span className="dim">{new Date(d.mtime).toLocaleDateString()}</span></figcaption>
          </figure>
        ))}
        {done && done.length === 0 && <p className="mono note">NO EXPORTED VIDEO YET.</p>}
      </div>
      <footer className="foot"><span className="hint">Views, retention and links per video come in the next version.</span></footer>
    </>
  );
}
