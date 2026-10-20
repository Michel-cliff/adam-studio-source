import { useEffect, useState } from "react";
import type { ProjectListItem } from "../server/types";
import { api } from "./api";

type Row = {
  key: string; platform: string; caption: string; url: string; cover: string; publishedAt: string; views: number; likes: number; comments: number;
  shares: number; saves: number; engagement: number; project: string | null; features: { durationS: number; cutsPerMin: number; hookS: number | null; framework: string | null } | null;
};
type Report = {
  fetchedAt: Record<string, string>; rows: Row[];
  compare: { feature: string; groups: { label: string; videos: number; medianViews: number; medianEngagement: number }[] }[];
  status: Record<string, { configured: boolean; connected: boolean }>;
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function Insights() {
  const [report, setReport] = useState<Report | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => api<Report>("/insights").then(setReport, (e) => setNotes([e.message]));
  useEffect(() => { void load(); api<ProjectListItem[]>("/projects").then(setProjects); }, []);
  const refresh = async () => {
    setBusy(true);
    try { setNotes((await api<{ notes: string[] }>("/insights/refresh", { method: "POST" })).notes); await load(); } catch (e) { setNotes([(e as Error).message]); }
    setBusy(false);
  };
  const linkTo = async (video: string, project: string) => { await api("/insights/link", { method: "POST", body: { video, project: project || null } }); await load(); };
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open]);
  if (!report) return null;
  const s = report.status;
  const PLATFORMS = [
    { id: "tiktok", name: "TikTok", cls: "", how: <>add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to ~/.adam-studio/.env (redirect URI: http://localhost:{location.port}/api/tiktok/callback)</> },
    { id: "instagram", name: "Instagram", cls: "ig", how: <>add INSTAGRAM_ACCESS_TOKEN (Meta app dashboard, Instagram API setup, Generate token) to ~/.adam-studio/.env</> },
  ];
  const rowsOf = (id: string) => report.rows.filter((r) => r.platform.toLowerCase() === id);
  const median = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[v.length >> 1]! : 0; };
  const shown = PLATFORMS.find((p) => p.id === open);
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <h1 style={{ margin: 0 }}>Insights</h1>
        <button disabled={busy} onClick={refresh}>{busy ? "Fetching..." : "Refresh numbers"}</button>
      </div>
      <div className="row" style={{ margin: "14px 0 26px" }}>
        {Object.entries(report.fetchedAt).map(([p, at]) => <span key={p} className="tag">{p} fetched {new Date(at).toLocaleString()}</span>)}
        {notes.map((n) => <span key={n} className="muted">{n}</span>)}
      </div>
      <div className="platforms">
        {PLATFORMS.map((p) => {
          const st = s[p.id]!, rows = rowsOf(p.id);
          return (
            <button key={p.id} className="platform" onClick={() => setOpen(p.id)}>
              <span className="lbl">{p.name}</span>
              <span className={`face ${p.cls}`}>
                <span className="halftone" aria-hidden="true" />
                <span className="n">{rows.length ? median(rows.map((r) => r.views)).toLocaleString() : "0"}</span>
                <span className="s">{rows.length ? `median views · ${rows.length} video${rows.length === 1 ? "" : "s"}` : st.connected ? "no videos yet, refresh" : st.configured ? "not connected" : "not set up"}</span>
                <span className="s">{st.connected ? "connected" : "open to connect"}</span>
              </span>
            </button>
          );
        })}
      </div>
      {report.compare.length > 0 && (
        <>
          <h2>What moves with the numbers</h2>
          <section>
            <table>
              <thead><tr><th>Edit choice</th><th>Videos</th><th>Median views</th><th>Median engagement</th></tr></thead>
              <tbody>{report.compare.flatMap((c) => c.groups.map((g) => <tr key={c.feature + g.label}><td>{g.label}</td><td>{g.videos}</td><td>{g.medianViews}</td><td>{pct(g.medianEngagement)}</td></tr>))}</tbody>
            </table>
            <p className="muted">Link each video to its project; with more linked videos these comparisons mean more.</p>
          </section>
        </>
      )}
      {shown && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="win modal" role="dialog" aria-modal="true" aria-label={shown.name} onClick={(e) => e.stopPropagation()}>
            <div className="bar"><span className="t">{shown.id}.exe</span><button className="ghost" style={{ color: "#fff", padding: "2px 6px" }} aria-label="Close" onClick={() => setOpen(null)}>×</button></div>
            <div className="body">
              <div className="row" style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>{shown.name}</h2>
                {s[shown.id]!.connected ? <span className="tag y">connected</span>
                  : s[shown.id]!.configured && shown.id === "tiktok" ? <a className="button" href="/api/tiktok/login">Connect TikTok</a>
                  : <span className="muted">{shown.how}</span>}
              </div>
              {rowsOf(shown.id).length === 0 ? <p className="muted">No videos yet: connect and refresh.</p> : (
                <table>
                  <thead><tr><th></th><th>Video</th><th>Views</th><th>Engagement</th><th>Likes / comments / shares / saves</th><th>Project</th></tr></thead>
                  <tbody>
                    {rowsOf(shown.id).map((r) => (
                      <tr key={r.key}>
                        <td>{r.cover ? <img src={r.cover} alt="" style={{ width: 54, borderRadius: 6, border: "1.5px solid #161616" }} /> : null}</td>
                        <td><a href={r.url} target="_blank" rel="noreferrer">{r.caption.slice(0, 70) || r.key}</a><div className="muted">{new Date(r.publishedAt).toLocaleDateString()}</div></td>
                        <td>{r.views.toLocaleString()}</td>
                        <td>{pct(r.engagement)}</td>
                        <td>{r.likes} / {r.comments} / {r.shares} / {r.saves}</td>
                        <td>
                          <select aria-label="Project" value={r.project ?? ""} onChange={(e) => linkTo(r.key, e.target.value)}>
                            <option value="">not linked</option>
                            {projects.map((p) => <option key={p.name}>{p.name}</option>)}
                          </select>
                          {r.features && <div className="muted">{r.features.durationS} s · {r.features.cutsPerMin} cuts/min{r.features.hookS !== null ? ` · hook ${r.features.hookS} s` : ""}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
