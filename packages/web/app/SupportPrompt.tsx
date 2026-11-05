import { useEffect, useRef, useState } from "react";
import type { JobView, JobEvent } from "../server/types";
import { api } from "./api";
import { t, useLang } from "./i18n";

const bootTime = Date.now();
export const SUPPORT_EVENT = "adam:export-job";
export const supportEligible = (j: JobView) => ["Render", "Export to CapCut"].includes(j.label) && j.state === "done" && (j.endedAt ?? 0) >= bootTime;
export function reportSupportJob(job: JobView) { dispatchEvent(new CustomEvent(SUPPORT_EVENT, { detail: job })); }

/** Optional support, independently sampled once per launch and once per successful export. */
export function SupportPrompt() {
  useLang();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const ready = useRef(false);
  useEffect(() => {
    let alive = true;
    pending.current = Math.random() < 0.5;
    const seen = new Set<string>();
    const watching = new Map<string, EventSource>();
    const finish = (j: JobView) => {
      if (seen.has(j.id) || !supportEligible(j)) return;
      seen.add(j.id);
      if (Math.random() < 0.5) pending.current = true;
    };
    const onJob = (event: Event) => {
      const j = (event as CustomEvent<JobView>).detail;
      if (!["Render", "Export to CapCut"].includes(j.label)) return;
      if (j.state !== "running" && j.state !== "queued") { finish(j); return; }
      if (watching.has(j.id) || seen.has(j.id)) return;
      const ev = new EventSource(`/api/jobs/${encodeURIComponent(j.id)}/events`);
      watching.set(j.id, ev);
      ev.onmessage = m => { const e = JSON.parse(m.data) as JobEvent; if (e.type === "end") { ev.close(); watching.delete(j.id); finish(e.job); } };
    };
    const check = async () => {
      if (!ready.current) { try { const s = await api<{ completed: boolean }>("/onboarding"); if (alive) ready.current = s.completed; } catch { return; } }
      if (alive && ready.current && pending.current && !document.querySelector("dialog[open], .da-veil")) { pending.current = false; setOpen(true); }
    };
    addEventListener(SUPPORT_EVENT, onJob);
    const timer = setInterval(() => void check(), 1000); void check();
    return () => { alive = false; clearInterval(timer); removeEventListener(SUPPORT_EVENT, onJob); watching.forEach(ev => ev.close()); };
  }, []);
  useEffect(() => { if (open && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [open]);
  const close = () => { dialog.current?.close(); setOpen(false); };
  if (!open) return null;
  return <dialog ref={dialog} className="support-dialog" aria-labelledby="support-title" aria-describedby="support-message" onCancel={e => { e.preventDefault(); close(); }}>
    <button className="support-close link" aria-label={t("Close")} onClick={close}>×</button>
    <div className="support-brand">
      <span className="support-coin" aria-hidden="true"><span className="support-coin-disc">
        <span className="support-coin-face support-coin-front"><svg viewBox="0 0 32 32" fill="none"><path d="M10 23 16 8l6 15M12 19h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <span className="support-coin-face support-coin-back"><svg viewBox="0 0 32 32" fill="none"><path d="m16 7 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L7 13.6l6.2-.9L16 7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg></span>
      </span></span><span className="mono">ADAM STUDIO</span>
    </div>
    <h2 id="support-title">{t("Enjoying Adam Studio?")}</h2>
    <p id="support-message">{t("If you enjoy Adam Studio, support the project to help fund its development and my next creative projects.")}</p>
    <div className="support-actions"><a className="act fill" href="https://ko-fi.com/cliffiscurious" target="_blank" rel="noopener noreferrer" onClick={close}>{t("Support on Ko-fi")}</a><button className="link" onClick={close}>{t("Maybe later")}</button></div>
  </dialog>;
}
