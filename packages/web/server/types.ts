export type JobState = "queued" | "running" | "done" | "failed" | "stopped";
export type Hint = "force" | "replace" | null;
export interface JobView { id: string; project: string; label: string; state: JobState; output: string; startedAt: number; endedAt?: number; progress?: number; minutesLeft?: number; detail?: string; hint: Hint; link?: string; ai?: import("./ai-errors").AiFailure }
export type JobEvent = { type: "output"; text: string } | { type: "end"; job: JobView };

export type CacheState = "done" | "missing" | "on demand";
export interface TakeView { id: string; file: string; durationMs: number | null; firstWords: string; cache: Record<string, CacheState> }
export interface RenderView { file: string; size: number; mtime: number; /** The edit changed since this video read it. */ stale?: boolean }
export interface ProposalView { id: string; step: string; status: string; reason?: string; variants: { key: string; label: string; summary: string; why?: string }[]; review: { sheet: string | null; clips: Record<string, string> } | null; anchor?: unknown; notes: string[] }
export interface WorkflowView { current: string; steps: Record<string, "locked" | "open" | "done"> }
export interface ProjectView { importing?: boolean; name: string; ok: boolean; error?: string; format?: string; video?: string; modified?: number; takes: TakeView[]; renders: RenderView[]; proposals: ProposalView[]; jobs: JobView[]; workflow: WorkflowView | null; durationMs: number | null; assets: { id: string; kind: string; path: string }[] }
export interface ProjectListItem { name: string; ok: boolean; error?: string; format?: string; takes: number; lastRender: number | null }
export interface FolderView { path: string | null; parent: string | null; folders: string[]; videos: string[] }
