import { STEP_IDS, type Patch, type Project, type Proposal, type StepId, type VariantKey, type Workflow } from "./schema/project";
import { deepMerge } from "./merge";

export class WorkflowError extends Error {}

export type Decision = VariantKey | "reject" | "more";

export function newWorkflow(): Workflow {
  const steps = Object.fromEntries(STEP_IDS.map((s) => [s, s === "cuts" ? "open" : "locked"])) as Workflow["steps"];
  return { current: "cuts", steps };
}

export function applyPatch(project: Project, patch: Patch): Project {
  let next: Project = { ...project };
  if (patch.setStory) next = { ...next, story: patch.setStory };
  if (patch.setStructure) next = { ...next, structure: patch.setStructure };
  if (patch.removeElements) {
    const rm = new Set(patch.removeElements);
    next = { ...next, elements: next.elements.filter((e) => !rm.has(e.id)) };
  }
  if (patch.addElements) {
    const ids = new Set(next.elements.map((e) => e.id));
    for (const e of patch.addElements) {
      if (ids.has(e.id)) throw new WorkflowError(`element id "${e.id}" already exists`);
      ids.add(e.id);
    }
    next = { ...next, elements: [...next.elements, ...patch.addElements] };
  }
  if (patch.addCaptions) next = { ...next, captions: [...next.captions, ...patch.addCaptions] };
  if (patch.setStyle) next = { ...next, styleOverrides: deepMerge(next.styleOverrides, patch.setStyle) };
  return next;
}

/** Closes the current step when all its proposals are decided, and opens the next one. */
function advance(project: Project): Project {
  const wf = project.workflow;
  if (!wf) return project;
  const steps = { ...wf.steps };
  let current: StepId = wf.current;
  for (;;) {
    const ofStep = project.proposals.filter((p) => p.step === current);
    if (steps[current] !== "open" || ofStep.length === 0 || ofStep.some((p) => p.status === "pending")) break;
    steps[current] = "done";
    const nextStep = STEP_IDS[STEP_IDS.indexOf(current) + 1];
    if (!nextStep) break;
    steps[nextStep] = "open";
    current = nextStep;
  }
  return { ...project, workflow: { current, steps } };
}

export function decide(project: Project, proposalId: string, decision: Decision, note?: string): Project {
  const idx = project.proposals.findIndex((p) => p.id === proposalId);
  if (idx < 0) throw new WorkflowError(`unknown proposal "${proposalId}"`);
  const p = project.proposals[idx]!;
  if (p.status !== "pending") throw new WorkflowError(`proposal "${p.id}" is already decided`);
  const wf = project.workflow;
  if (wf && wf.steps[p.step] === "locked") {
    throw new WorkflowError(`step "${p.step}" is locked: finish "${wf.current}" first`);
  }
  let next = project;
  // Every decision is kept with the variants it was made on and its note: that is how Claude learns the creator's taste.
  const entry = note === undefined ? { variants: p.variants, decision } : { variants: p.variants, decision, note };
  const history = [...p.history, entry];
  let updated: Proposal;
  if (decision === "reject") {
    updated = { ...p, status: "rejected", history };
  } else if (decision === "more") {
    updated = { ...p, variants: [], history };
  } else {
    const v = p.variants.find((x) => x.key === decision);
    if (!v) throw new WorkflowError(`proposal "${p.id}" has no variant ${decision}`);
    next = applyPatch(project, v.patch);
    updated = { ...p, status: { accepted: decision }, revert: revertOf(project, v.patch), history };
  }
  next = { ...next, proposals: next.proposals.map((x, i) => (i === idx ? updated : x)) };
  return advance(next);
}

/** Closes the current step even when it has no proposals (e.g. no beat change), and opens the next one. */
export function closeStep(project: Project): Project {
  const wf = project.workflow;
  if (!wf) throw new WorkflowError("this project has no guided workflow");
  const pending = project.proposals.filter((p) => p.step === wf.current && p.status === "pending");
  if (pending.length) {
    throw new WorkflowError(`step "${wf.current}" still has pending proposals: ${pending.map((p) => p.id).join(", ")}`);
  }
  const steps = { ...wf.steps, [wf.current]: "done" as const };
  const nextStep = STEP_IDS[STEP_IDS.indexOf(wf.current) + 1];
  if (!nextStep) return { ...project, workflow: { current: wf.current, steps } };
  steps[nextStep] = "open";
  return advance({ ...project, workflow: { current: nextStep, steps } });
}

type Revert = NonNullable<Proposal["revert"]>;
type Plain = Record<string, unknown>;
const plain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

