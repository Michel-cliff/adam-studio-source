// The six steps the creator sees, over the eight steps of the workflow: the cuts go with the story,
// the beats and the look with the visuals.
export type GroupId = "story" | "captions" | "hook" | "visuals" | "sound" | "wrap";
export type GroupState = "open" | "done" | "locked";
type Workflow = { current: string; steps: Record<string, string> } | null;

export const GROUPS: { id: GroupId; members: string[]; color: string }[] = [
  { id: "story", members: ["cuts", "structure"], color: "var(--green)" },
  { id: "captions", members: ["captions"], color: "var(--cream)" },
  { id: "hook", members: ["hook"], color: "var(--mustard)" },
  { id: "visuals", members: ["beats", "visuals", "look"], color: "var(--red)" },
  { id: "sound", members: ["sound"], color: "var(--green)" },
  { id: "wrap", members: [], color: "var(--cream)" },
];

const membersOf = (g: GroupId) => GROUPS.find((x) => x.id === g)?.members ?? [];

export function groupOf(step: string): GroupId {
  return GROUPS.find((g) => g.members.includes(step))?.id ?? "wrap";
}

export function groupState(g: GroupId, wf: Workflow): GroupState {
  if (!wf) return g === "story" ? "open" : "locked";
  const m = membersOf(g);
  if (g === "wrap") return Object.values(wf.steps).every((s) => s === "done") ? "open" : "locked";
  if (m.every((s) => wf.steps[s] === "done")) return "done";
  return m.includes(wf.current) ? "open" : "locked";
}

/** The workflow step an ask from this group goes to. */
export function askStep(g: GroupId, wf: Workflow): string {
  const m = membersOf(g);
  if (!wf) return m[0] ?? "cuts";
  if (m.includes(wf.current)) return wf.current;
  return m.find((s) => wf.steps[s] !== "done") ?? m[m.length - 1] ?? wf.current;
}

export function openGroup(wf: Workflow): GroupId {
  if (!wf) return "story";
  if (Object.values(wf.steps).every((s) => s === "done")) return "wrap";
  return groupOf(wf.current);
}
