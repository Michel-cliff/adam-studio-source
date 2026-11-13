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
    override list(name: string) { return this.active?.project === name ? [this.active] : []; }
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

it("goes on alone after the import when the creator asked for it, and only then", async () => {
  class InstantJobs extends JobManager {
    labels: string[] = [];
    override start(project: string, c: Command, onEnd?: (j: JobView) => void) {
      this.labels.push(c.label);
      const job: JobView = { id: `f${this.labels.length}`, project, label: c.label, state: c.label === "New project" ? "done" : "running", output: "", startedAt: Date.now(), hint: null };
      // The import has written the project by the time it ends.
      if (c.label === "New project") {
        const dir = join(root, project); mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "style.json"), JSON.stringify(styleInput));
        writeFileSync(join(dir, "project.json"), JSON.stringify({ ...projectInput(), proposals: [] }));
        setTimeout(() => onEnd?.(job), 0);
      }
      return job;
    }
  }
  const root = mkdtempSync(join(tmpdir(), "adam-new-auto-"));
  const video = join(root, "take.mp4"); writeFileSync(video, "x");
  const settingsFile = join(root, "ui.json"); writeFileSync(settingsFile, JSON.stringify({ projectsRoot: root, engine: "claude" }));
  const jobs = new InstantJobs();
  const server = createApp({ settingsFile, jobs, home: root, ai: async () => "unused" }).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects`;
  const create = (name: string, auto: boolean) => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, videos: [video], format: "9:16", auto }) });
  const status = async (name: string) => (await fetch(`${base}/${name}/auto`)).json();
  try {
    expect((await create("plain", false)).status).toBe(202);
    await new Promise(r => setTimeout(r, 50));
    expect(await status("plain")).toBeNull();
    expect((await create("alone", true)).status).toBe(202);
    await new Promise(r => setTimeout(r, 50));
    expect(await status("alone")).not.toBeNull();
  } finally { server.closeAllConnections(); server.close(); }
});
