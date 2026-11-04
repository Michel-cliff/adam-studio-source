export const AI_FAILURE = "adam-ai-failure";
/** The AI failed for a reason the creator can act on: the page offers to switch AI. */
export const reportAiFailure = (text: string) => { dispatchEvent(new CustomEvent(AI_FAILURE, { detail: text })); };

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await r.json().catch(() => ({}));
  if (data.aiFailure) reportAiFailure(data.error);
  if (!r.ok) throw new Error(data.error ?? `${r.status} ${r.statusText}`);
  return data as T;
}

export const enc = encodeURIComponent;

export type Uploaded = { saved: string; kind: string; imported?: { id: string; kind: string; path: string } };
/** Sends a dropped file to the Inspiration folder, and into the project when one is given. */
export async function uploadFile(file: File, project?: string): Promise<Uploaded> {
  const q = `name=${enc(file.name)}${project ? `&project=${enc(project)}` : ""}`;
  const r = await fetch(`/api/library/upload?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `${r.status} ${r.statusText}`);
  return data as Uploaded;
}
export const fileUrl = (project: string, rel: string, v?: number) =>
  `/api/projects/${enc(project)}/files/${rel.split("/").map(enc).join("/")}${v ? `?v=${Math.round(v)}` : ""}`;
export const go = (hash: string) => { location.hash = hash; };
export const ms = (n: number | null) => (n === null ? "" : `${(n / 1000).toFixed(1)} s`);
