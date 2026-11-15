import { requestProblem } from "./problem-events";

export const AI_FAILURE = "adam-ai-failure";
/** The AI failed for a reason the creator can act on: the page offers to switch AI. */
export const reportAiFailure = (text: string) => { dispatchEvent(new CustomEvent(AI_FAILURE, { detail: text })); };

/** Reports only technical failures; uploads retain their original, unlimited-duration request. */
export async function localRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (!url.startsWith("/api/") && url !== "/api") throw new Error("Expected a local API request.");
  let r: Response;
  try { r = await fetch(url, init); }
  catch (error) {
    if ((error as Error).name !== "AbortError") requestProblem({ kind: "connection", message: "The local request failed." });
    throw error;
  }
  let data: any;
  try { data = await r.json(); }
  catch {
    requestProblem({ kind: "request", message: "The local engine returned an invalid response." });
    throw new Error("The local engine returned an invalid response.");
  }
  if (!data || typeof data !== "object") {
    requestProblem({ kind: "request", message: "The local engine returned an invalid response." });
    throw new Error("The local engine returned an invalid response.");
  }
  if (!r.ok && r.status >= 500 && !data.aiFailure) requestProblem({ kind: "request", message: String(data.error ?? r.status).slice(0, 2000) });
  if (data.aiFailure) reportAiFailure(data.error);
  if (!r.ok) throw new Error(data.error ?? (r.status + " " + r.statusText));
  return data as T;
}
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  return localRequest<T>("/api" + path, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}


export const enc = encodeURIComponent;

export type Uploaded = { saved: string; kind: string; imported?: { id: string; kind: string; path: string } };
/** Sends a dropped file to the Inspiration folder, and into the project when one is given. */
export async function uploadFile(file: File, project?: string): Promise<Uploaded> {
  const q = `name=${enc(file.name)}${project ? `&project=${enc(project)}` : ""}`;
  return localRequest<Uploaded>(`/api/library/upload?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
}
export const fileUrl = (project: string, rel: string, v?: number) =>
  `/api/projects/${enc(project)}/files/${rel.split("/").map(enc).join("/")}${v ? `?v=${Math.round(v)}` : ""}`;
export const go = (hash: string) => { location.hash = hash; };
export const ms = (n: number | null) => (n === null ? "" : `${(n / 1000).toFixed(1)} s`);
