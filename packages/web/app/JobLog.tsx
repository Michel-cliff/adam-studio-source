import { t as uiText } from "./i18n";
import { useEffect, useRef, useState } from "react";
import type { JobEvent, JobView } from "../server/types";
import { reportSupportJob } from "./SupportPrompt";
import { api } from "./api";
import { taskName, taskState } from "./Tasks";

/** A job's output; compact: one line of fixed height (label, state, last line, Stop), for views whose layout must not move. */
export function JobLog({ id, onEnd, onRetry, compact }: { id: string; onEnd?: (j: JobView) => void; onRetry?: (extra: Record<string, boolean>) => void; compact?: boolean }) {
  const [job, setJob] = useState<JobView | null>(null);
  const [output, setOutput] = useState("");
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    setOutput("");
    api<JobView>(`/jobs/${id}`).then(setJob, () => setJob(null));
    const ev = new EventSource(`/api/jobs/${id}/events`);
    ev.onmessage = (m) => {
      const e = JSON.parse(m.data) as JobEvent;
      if (e.type === "output") setOutput((o) => o + e.text);
      else { setJob(e.job); reportSupportJob(e.job); ev.close(); onEnd?.(e.job); }
    };
    return () => ev.close();
  }, [id]);
  useEffect(() => { pre.current?.scrollTo(0, pre.current.scrollHeight); }, [output]);
  // Waiting, then its percentage: asked for without the log, which comes through the events above.
  const live = job?.state === "running" || job?.state === "queued";
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => { api<JobView>(`/jobs/${id}?meta=1`).then((j) => setJob((cur) => (cur && (cur.state === "running" || cur.state === "queued") ? j : cur)), () => {}); }, 2000);
    return () => clearInterval(timer);
  }, [id, live]);
  if (!job) return null;
  const tail = output.trim().split("\n").slice(-3).join("\n");
  // A finished job leaves the step: only a failure stays, to say why.
  if (compact && job.state === "done") return null;
  if (compact) return (
    <div className={`jobline mono${job.state === "failed" ? " bad" : ""}`} title={tail}>
      <b>{taskName(job.label).toUpperCase()}</b><span>{taskState(job)}</span>
      <span className="last">{output.trim().split("\n").pop() ?? ""}</span>
      {live && <button type="button" className="link" onClick={() => api(`/jobs/${id}/stop`, { method: "POST" })}>stop</button>}
    </div>
  );
  return (
    <section>
      <div className="row">
        <strong>{taskName(job.label)}</strong>
        <span className={job.state === "done" ? "ok" : live ? "muted" : "bad"}>{taskState(job)}</span>
        {live && <button className="quiet" onClick={() => api(`/jobs/${id}/stop`, { method: "POST" })}>Stop</button>}
        {job.link && <a className="button" href={job.link} target="_blank" rel="noreferrer">Open Remotion Studio</a>}
      </div>
      {job.state === "failed" && <p className="error">{tail}</p>}
      {job.state === "failed" && job.hint === "force" && onRetry && (
        <button onClick={() => onRetry({ force: true })}>{job.label === "Export to CapCut" ? "Export anyway" : "Render anyway"}</button>
      )}
      {job.state === "failed" && job.hint === "replace" && onRetry && (
        <button onClick={() => { if (confirm(uiText("Replace the CapCut project? Edits made in CapCut since the last export will be lost."))) onRetry({ replace: true }); }}>Replace the CapCut project</button>
      )}
      <pre className="log" ref={pre}>{output}</pre>
    </section>
  );
}
