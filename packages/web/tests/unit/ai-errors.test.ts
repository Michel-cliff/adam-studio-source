import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aiFailureOf, aiFailureText } from "../../server/ai-errors";
import { AiError, aiRunner } from "../../server/ai";
import { createApp } from "../../server/app";
import { JobManager } from "../../server/jobs";
import { watchRef } from "../../server/refwatch";
import { setProjectsRoot, setUiLang } from "../../server/settings";
import { addRef } from "../../server/stats";

const ev = (o: unknown) => JSON.stringify(o);
const codexLimit = [ev({ type: "thread.started" }), ev({ type: "turn.started" }),
  ev({ type: "error", message: "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro) or try again at 8:34 PM." }),
  ev({ type: "turn.failed", error: { message: "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro) or try again at 8:34 PM." } })].join("\n");

describe("what went wrong with the AI", () => {
  it("is read from what Codex and Claude really print", () => {
    expect(aiFailureOf(codexLimit)).toEqual({ problem: "quota", retry: "8:34 PM" });
    expect(aiFailureOf(ev({ type: "result", is_error: true, result: "Claude AI usage limit reached|1793817600" }))?.problem).toBe("quota");
    expect(aiFailureOf(ev({ type: "turn.failed", error: { message: "401 Unauthorized" } }))?.problem).toBe("signin");
    expect(aiFailureOf("Invalid API key · Please run /login")?.problem).toBe("signin");
    expect(aiFailureOf("could not start the AI: spawn codex ENOENT")?.problem).toBe("missing");
    expect(aiFailureOf("the AI took too long to answer")?.problem).toBe("timeout");
    expect(aiFailureOf(ev({ type: "error", message: "stream error: getaddrinfo ENOTFOUND api.openai.com" }))?.problem).toBe("network");
  });
  it("does not take the content of a successful run for a failure", () => {
    expect(aiFailureOf(ev({ type: "item.completed", item: { type: "agent_message", text: "Your usage limit advice: rate limit, 401, sign in." } }))).toBeNull();
    expect(aiFailureOf(ev({ type: "result", is_error: false, result: "usage limit" }))).toBeNull();
    expect(aiFailureOf("Reading additional input from stdin...")).toBeNull();
  });
  it("says which AI, what happened and what to do, in the creator's language", () => {
    expect(aiFailureText({ problem: "quota", retry: "8:34 PM" }, "codex", "fr")).toBe("Codex a atteint sa limite d'utilisation (de nouveau disponible à 8:34 PM). Change d'IA pour continuer tout de suite.");
    expect(aiFailureText({ problem: "quota" }, "claude", "en")).toBe("Claude has reached its usage limit. Switch AI to carry on right away.");
    for (const problem of ["signin", "missing", "timeout", "network"] as const) expect(aiFailureText({ problem }, "codex", "fr")).toMatch(/Codex.*change d'IA/i);
  });
});

describe("an AI failure on its way to the creator", () => {
  const fakeCodex = (out: string) => {
    const file = join(mkdtempSync(join(tmpdir(), "adam-ai-")), "fake.cjs");
    writeFileSync(file, `process.stdout.write(${JSON.stringify(out + "\n")});console.error("Reading additional input from stdin...");process.exitCode=1;process.exit(1);`);
    return { NODE_OPTIONS: `--require ${file}` };
  };
  const withCodex = async <T,>(fn: () => Promise<T>) => {
    const before = process.env.ADAM_CODEX; process.env.ADAM_CODEX = process.execPath;
    try { return await fn(); } finally { if (before === undefined) delete process.env.ADAM_CODEX; else process.env.ADAM_CODEX = before; }
  };

  it("comes out of the runner as a clear AiError", async () => {
    const env = fakeCodex(codexLimit);
    await withCodex(async () => {
      const ask = aiRunner(() => "codex", () => "default", 20000, () => env, () => "fr");
      const e = await ask({ prompt: "x" }).catch((x) => x);
      expect(e).toBeInstanceOf(AiError);
      expect(e.message).toMatch(/^Codex a atteint sa limite/);
    });
  }, 30000);

  it("is kept on a reference, which can then offer to switch AI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "adam-ref-"));
    const clip = join(dir, "clip.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x568:rate=25:duration=2", "-pix_fmt", "yuv420p", clip]);
    const ref = addRef(dir, { name: "x", file: clip } as never);
    const failed = await watchRef(dir, ref, (async () => { throw new AiError("Codex a atteint sa limite", { problem: "quota" }); }) as never);
    expect(failed).toMatchObject({ status: "failed", error: "Codex a atteint sa limite", aiFailed: true });
    const other = await watchRef(dir, ref, (async () => { throw new Error("something else"); }) as never);
    expect(other.status).toBe("failed");
    expect(other.aiFailed).toBeFalsy();
  }, 60000);

  it("marks an ask job that failed for this reason, and only those", async () => {
    const jobs = new JobManager();
    const run = (label: string, out: string) => new Promise<{ ai?: unknown; state: string }>((done) => {
      const job = jobs.start(label, { cmd: process.execPath, args: ["-e", `process.stdout.write(${JSON.stringify(out)});process.exit(1)`], label }, (j) => done(j as never));
      void job;
    });
    expect((await run("Codex: hook", codexLimit)).ai).toEqual({ problem: "quota", retry: "8:34 PM" });
    expect((await run("Render", "the usage limit of something")).ai).toBeUndefined();
  }, 30000);

  it("reaches the interface marked as an AI failure, in plain words", async () => {
    const root = mkdtempSync(join(tmpdir(), "adam-route-")), settingsFile = join(root, "ui.json");
    setProjectsRoot(root, settingsFile); setUiLang("fr", settingsFile);
    mkdirSync(join(root, "p"));
    const server = createApp({ settingsFile, dist: join(root, "none"), ai: (async () => { throw new AiError("Codex a atteint sa limite d'utilisation.", { problem: "quota" }); }) as never }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    try {
      const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/stats/videos/x/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Une question" }) });
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: "Codex a atteint sa limite d'utilisation.", aiFailure: true });
    } finally { server.close(); }
  });
});
