import { spawnSync, type ChildProcess } from "node:child_process";
import { spawnCommand } from "./process-input";
import type { Command } from "./actions";
import { aiOf } from "../app/feed";
import { aiFailureOf } from "./ai-errors";
import type { Hint, JobEvent, JobView } from "./types";

const MAX_OUTPUT = 200_000;
export class BusyError extends Error {}

export function hintOf(output: string): Hint {
  if (/Pass --replace/.test(output)) return "replace";
  if (/Refusing to (render|export)/.test(output)) return "force";
  return null;
}

/**
 * Who may run together (docs/ux-rules.md).
 * - Heavy work takes the computer's cores and memory: one at a time on the whole computer, the others wait their turn.
 * - The AI mostly waits on the network, and the light work is small: they run beside anything.
 * - In one project, what writes to it runs alone among writers. A render reads the edit once, at its start: an ask can run beside it.
 */
export type Lane = "heavy" | "ai" | "light";
const HEAVY = new Set(["Render", "Export to CapCut", "Review", "Analyze", "New project", "Add rushes", "Lay out the cards"]);
const READS_ONLY = new Set(["Render", "Export to CapCut", "Review", "Reference"]);
export const laneOf = (label: string): Lane => (aiOf(label) ? "ai" : HEAVY.has(label) ? "heavy" : "light");
const writes = (label: string) => laneOf(label) !== "light" && !READS_ONLY.has(label);
const active = (j: JobView) => j.state === "running" || j.state === "queued";

/** Where a job is, from its own output: "rendering: 35 %, about 4 min left". */
export function progressOf(text: string): { percent: number; minutesLeft?: number } | null {
  const all = [...text.matchAll(/rendering: (\d+) %(?:, about (\d+) min left)?/g)];
  const m = all[all.length - 1];
  return m ? { percent: Number(m[1]), ...(m[2] ? { minutesLeft: Number(m[2]) } : {}) } : null;
}

type Pending = { job: JobView; begin: () => void };

export class JobManager {
  private jobs = new Map<string, JobView>();
  private procs = new Map<string, ChildProcess>();
  private aborts = new Map<string, AbortController>();
  private listeners = new Map<string, Set<(e: JobEvent) => void>>();
  private ends = new Map<string, ((j: JobView) => void)[]>();
  private stopping = new Set<string>();
  private queue: Pending[] = [];
  private seq = 0;
  private pumping = false;
  private pumpAgain = false;
  private changed: (job: JobView) => void = () => {};

  constructor(private keep = 20) {}

  /** Told each time a job waits, starts or ends (not at each line of output). */
  onChange(fn: (job: JobView) => void): void { this.changed = fn; }

  /** What runs or waits on this project; when several, the running one first. */
  running(project: string): JobView | undefined {
    const mine = [...this.jobs.values()].filter((j) => j.project === project && active(j));
    return mine.find((j) => j.state === "running") ?? mine[0];
  }

  /** Starts now when its turn allows it, else waits in line: a click is never refused because the computer is busy. */
  start(project: string, c: Command, onEnd?: (j: JobView) => void): JobView {
    // The same work asked twice on one project is one job: both callers hear when it ends.
    const same = [...this.jobs.values()].find((j) => j.project === project && j.label === c.label && active(j));
    if (same) {
      if (aiOf(c.label)) throw new BusyError(`${project} is busy: ${same.label} is running`);
      if (onEnd) this.ends.set(same.id, [...(this.ends.get(same.id) ?? []), onEnd]);
      return same;
    }
    const job = this.newJob(project, c.label, onEnd);
    this.enqueue(job, () => this.spawnJob(job, c));
    return job;
  }

  /** Work done in this process instead of a child (a reference being watched): same line, same list, stoppable through the signal. */
  task(project: string, label: string, detail: string, work: (signal: AbortSignal) => Promise<unknown>, onEnd?: (j: JobView) => void): JobView {
    const job = this.newJob(project, label, onEnd);
    job.detail = detail;
    const controller = new AbortController();
    this.aborts.set(job.id, controller);
    this.enqueue(job, () => {
      try {
        work(controller.signal).then(() => this.finish(job, 0), (e) => { job.output += `${(e as Error).message}\n`; this.finish(job, 1); });
      } catch (error) { job.output += `${(error as Error).message}\n`; this.finish(job, 1); }
    });
    return job;
  }

  private newJob(project: string, label: string, onEnd?: (j: JobView) => void): JobView {
    const job: JobView = { id: `j${++this.seq}`, project, label, state: "queued", output: "", startedAt: Date.now(), hint: null };
    this.jobs.set(job.id, job);
    if (onEnd) this.ends.set(job.id, [onEnd]);
    return job;
  }

  private enqueue(job: JobView, begin: () => void): void {
    this.queue.push({ job, begin });
    this.pump();
    if (job.state === "queued") this.changed(job);
  }

  /** Starts what can start, in order: nothing overtakes an earlier job it would compete with. */
  private pump(): void {
    if (this.pumping) { this.pumpAgain = true; return; }
    this.pumping = true;
    try {
      do {
        this.pumpAgain = false;
        const pending = this.queue;
        this.queue = [];
        const runningNow = [...this.jobs.values()].filter((j) => j.state === "running");
        let heavyBusy = runningNow.some((j) => laneOf(j.label) === "heavy");
        const writing = new Set(runningNow.filter((j) => writes(j.label)).map((j) => j.project));
        const waiting: Pending[] = [];
        for (const p of pending) {
          // A completion callback can cancel another job while this batch is detached from the queue.
          if (p.job.state !== "queued") continue;
          const { job } = p, heavy = laneOf(job.label) === "heavy", writer = writes(job.label);
          const blocked = (heavy && heavyBusy) || (writer && job.project !== "" && writing.has(job.project));
          if (blocked) {
            waiting.push(p);
            if (heavy) heavyBusy = true;
            if (writer) writing.add(job.project);
            continue;
          }
          if (heavy) heavyBusy = true;
          if (writer) writing.add(job.project);
          job.state = "running"; job.startedAt = Date.now();
          p.begin();
          this.changed(job);
        }
        this.queue = [...waiting, ...this.queue];
      } while (this.pumpAgain);
    } finally { this.pumping = false; }
  }