/** The leaves a style patch writes, as dotted paths (deepMerge goes into objects and replaces the rest). */
function leaves(patch: Plain, base: unknown, prefix = ""): string[] {
  return Object.entries(patch).flatMap(([k, v]) => {
    const at = plain(base) ? base[k] : undefined;
    return plain(v) && plain(at) ? leaves(v, at, `${prefix}${k}.`) : [`${prefix}${k}`];
  });
}
function getPath(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((x, k) => (plain(x) ? x[k] : undefined), o);
}
function setPath(o: Plain, path: string, value: unknown): Plain {
  const [k, ...rest] = path.split(".");
  const out = { ...o };
  if (!rest.length) { if (value === null || value === undefined) delete out[k!]; else out[k!] = value; return out; }
  const child = setPath(plain(out[k!]) ? (out[k!] as Plain) : {}, rest.join("."), value);
  if (Object.keys(child).length) out[k!] = child; else delete out[k!];
  return out;
}

/** What it takes to put the project back as it was before this patch. */
function revertOf(before: Project, patch: Patch): Revert {
  const rm = new Set(patch.removeElements ?? []);
  const style = Object.fromEntries(leaves(patch.setStyle ?? {}, before.styleOverrides).map((path) => [path, getPath(before.styleOverrides, path) ?? null]));
  return {
    ...(patch.setStory ? { story: before.story } : {}),
    ...(patch.setStructure ? { structure: before.structure ?? null } : {}),
    removed: before.elements.filter((e) => rm.has(e.id)),
    added: (patch.addElements ?? []).map((e) => e.id),
    captions: patch.addCaptions ?? [],
    style,
  };
}

function applyRevert(project: Project, r: Revert): Project {
  let next: Project = { ...project };
  if (r.story) next = { ...next, story: r.story };
  if (r.structure !== undefined) { const { structure: _, ...rest } = next; next = (r.structure === null ? rest : { ...rest, structure: r.structure }) as Project; }
  const added = new Set(r.added);
  next = { ...next, elements: [...next.elements.filter((e) => !added.has(e.id)), ...r.removed] };
  const captions = [...next.captions];
  for (const c of r.captions) { const i = captions.findIndex((x) => JSON.stringify(x) === JSON.stringify(c)); if (i >= 0) captions.splice(i, 1); }
  next = { ...next, captions };
  let style = next.styleOverrides as Plain;
  for (const [path, value] of Object.entries(r.style)) style = setPath(style, path, value);
  return { ...next, styleOverrides: style as Project["styleOverrides"] };
}

/** For a variant chosen before reverts were kept: what its patch added is taken back (the style it set is unset). */
function revertFromPatch(patch: Patch): Revert {
  return {
    removed: [],
    added: (patch.addElements ?? []).map((e) => e.id),
    captions: patch.addCaptions ?? [],
    style: Object.fromEntries(leaves(patch.setStyle ?? {}, undefined).map((path) => [path, null])),
  };
}

/** Replaces the variant chosen on an accepted proposal by another one: its changes are taken back, the new ones applied. */
export function switchVariant(project: Project, proposalId: string, key: VariantKey): Project {
  const idx = project.proposals.findIndex((p) => p.id === proposalId);
  if (idx < 0) throw new WorkflowError(`unknown proposal "${proposalId}"`);
  const p = project.proposals[idx]!;
  if (typeof p.status !== "object") throw new WorkflowError(`the ${p.step} proposal has no chosen variant to switch`);
  const chosen = p.variants.find((x) => x.key === (p.status as { accepted: VariantKey }).accepted);
  if (p.status.accepted === key) return project;
  const v = p.variants.find((x) => x.key === key);
  if (!v) throw new WorkflowError(`the ${p.step} proposal has no variant ${key}`);
  const back = applyRevert(project, p.revert ?? revertFromPatch(chosen?.patch ?? {}));
  const next = applyPatch(back, v.patch);
  const updated: Proposal = { ...p, status: { accepted: key }, revert: revertOf(back, v.patch), history: [...p.history, { variants: p.variants, decision: key }] };
  return { ...next, proposals: next.proposals.map((x, i) => (i === idx ? updated : x)) };
}

/** The project with one variant of a proposal: added on top when the proposal is pending, in place of the chosen one when decided. */
export function withVariant(project: Project, proposalId: string, key: VariantKey): Project {
  const p = project.proposals.find((x) => x.id === proposalId);
  if (!p) throw new WorkflowError(`unknown proposal "${proposalId}"`);
  if (typeof p.status === "object") return switchVariant(project, proposalId, key);
  const v = p.variants.find((x) => x.key === key);
  if (!v) throw new WorkflowError(`the ${p.step} proposal has no variant ${key}`);
  return applyPatch(project, v.patch);
}

/** The project without the variant chosen on a proposal (as before the choice); a pending proposal changes nothing. */
export function withoutVariant(project: Project, proposalId: string): Project {
  const p = project.proposals.find((x) => x.id === proposalId);
  if (!p || typeof p.status !== "object") return project;
  const chosen = p.variants.find((x) => x.key === (p.status as { accepted: VariantKey }).accepted);
  return applyRevert(project, p.revert ?? revertFromPatch(chosen?.patch ?? {}));
}
