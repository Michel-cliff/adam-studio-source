import { describe, expect, it } from "vitest";
import { BusyError, hintOf, JobManager, laneOf, progressOf } from "../../server/jobs";
import type { JobEvent, JobView } from "../../server/types";

const node = (code: string, label = "test") => ({ cmd: process.execPath, args: ["-e", code], label });
const ended = (m: JobManager, id: string) => new Promise<JobView>((res) => {
  const j = m.get(id)!;
  if (j.state !== "running" && j.state !== "queued") return res(j);
  m.subscribe(id, (e: JobEvent) => { if (e.type === "end") res(e.job); });
});

describe("JobManager", () => {
  it("finishes a synchronous spawn failure and releases the next queued writer", async () => {
    const m = new JobManager();
    const first = m.start("p", node(forever, "Claude: hook"));
    const bad = m.start("p", {cmd: process.execPath, args: [String.fromCharCode(0)], label: "Claude: sound"});
    const next = m.start("p", node("console.log('recovered')", "Claude: look"));
    m.stop(first.id);
    expect((await ended(m, bad.id)).state).toBe("failed");
    expect((await ended(m, next.id)).output).toContain("recovered");
    expect(m.hasRunning()).toBe(false);
  });

  it("stops every project job before a queued writer can start and allows restarting", async () => {
    const m = new JobManager();
    const first = m.start("p", node(forever, "Claude: hook"));
    const second = m.start("p", node("console.log('must not run')", "Codex: sound"));
    const elsewhere = m.start("q", node(forever, "Claude: hook"));
    try {
      m.stopProject("p");
      expect((await ended(m, first.id)).state).toBe("stopped");
      expect(m.get(second.id)!.state).toBe("stopped");
      expect(m.get(second.id)!.output).toBe("");
      expect(elsewhere.state).toBe("running");
      expect((await ended(m, m.start("p", node("", "Codex: sound")).id)).state).toBe("done");
    } finally { m.stopProject("q"); await ended(m, elsewhere.id); }
  });

  it("collects output and the exit state", async () => {
    const m = new JobManager();
    const ok = await ended(m, m.start("p", node("console.log('hello'); console.error('oops')")).id);
    expect(ok.state).toBe("done");
    expect(ok.output).toContain("hello");
    expect(ok.output).toContain("oops");
    const bad = await ended(m, m.start("p", node("process.exit(3)")).id);
    expect(bad.state).toBe("failed");
  });

  const forever = "setTimeout(() => {}, 20000)";

  it("does heavy work one at a time on the whole computer: the next one waits its turn, nothing is refused", async () => {
    const m = new JobManager();
    const render = m.start("p", node(forever, "Render"));
    const other = m.start("q", node("console.log('second')", "Render"));
    expect(render.state).toBe("running");
    expect(other.state).toBe("queued");
    expect(m.tasks().find((t) => t.id === other.id)?.position).toBe(1);
    m.stop(render.id);
    expect((await ended(m, other.id)).output).toContain("second");
  });

  it("lets the AI and light work run beside heavy work", async () => {
    const m = new JobManager();
    const render = m.start("p", node(forever, "Render"));
    const ask = m.start("p", node("", "Claude: hook"));
    const elsewhere = m.start("q", node("", "Claude: hook"));
    const light = m.start("q", node("", "Studio"));
    for (const j of [ask, elsewhere, light]) expect(j.state).toBe("running");
    await Promise.all([ask, elsewhere, light].map((j) => ended(m, j.id)));
    m.stop(render.id);
    await ended(m, render.id);
  });

  it("keeps what writes to a project alone among writers, and keeps the order", async () => {
    const m = new JobManager();
    const ask = m.start("p", node(forever, "Claude: hook"));
    const analyze = m.start("p", node("console.log('analyzed')", "Analyze"));
    const later = m.start("p", node("console.log('asked')", "Claude: sound"));
    expect(analyze.state).toBe("queued");
    expect(later.state).toBe("queued");
    m.stop(ask.id);
    await ended(m, analyze.id);
    expect((await ended(m, later.id)).output).toContain("asked");
  });

  it("answers the same work asked twice with the one job, and tells both callers", async () => {
    const m = new JobManager();
    let heard = 0;
    const one = m.start("p", node("", "Render"), () => { heard++; });
    const two = m.start("p", node("", "Render"), () => { heard++; });
    expect(two.id).toBe(one.id);
    await ended(m, one.id);
    expect(heard).toBe(2);
    const ask = m.start("p", node(forever, "Claude: hook"));
    expect(() => m.start("p", node("", "Claude: hook"))).toThrow(BusyError);
    m.stop(ask.id);
    await ended(m, ask.id);
  });

  it("takes a waiting job out of the line when it is stopped, without running it", async () => {
    const m = new JobManager();
    const first = m.start("p", node(forever, "Render"));
    const second = m.start("q", node("console.log('ran')", "Render"));
    const third = m.start("r", node("", "Render"));
    expect(m.stop(second.id)).toBe(true);
    expect(m.get(second.id)!.state).toBe("stopped");
    expect(m.get(second.id)!.output).toBe("");
    expect(m.tasks().find((t) => t.id === third.id)?.position).toBe(1);
    m.stop(first.id);
    await ended(m, third.id);
  });

  it("counts a waiting job as work in progress when the app closes, and stops it", async () => {
    const m = new JobManager();
    const first = m.start("p", node(forever, "Render"));
    const second = m.start("q", node("", "Render"));
    expect(m.hasRunning()).toBe(true);
    m.stopAll();
    await ended(m, first.id);
    expect(m.get(second.id)!.state).toBe("stopped");
    expect(m.hasRunning()).toBe(false);
  });

  it("runs work done in-process through the same list, and can stop it", async () => {
    const m = new JobManager();
    let aborted = false;
    const j = m.task("", "Reference", "My video", (signal) => new Promise((_, no) => { signal.addEventListener("abort", () => { aborted = true; no(new Error("stopped")); }); }));
    expect(j.state).toBe("running");
    expect(m.tasks()[0]).toMatchObject({ label: "Reference", detail: "My video", lane: "light" });
    m.stop(j.id);
    expect((await ended(m, j.id)).state).toBe("stopped");
    expect(aborted).toBe(true);
  });

  it("reads where a render is from its output", async () => {
    expect(progressOf("rendering: 5 %\nrendering: 35 %, about 4 min left\n")).toEqual({ percent: 35, minutesLeft: 4 });
    expect(progressOf("warn pace")).toBeNull();
    const m = new JobManager();
    const j = await ended(m, m.start("p", node("console.log('rendering: 40 %, about 2 min left')", "Render")).id);
    expect(j.progress).toBe(40);
    expect(j.minutesLeft).toBe(2);
  });

  it("sorts the work by what it takes from the computer", () => {
    expect(laneOf("Render")).toBe("heavy");
    expect(laneOf("New project")).toBe("heavy");
    expect(laneOf("Claude: hook")).toBe("ai");
    expect(laneOf("Codex: hook (do)")).toBe("ai");
    expect(laneOf("Reference")).toBe("light");
  });

  it("stops the whole process tree", async () => {
    const m = new JobManager();
    const code = "const c = require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => console.log(\"child\"), 100)'], { stdio: 'inherit' }); setTimeout(() => {}, 60000)";
    const j = m.start("p", node(code));
    await new Promise((r) => setTimeout(r, 600));
    m.stop(j.id);
    const done = await ended(m, j.id);
    expect(done.state).toBe("stopped");
    const len = m.get(j.id)!.output.length;
    await new Promise((r) => setTimeout(r, 400));
    expect(m.get(j.id)!.output.length).toBe(len);
  });

  it("streams output to subscribers and finds the Studio link", async () => {
    const m = new JobManager();
    const j = m.start("p", node("console.log('Server ready - Local: http://localhost:3001'); setTimeout(() => {}, 200)"));
    const seen: string[] = [];
    m.subscribe(j.id, (e) => { if (e.type === "output") seen.push(e.text); });
    const done = await ended(m, j.id);
    expect(seen.join("")).toContain("Server ready");
    expect(done.link).toBe("http://localhost:3001");
  });

  it("keeps the last jobs of each project", async () => {
    const m = new JobManager(2);
    for (let i = 0; i < 3; i++) await ended(m, m.start("p", node(`console.log(${i})`)).id);
    expect(m.list("p").map((j) => j.output.trim())).toEqual(["2", "1"]);
  });

  it("reports a command that cannot start", async () => {
    const m = new JobManager();
    const j = await ended(m, m.start("p", { cmd: "no-such-program-xyz", args: [], label: "x" }).id);
    expect(j.state).toBe("failed");
    expect(j.output).toMatch(/ENOENT/);
  });
});

describe("hintOf", () => {
  it("names what would let a refused job through", () => {
    expect(hintOf("ERROR proposals.pending: 1\nRefusing to render: fix the errors above, or pass --force.")).toBe("force");
    expect(hintOf("Refusing to export: fix the errors above")).toBe("force");
    expect(hintOf('CapCut project "x" has been opened in CapCut since the last export: edits made there would be lost. Pass --replace to overwrite it')).toBe("replace");
    expect(hintOf('CapCut project "x" exists and was not created by Adam Studio')).toBeNull();
  });
});

it("closes unused input so a headless command cannot wait forever for additional stdin", async () => {
 const jobs = new JobManager();
 const j = jobs.start("stdin-test", {cmd:process.execPath,args:["-e","process.stdin.resume();process.stdin.on('end',()=>console.log('input closed'))"],label:"Codex input regression"});
 try {
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("stdin remained open")),4000);jobs.subscribe(j.id,e=>{if(e.type==="end"){clearTimeout(timer);resolve();}});});
  expect(jobs.get(j.id)?.state).toBe("done");expect(jobs.get(j.id)?.output).toContain("input closed");
 }finally{jobs.stopAll();}
});
