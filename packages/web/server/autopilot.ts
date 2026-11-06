// Auto mode: the steps run by themselves. The story keeps the script; each other step asks the AI for its variants, takes the first one (the AI puts its
// best first), closes the step and goes on; at the end the video is rendered. The creator then comes back to any step,
// picks another variant, and the video is rendered again.
import { PRESETS, STEP_PRESET } from "./presets";

type Proposal = { id: string; step: string; status: unknown; variants: { key: string }[] };
type Project = { workflow?: { current: string; steps: Record<string, string> } | null; proposals: Proposal[] };

export interface Pilot {
  load(dir: string): Project;
  firstPass(dir: string): void;
  decide(dir: string, proposal: string, decision: string): void;
  close(dir: string): void;
  /** Starts the AI on a step; resolves when its job ends. */
  ask(name: string, dir: string, step: string, prompt: string): Promise<void>;
  /** Renders the MP4; resolves when the job ends, true when it worked. */
  render(name: string, dir: string): Promise<boolean>;
  /** Writes the script from the transcript when the creator has none. */
  script(dir: string, signal?: AbortSignal): Promise<void>;
  /** Interrupts the process owned by this project. */
  stop?(name: string): void;
  /** True when a take's sound is already mixed (flagged at import): auto mode then adds no sound on its own. */
  soundMixed?(dir: string): boolean;
}

export type AutoState = { state: "running" | "done" | "stopped" | "failed"; step: string; label: string; error?: string; at: number };

const LABELS: Record<string, string> = {
  cuts: "Reading your video", structure: "Shaping the story", captions: "Styling the captions", hook: "Writing the hook",
  beats: "Placing the beats", visuals: "Adding the visuals", sound: "Mixing the sound", look: "Grading the look", render: "Rendering the video",
};

export class Autopilot {
  private runs = new Map<string, AutoState & { stop?: boolean; controller: AbortController }>();
  constructor(private pilot: Pilot) {}

  status(name: string): AutoState | null {
    const r = this.runs.get(name);
    if (!r) return null;
    const { stop: _, controller: __, ...s } = r;
    return s;
  }

  stop(name: string): void {
    const r = this.runs.get(name);
    if (r?.state === "running" && !r.stop) {
      r.stop = true; r.label = "Stopping"; r.at = Date.now();
      r.controller.abort(); this.pilot.stop?.(name);
    }
  }

  hasRunning(): boolean { return [...this.runs.values()].some(r => r.state === "running"); }
  stopAll(): void { for (const name of this.runs.keys()) this.stop(name); }

  /** Runs the remaining steps of a project; one run at a time per project. */
  start(name: string, dir: string): Promise<AutoState> {
    if (this.runs.get(name)?.state === "running") throw new Error("auto mode is already running on this video");
    const r: AutoState & { stop?: boolean; controller: AbortController } = { state: "running", step: "", label: "Starting", at: Date.now(), controller: new AbortController() };
    this.runs.set(name, r);
    const set = (step: string) => { r.step = step; r.label = LABELS[step] ?? step; r.at = Date.now(); };
    const asked = new Set<string>();
    const go = async (): Promise<void> => {
      for (let guard = 0; guard < 60; guard++) {
        if (r.stop) { r.state = "stopped"; return; }
        const p = this.pilot.load(dir);
        if (!p.workflow) { set("cuts"); this.pilot.firstPass(dir); continue; }
        const wf = p.workflow;
        if (Object.values(wf.steps).every((s) => s === "done")) {
          set("render");
          const rendered = await this.pilot.render(name, dir);
          if (r.stop) { r.state = "stopped"; return; }
          r.state = rendered ? "done" : "failed";
          if (r.state === "failed") r.error = "the render failed: open Wrap to see why";
          return;
        }
        const step = wf.current;
        set(step);
        const pending = p.proposals.find((x) => x.step === step && x.status === "pending");
        if (pending) { this.pilot.decide(dir, pending.id, pending.variants[0]?.key ?? "reject"); continue; }
        // The story needs no shapes to pick from: the script (the creator's, or written from the transcript) is enough.
        if (step === "structure") { await this.pilot.script(dir, r.controller.signal); if (r.stop) { r.state = "stopped"; return; } this.pilot.close(dir); continue; }
        // A take whose sound is already mixed gets no music or effects unless the creator asks for them by hand: auto mode never asks.
        if (step === "sound" && this.pilot.soundMixed?.(dir)) { this.pilot.close(dir); continue; }
        const preset = STEP_PRESET[step];
        if (preset && !asked.has(step) && !p.proposals.some((x) => x.step === step)) {
          asked.add(step);
          await this.pilot.ask(name, dir, step, PRESETS[preset]!.prompt);
          continue;
        }
        this.pilot.close(dir);
      }
      r.state = "failed"; r.error = "auto mode went round in circles: finish the steps by hand";
    };
    return go().then(() => this.status(name)!, (e) => { r.state = r.stop ? "stopped" : "failed"; if (!r.stop) r.error = (e as Error).message; return this.status(name)!; });
  }
}
