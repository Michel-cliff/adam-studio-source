import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { t, useLang } from "./i18n";
import { PROBLEM_EVENT, requestProblem, takeProblem, type Problem } from "./problem-events";

const ADDRESS = "hello@contact.cliffiscurious.com";
type Report = { report: string; mailto: string; filename: string };
const fallbackReport = (): Report => {
  // The engine is unavailable. Do not fall back to sending raw client errors or page URLs.
  const report = "Adam Studio\nEngine diagnostics unavailable.\nBrowser: " + navigator.userAgent.slice(0, 500);
  return { report, mailto: "mailto:" + ADDRESS + "?subject=Adam%20Studio%20bug%20report&body=" + encodeURIComponent(report), filename: "adam-studio-report-offline.txt" };
};

export class BugBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    requestProblem({ kind: "interface", message: (error.message + "\n" + (info.componentStack ?? "")).slice(0, 2000) });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="bug-fallback" role="alert">
      <h1>{t("This page encountered an error.")}</h1>
      <p>{t("Your saved projects are kept. You can report the problem or return to the project list.")}</p>
      <button className="act" onClick={() => requestProblem()}>{t("Report a problem")}</button>
      <button className="act" onClick={() => { location.hash = "#/"; location.reload(); }}>{t("Return to projects")}</button>
    </main>;
  }
}

export function BugReport() {
  const lang = useLang();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [data, setData] = useState<Report | null>(null);
  const [offline, setOffline] = useState(false);
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(false);
  useEffect(() => {
    const seen = new Set<string>();
    let lastOffer = 0;
    const receive = (event: Event) => {
      const p = (event as CustomEvent<Problem>).detail;
      takeProblem();
      if (!p || active.current) return;
      const key = p.kind + ":" + (p.jobId ?? p.message?.slice(0, 150) ?? "");
      if (p.kind !== "manual" && (seen.has(key) || Date.now() - lastOffer < 60000)) return;
      lastOffer = Date.now();
      seen.add(key);
      if (seen.size > 50) seen.delete(seen.values().next().value!);
      active.current = true;
      setProblem(p); setData(null); setOffline(false); setStatus("");
    };
    const error = (e: ErrorEvent) => requestProblem({ kind: "interface", message: String(e.message).slice(0, 2000) });
    const rejection = (e: PromiseRejectionEvent) => {
      if (e.reason?.name !== "AbortError") requestProblem({ kind: "interface", message: String(e.reason?.message ?? e.reason).slice(0, 2000) });
    };
    addEventListener(PROBLEM_EVENT, receive);
    const early = takeProblem();
    if (early) receive(new CustomEvent(PROBLEM_EVENT, { detail: early }));
    addEventListener("error", error);
    addEventListener("unhandledrejection", rejection);
    let alive = true, checking = false, failures = 0;
    const controller = new AbortController();
    const health = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const r = await fetch("/api/ping", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!r.ok || (await r.json()).app !== "adam-studio") throw Error("health check failed");
        failures = 0;
      } catch {
        if (alive && ++failures >= 3) requestProblem({ kind: "connection", message: "The local engine stopped responding." });
      } finally { checking = false; }
    };
    const timer = setInterval(() => void health(), 15000);
    return () => { alive = false; controller.abort(); clearInterval(timer); removeEventListener(PROBLEM_EVENT, receive); removeEventListener("error", error); removeEventListener("unhandledrejection", rejection); };
  }, []);
  useEffect(() => {
    if (!problem) return;
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    void fetch("/api/diagnostics/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(problem), signal: controller.signal })
      .then(async r => {
        if (!r.ok) throw Error("diagnostics unavailable");
        const report = await r.json() as Report;
        if (typeof report.report !== "string" || typeof report.mailto !== "string" || !report.mailto.startsWith("mailto:" + ADDRESS + "?")) throw Error("invalid diagnostics");
        if (alive) setData(report);
      }).catch(() => { if (alive) { setData(fallbackReport()); setOffline(true); } }).finally(() => clearTimeout(timer));
    const show = () => {
      if (dialog.current && !dialog.current.open && !document.querySelector("dialog[open], .da-veil")) dialog.current.showModal();
    };
    show();
    const display = setInterval(show, 400);
    return () => { alive = false; controller.abort(); clearTimeout(timer); clearInterval(display); };
  }, [problem]);
  const close = () => { dialog.current?.close(); active.current = false; setProblem(null); };
  const copy = async () => {
    if (!data) return;
    try { await navigator.clipboard.writeText(data.report); setStatus(t("Report copied.")); }
    catch { setStatus(t("Copy unavailable. Download the report and attach it to your email.")); }
  };
  const download = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([data.report], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = /^adam-studio-report-[\w-]+\.txt$/.test(data.filename) ? data.filename : "adam-studio-report.txt";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!problem) return null;
  return <dialog ref={dialog} className="bug-dialog" aria-labelledby="bug-title" onCancel={e => { e.preventDefault(); close(); }} lang={lang}>
    <h2 id="bug-title">{t("Report a blockage")}</h2>
    <p>{t("Help us fix Adam Studio. Review this report before sending it to hello@contact.cliffiscurious.com.")}</p>
    <p className="note">{t("No email is sent automatically. No media or project files are attached. Review the cleaned log for any remaining private information.")}</p>
    {offline && <p role="status">{t("The engine log is unavailable. This report contains only basic browser information.")}</p>}
    {data ? <details><summary>{t("Review the report")}</summary><pre className="bug-log" data-no-tr>{data.report}</pre></details> : <p role="status">{t("Preparing the report…")}</p>}
    <div className="bug-actions">
      {data && <><a className="act fill" href={data.mailto} target="_blank" rel="noopener noreferrer" onClick={() => void copy()}>{t("Prepare the email")}</a>
        <button className="act" onClick={() => void copy()}>{t("Copy the report")}</button>
        <button className="act" onClick={download}>{t("Download the log")}</button></>}
      <button className="link" onClick={close}>{t("Not now")}</button>
    </div>
    <p>{t("The email contains an excerpt. Attach the downloaded log if the full report is needed.")}</p>
    {status && <p role="status">{status}</p>}
  </dialog>;
}