  private emit(job: JobView, e: JobEvent): void { for (const fn of this.listeners.get(job.id) ?? []) fn(e); }

  private finish(job: JobView, code: number | null): void {
    if (job.state !== "running" && job.state !== "queued") return;
    job.state = this.stopping.delete(job.id) ? "stopped" : code === 0 ? "done" : "failed";
    job.hint = job.state === "failed" ? hintOf(job.output) : null;
    // Only an ask job can fail for this reason: other logs may mention a limit for another reason.
    const ai = job.state === "failed" && aiOf(job.label) ? aiFailureOf(job.output) : null;
    if (ai) job.ai = ai;
    job.endedAt = Date.now();
    this.procs.delete(job.id);
    this.aborts.delete(job.id);
    this.emit(job, { type: "end", job: { ...job } });
    this.listeners.delete(job.id);
    this.prune(job.project);
    const ends = this.ends.get(job.id) ?? [];
    this.ends.delete(job.id);
    for (const fn of ends) fn(job);
    this.changed(job);
    this.pump();
  }

  private spawnJob(job: JobView, c: Command): void {
    const add = (chunk: Buffer | string) => {
      const text = chunk.toString();
      job.output = (job.output + text).slice(-MAX_OUTPUT);
      const link = text.match(/https?:\/\/localhost:\d+/);
      if (link && !job.link) job.link = link[0];
      const progress = progressOf(text);
      if (progress) { job.progress = progress.percent; job.minutesLeft = progress.minutesLeft; }
      this.emit(job, { type: "output", text });
    };
    let child: ChildProcess;
    try { child = spawnCommand({ ...c, env: { ...c.env, FORCE_COLOR: "0" } }); }
    catch (error) { add(`${(error as Error).message}\n`); this.finish(job, 1); return; }
    this.procs.set(job.id, child);
    child.stdout?.on("data", add);
    child.stderr?.on("data", add);
    child.on("error", (err) => { add(`${err.message}\n`); this.finish(job, 1); });
    child.on("close", (code) => this.finish(job, code));
  }

  projectNames(): string[] { return [...new Set([...this.jobs.values()].filter(j => active(j) && (j.label === "New project" || j.label === "Lay out the cards")).map(j => j.project))]; }

  get(id: string): JobView | undefined { return this.jobs.get(id); }

  /** Newest first. */
  list(project: string): JobView[] {
    return [...this.jobs.values()].filter((j) => j.project === project).reverse();
  }

  /** Everything that runs or waits on the computer, in the order it will be done, then what ended in the last minutes. */
  tasks(now = Date.now()): (Omit<JobView, "output"> & { lane: Lane; position?: number })[] {
    const all = [...this.jobs.values()];
    const view = (j: JobView) => { const { output: _, ...rest } = j; return { ...rest, lane: laneOf(j.label) }; };
    const waiting = this.queue.map((p, i) => ({ ...view(p.job), position: i + 1 }));
    const recent = all.filter((j) => !active(j) && now - (j.endedAt ?? 0) < 5 * 60_000).reverse().slice(0, 4);
    return [...all.filter((j) => j.state === "running").map(view), ...waiting, ...recent.map(view)];
  }

  subscribe(id: string, fn: (e: JobEvent) => void): () => void {
    const set = this.listeners.get(id) ?? new Set();
    set.add(fn);
    this.listeners.set(id, set);
    return () => set.delete(fn);
  }

  stop(id: string): boolean {
    const job = this.jobs.get(id);
    if (job?.state === "queued") {
      this.queue = this.queue.filter((p) => p.job.id !== id);
      this.aborts.get(id)?.abort();
      this.stopping.add(id);
      this.finish(job, null);
      return true;
    }
    const abort = this.aborts.get(id);
    if (abort && job?.state === "running") { this.stopping.add(id); abort.abort(); return true; }
    const child = this.procs.get(id);
    if (!child || child.pid === undefined) {
      if (job?.state !== "running") return false;
      this.stopping.add(id);
      this.finish(job, null);
      return true;
    }
    this.stopping.add(id);
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    else { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); } }
    return true;
  }

  hasRunning(): boolean { return [...this.jobs.values()].some(active); }

  stopProject(project: string): void {
    const jobs = this.list(project).filter(active);
    const ids = new Set(jobs.map(job => job.id));
    this.queue = this.queue.filter(p => !ids.has(p.job.id));
    // Cancel queued work before stopping a writer can release it.
    for (const job of jobs.filter(j => j.state === "queued")) this.stop(job.id);
    for (const job of jobs.filter(j => j.state === "running")) this.stop(job.id);
  }

  stopAll(): void {
    for (const p of [...this.queue]) this.stop(p.job.id);
    for (const id of [...this.procs.keys(), ...this.aborts.keys()]) this.stop(id);
  }

  private prune(project: string): void {
    const ended = [...this.jobs.values()].filter((j) => j.project === project && !active(j));
    for (const j of ended.slice(0, Math.max(0, ended.length - this.keep))) this.jobs.delete(j.id);
  }
}
