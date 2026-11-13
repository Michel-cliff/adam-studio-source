import { describe, expect, it } from "vitest";
import { Autopilot, type Pilot } from "../../server/autopilot";

const STEPS = ["cuts", "structure", "captions", "hook", "beats", "visuals", "sound", "look"];

/** A project in memory: the first pass proposes cuts, every ask proposes A and B for its step. */
function fake(opts: { askFails?: string; soundMixed?: boolean; pendingSound?: boolean } = {}) {
  let wf: { current: string; steps: Record<string, string> } | null = null;
  const proposals: { id: string; step: string; status: unknown; variants: { key: string }[] }[] = [];
  const log: string[] = [];
  const next = () => {
    wf!.steps[wf!.current] = "done";
    const i = STEPS.indexOf(wf!.current);
    if (STEPS[i + 1]) { wf!.current = STEPS[i + 1]!; wf!.steps[wf!.current] = "open"; }
  };
  const pilot: Pilot = {
    load: () => ({ workflow: wf && { ...wf, steps: { ...wf.steps } }, proposals: proposals.map((p) => ({ ...p })) }),
    firstPass: () => {
      wf = { current: "cuts", steps: Object.fromEntries(STEPS.map((s) => [s, s === "cuts" ? "open" : "locked"])) };
      if (opts.pendingSound) proposals.push({ id: "p.sound", step: "sound", status: "pending", variants: [{ key: "A" }] });
      log.push("first pass");
    },
    decide: (_d, id, k) => {
      const p = proposals.find((x) => x.id === id)!;
      p.status = { accepted: k };
      log.push(`decide ${id} ${k}`);
      if (!proposals.some((x) => x.step === p.step && x.status === "pending")) next();
    },
    close: () => { log.push(`close ${wf!.current}`); next(); },
    ask: async (_n, _d, step) => {
      log.push(`ask ${step}`);
      if (opts.askFails !== step) proposals.push({ id: `p.${step}`, step, status: "pending", variants: [{ key: "A" }, { key: "B" }] });
    },
    render: async () => { log.push("render"); return true; },
    script: async () => { log.push("script"); },
    ...(opts.soundMixed ? { soundMixed: () => true } : {}),
  };
  return { pilot, log };
}

describe("auto mode", () => {
  it("waits for the stopped generation before allowing a new run", async () => {
    const { pilot } = fake();
    const originalAsk = pilot.ask;
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    pilot.ask = async () => {
      started();
      await new Promise<void>(resolve => { release = resolve; });
      throw new Error("generation stopped");
    };
    pilot.stop = () => release();
    const auto = new Autopilot(pilot);
    const first = auto.start("v", "/v");
    await ready;
    auto.stop("v");
    expect(() => auto.start("v", "/v")).toThrow(/already running/);
    expect((await first).state).toBe("stopped");
    pilot.ask = originalAsk;
    expect((await auto.start("v", "/v")).state).toBe("done");
  });

  it("runs every step, takes the first variant, writes the script instead of story shapes, then renders", async () => {
    const { pilot, log } = fake();
    const s = await new Autopilot(pilot).start("v", "/v");
    expect(s.state).toBe("done");
    expect(log).toEqual([
      "first pass", "close cuts", "script", "close structure", "ask captions", "decide p.captions A",
      "ask hook", "decide p.hook A", "close beats", "ask visuals", "decide p.visuals A", "ask sound", "decide p.sound A", "close look", "render",
    ]);
  });
  it("adds no sound on its own to a take whose sound is already mixed: the sound step is closed, never asked", async () => {
    const { pilot, log } = fake({ soundMixed: true });
    expect((await new Autopilot(pilot).start("v", "/v")).state).toBe("done");
    expect(log).not.toContain("ask sound");
    expect(log).toContain("close sound");
    expect(log).toContain("ask visuals");
  });
  it("rejects an already pending sound variant for a mixed take", async () => {
    const { pilot, log } = fake({ soundMixed: true, pendingSound: true });
    expect((await new Autopilot(pilot).start("v", "/v")).state).toBe("done");
    expect(log).toContain("decide p.sound reject");
    expect(log).not.toContain("decide p.sound A");
  });
  it("moves on when the AI proposes nothing for a step", async () => {
    const { pilot, log } = fake({ askFails: "hook" });
    expect((await new Autopilot(pilot).start("v", "/v")).state).toBe("done");
    expect(log).toContain("close hook");
  });
  it("runs once at a time per video", () => {
    const a = new Autopilot(fake().pilot);
    void a.start("v", "/v");
    expect(() => a.start("v", "/v")).toThrow(/already running/);
  });
});
