import { useEffect, useRef, useState } from "react";
import type { JobView } from "../server/types";
import { api, enc } from "./api";
import { aiOf } from "./feed";
import { t, useLang } from "./i18n";
import { groupOf } from "./steps";

type Task = Omit<JobView, "output"> & { lane: string; position?: number };

const NAMES: Record<string, string> = {
  Render: "MP4 export", "Export to CapCut": "CapCut export", "New project": "Import", "Add rushes": "Adding takes",
  Analyze: "Analysis", Review: "Review", "Lay out the cards": "Laying out the cards", Reference: "Reference video",
};
const STEP_NAMES: Record<string, string> = { story: "Story", captions: "Captions", hook: "Hook", visuals: "Visuals", sound: "Sound", wrap: "Wrap" };

/** A job as the creator names it. */
export function taskName(label: string): string {
  const who = aiOf(label);
  if (who) return `${t("Adam")} · ${t(STEP_NAMES[groupOf(who.step)] ?? who.step)}`;
  return t(NAMES[label] ?? label);
}

const isActive = (x: { state: string }) => x.state === "running" || x.state === "queued";

/** Where a job is, in a few words. */
export function taskState(x: Pick<Task, "state" | "progress" | "minutesLeft" | "position">): string {
  if (x.state === "queued") return x.position ? `${t("WAITING")} · ${x.position}` : t("WAITING");
  if (x.state === "running") {
    if (x.progress === undefined) return t("IN PROGRESS");
    return `${x.progress} %${x.minutesLeft ? ` · ${t("about")} ${x.minutesLeft} min` : ""}`;
  }
  return t(x.state === "done" ? "DONE" : x.state === "failed" ? "FAILED" : "STOPPED");
}

/** A thin bar for what is measured: it only appears when there is something to show, and takes no room otherwise. */
export function TaskBar({ percent }: { percent?: number }) {
  if (percent === undefined) return null;
  return <span className="taskbar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></span>;
}

/** What runs and what waits on this computer, reachable from every page: leaving a page never stops anything. */
export function Tasks() {
  useLang();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const load = () => api<Task[]>("/tasks").then(setTasks, () => {});
  const active = tasks.filter(isActive);
  const busy = active.length > 0;
  useEffect(() => {
    void load();
    const ev = new EventSource("/api/events");
    ev.onmessage = () => void load();
    return () => ev.close();
  }, []);
  // Progress changes without any event: it is asked for while something runs.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => void load(), 2000);
    return () => clearInterval(id);
  }, [busy]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener("mousedown", close); addEventListener("keydown", close);
    return () => { removeEventListener("mousedown", close); removeEventListener("keydown", close); };
  }, [open]);
  const stop = async (id: string) => { await api(`/jobs/${id}/stop`, { method: "POST" }).catch(() => {}); void load(); };
  return (
    <div className="tasks" ref={box}>
      <button type="button" className={`tasks-trigger${busy ? " busy" : ""}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        {busy && <i className="pulse" />}{t("TASKS")}{busy ? ` · ${active.length}` : ""}
      </button>
      {open && (
        <div className="tasks-panel" role="dialog" aria-label={t("TASKS")}>
          {tasks.length === 0 && <p className="mono note">{t("Nothing is running.")}</p>}
          {tasks.map((x) => (
            <div key={x.id} className={`task ${x.state}`}>
              <div className="task-line">
                <b>{taskName(x.label)}</b>
                {x.project ? <a href={`#/p/${enc(x.project)}`} onClick={() => setOpen(false)}>{x.project}</a> : x.detail ? <span className="dim">{x.detail}</span> : null}
                <span className="mono">{taskState(x)}</span>
                {isActive(x) && <button type="button" className="x" aria-label={t("Stop")} title={t("Stop")} onClick={() => void stop(x.id)}>×</button>}
              </div>
              {x.state === "running" && <TaskBar percent={x.progress} />}
            </div>
          ))}
          {active.some((x) => x.state === "queued") && <p className="mono note">{t("Heavy work runs one at a time, so each one goes as fast as it can. The next one starts by itself.")}</p>}
        </div>
      )}
    </div>
  );
}
