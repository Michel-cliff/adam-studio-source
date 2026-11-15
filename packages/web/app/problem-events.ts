import type { JobView } from "../server/types";

export const PROBLEM_EVENT = "adam:problem";
export type Problem = { kind: "manual" | "task" | "request" | "interface" | "connection"; message?: string; jobId?: string };
const since = Date.now();
const seen = new Set<string>();
let pending: Problem | null = null;
export function takeProblem(): Problem | null { const value = pending; pending = null; return value; }
export function requestProblem(problem: Problem = { kind: "manual" }): void {
  pending = problem;
  dispatchEvent(new CustomEvent(PROBLEM_EVENT, { detail: problem }));
}
export const shouldReportJob = (job: Pick<JobView, "state" | "endedAt" | "ai" | "hint">, started = since) =>
  job.state === "failed" && (job.endedAt ?? 0) >= started && !job.ai && !job.hint;
export function reportFailedJob(job: Pick<JobView, "id" | "state" | "endedAt" | "ai" | "hint">): void {
  if (!shouldReportJob(job) || seen.has(job.id)) return;
  seen.add(job.id);
  if (seen.size > 100) seen.delete(seen.values().next().value!);
  requestProblem({ kind: "task", jobId: job.id });
}
