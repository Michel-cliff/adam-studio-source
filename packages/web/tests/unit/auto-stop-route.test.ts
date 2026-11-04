import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createApp } from "../../server/app";
import { JobManager } from "../../server/jobs";
import type { JobView } from "../../server/types";
import type { Command } from "../../server/actions";
import { projectInput, styleInput } from "../../../render/tests/unit/helpers";

it("the global stop endpoint interrupts the active job without opening that step", async () => {
  class ControlledJobs extends JobManager {
    active?: JobView;
    done?: (j: JobView) => void;
    override start(project: string, c: Command, onEnd?: (j: JobView) => void) {
      this.done = onEnd;
      return this.active = { id: "fake1", project, label: c.label, state: "running", output: "", startedAt: Date.now(), hint: null };
    }
    override running(name: string) { return this.active?.project === name && this.active.state === "running" ? this.active : undefined; }
    override stop(id: string) {
      if (this.active?.id !== id) return false;
      this.active.state = "stopped";
      this.done?.(this.active);
      return true;
    }
  }
  const root = mkdtempSync(join(tmpdir(), "adam-auto-stop-route-"));
  const dir = join(root, "demo"); mkdirSync(dir);
  const steps = ["cuts", "structure", "captions", "hook", "beats", "visuals", "sound", "look"];
  writeFileSync(join(dir, "style.json"), JSON.stringify(styleInput));
  writeFileSync(join(dir, "project.json"), JSON.stringify({ ...projectInput(), proposals: [], workflow: { current: "hook", steps: Object.fromEntries(steps.map((s, i) => [s, i < 3 ? "done" : i === 3 ? "open" : "locked"])) } }));
  const settingsFile = join(root, "ui.json"); writeFileSync(settingsFile, JSON.stringify({ projectsRoot: root, engine: "claude" }));
  const jobs = new ControlledJobs();
  const server = createApp({ settingsFile, jobs, home: root, ai: async () => "unused" }).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects/demo/auto`;
  const action = (action: string) => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
  try {
    expect((await action("start")).status).toBe(202);
    expect(jobs.active).toMatchObject({ state: "running", label: "Claude: hook" });
    expect((await action("stop")).status).toBe(200);
    await new Promise(r => setTimeout(r, 10));
    expect(await (await fetch(base)).json()).toMatchObject({ state: "stopped", step: "hook" });
    expect(jobs.active?.state).toBe("stopped");
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});
