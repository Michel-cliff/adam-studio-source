import { describe, expect, it } from "vitest";
import { Autopilot, type Pilot } from "../../server/autopilot";

function waiting(step: "structure" | "hook" | "render") {
  let release!: () => void;
  const wait = new Promise<void>(r => { release = r; });
  const log: string[] = [];
  const pilot: Pilot = {
    load: () => ({ workflow: { current: step === "render" ? "look" : step, steps: { [step]: step === "render" ? "done" : "open" } }, proposals: [] }),
    firstPass() {}, decide() { log.push("decide"); }, close() { log.push("close"); },
    ask: async () => { log.push("ask"); await wait; },
    render: async () => { log.push("render"); await wait; return false; },
    script: async (_dir, signal) => { log.push("script"); await wait; signal?.throwIfAborted(); },
    stop: name => { log.push(`stop ${name}`); release(); },
  };
  return { pilot, log, release };
}

describe("stopping auto mode", () => {
  for (const step of ["structure", "hook", "render"] as const) {
    it(`interrupts ${step} and never advances or reports failure after cancellation`, async () => {
      const { pilot, log } = waiting(step);
      const auto = new Autopilot(pilot);
      const run = auto.start("my video", "/isolated");
      auto.stop("my video");
      expect(auto.status("my video")).toMatchObject({ state: "running", label: "Stopping" });
      expect(() => auto.start("my video", "/isolated")).toThrow(/already running/);
      auto.stop("my video");
      expect(await run).toMatchObject({ state: "stopped" });
      expect(log).toEqual([step === "structure" ? "script" : step === "hook" ? "ask" : "render", "stop my video"]);
      expect(auto.status("my video")).not.toHaveProperty("controller");
      expect(auto.status("my video")).not.toHaveProperty("error");
    });
  }
});

it("stops every auto run when its desktop server closes", async () => {
  const { pilot, log } = waiting("hook");
  const auto = new Autopilot(pilot);
  const one = auto.start("one", "/one"), two = auto.start("two", "/two");
  expect(auto.hasRunning()).toBe(true);
  auto.stopAll();
  expect((await one).state).toBe("stopped");
  expect((await two).state).toBe("stopped");
  expect(auto.hasRunning()).toBe(false);
  expect(log).not.toContain("close");
});
