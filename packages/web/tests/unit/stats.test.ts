import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiCommand, fullAnswer, jsonIn } from "../../server/ai";
import { askCommand } from "../../server/claude";
import { createApp } from "../../server/app";
import { setProjectsRoot } from "../../server/settings";
import { addRef, addRule, learnedFor, trends, updateRef } from "../../server/stats";

let server: Server; let base: string; let root: string; let dir: string;
const asked: { prompt: string; images?: string[] }[] = [];
// Answers the way the real AI is asked to, by the kind of question.
const fake = async (q: { prompt: string; images?: string[] }) => {
  asked.push(q);
  if (/statistics page/.test(q.prompt)) return 'Here: {"views": "12.4K", "kept3s": "61%", "bogus": "x"}';
  if (/reference video/.test(q.prompt)) return JSON.stringify({ title: "RESULT FIRST", saw: [{ k: "HOOK", v: "The result in the first second." }, { k: "SOUND", v: "A click on each screen." }],
    beats: [{ label: "Result", weight: 1, kind: "hook" }, { label: "Steps", weight: 3, kind: "steps" }], traits: ["Result shown in the first second"] });
  if (/Review these rules/.test(q.prompt)) return '{"say": "Two rules repeat each other.", "rules": [{"topic": "hook", "text": "Open on the result."}], "off": ["nope"]}';
  if (/next video/.test(q.prompt)) return '{"say": "Keep the title behind the head.", "rules": [{"topic": "hook", "text": "Title behind the head in the first second."}]}';
  return "The title held them: keep it.";
};
const json = (path: string, method = "GET", body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json() }));
const until = async (ok: () => Promise<boolean>) => { for (let i = 0; i < 100; i++) { if (await ok()) return; await new Promise((r) => setTimeout(r, 200)); } throw new Error("timed out"); };

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "adam stats-"));
  dir = join(root, "settings");
  mkdirSync(join(root, "ep1", "renders"), { recursive: true });
  writeFileSync(join(root, "ep1", "project.json"), JSON.stringify({ version: 1, name: "ep1", canvas: { format: "9:16", fps: 30 }, style: "style.json", assets: [], story: [] }));
  writeFileSync(join(root, "ep1", "renders", "ep1.mp4"), "x");
  const settingsFile = join(dir, "ui.json");
  setProjectsRoot(root, settingsFile);
  server = createApp({ settingsFile, dist: join(root, "no-dist"), home: join(root, "home"), ai: fake }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("my videos", () => {
  it("lists the exported videos and keeps their numbers, note and links", async () => {
    const s = (await json("/api/stats")).json;
    expect(s.videos.map((v: { name: string }) => v.name)).toEqual(["ep1"]);
    const r = await json("/api/stats/videos/ep1", "PUT", { metrics: { views: "1200", kept3s: "58%" }, note: "The title worked.", links: ["https://www.tiktok.com/@me/video/1"] });
    expect(r.json.videos[0]).toMatchObject({ where: "TT", stats: { metrics: { views: "1200", kept3s: "58%" }, note: "The title worked." } });
    expect((await json("/api/stats/videos/ep1", "PUT", { metrics: { mood: "1" } })).status).toBe(400);
    expect((await json("/api/stats/videos/ep1", "PUT", { links: ["javascript:alert(1)"] })).status).toBe(400);
    expect((await json("/api/stats/videos/ep1", "PUT", { metrics: { views: "" } })).json.videos[0].stats.metrics).toEqual({ kept3s: "58%" });
  });

  it("talks about a video with its numbers and keeps the conversation", async () => {
    const r = await json("/api/stats/videos/ep1/chat", "POST", { text: "Why did people stay?" });
    expect(r.json.videos[0].stats.chat.map((m: { who: string; text: string }) => [m.who, m.text])).toEqual([["you", "Why did people stay?"], ["ai", "The title held them: keep it."]]);
    expect(asked.at(-1)!.prompt).toMatch(/Kept at 3 s: 58%/);
    expect(asked.at(-1)!.prompt).toMatch(/The title worked/);
  });

  it("reads the numbers off a screenshot of the stats page", async () => {
    const r = await fetch(`${base}/api/stats/videos/ep1/screenshot?name=stats.png`, { method: "POST", body: "png bytes" }).then((x) => x.json());
    expect(r.read).toEqual(["views", "kept3s"]);
    expect(r.videos[0].stats.metrics).toMatchObject({ views: "12.4K", kept3s: "61%" });
    expect(asked.at(-1)!.images![0]).toMatch(/stats\.png$/);
    expect((await fetch(`${base}/api/stats/videos/ep1/screenshot?name=evil.exe`, { method: "POST", body: "x" })).status).toBe(400);
  });

  it("asks for the next strategy, keeps its rules and answers in the video's conversation", async () => {
    const r = await json("/api/stats/strategy", "POST", { video: "ep1" });
    expect(r.json.say).toBe("Keep the title behind the head.");
    expect(r.json.rules.map((x: { text: string; source: string }) => [x.text, x.source])).toContainEqual(["Title behind the head in the first second.", "YOUR NUMBERS"]);
    expect(r.json.videos[0].stats.chat.at(-1).text).toBe("Keep the title behind the head.");
  });
});

describe("references", () => {
  it("watches a dropped video: frames to the AI, what it saw, the structure, the trends", async () => {
    const clip = join(root, "ref.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x568:rate=25:duration=2", "-pix_fmt", "yuv420p", clip]);
    const up = await fetch(`${base}/api/stats/refs/upload?name=kaye.mp4`, { method: "POST", body: readFileSync(clip) });
    expect(up.status).toBe(202);
    let ref: any;
    await until(async () => { ref = (await json("/api/stats")).json.refs[0]; return ref.status !== "watching"; });
    expect(ref).toMatchObject({ status: "watched", title: "RESULT FIRST", source: "FILE", traits: ["Result shown in the first second"] });
    expect(ref.beats).toEqual([{ label: "Result", weight: 1, kind: "hook" }, { label: "Steps", weight: 3, kind: "steps" }]);
    expect(asked.at(-1)!.images).toHaveLength(8);
    expect((await fetch(`${base}/api/stats/file?path=${encodeURIComponent(ref.shot)}`)).status).toBe(200);
    expect((await fetch(`${base}/api/stats/file?path=${encodeURIComponent(join(root, "ep1", "project.json"))}`)).status).toBe(404);
    const s = (await json("/api/stats")).json;
    expect(s.trends).toEqual([{ trait: "Result shown in the first second", count: 1, of: 1 }]);
    // Kept as rules, to follow or never to do.
    const use = (await json(`/api/stats/refs/${ref.id}/use`, "POST", {})).json;
    expect(use.rules.filter((r: { source: string }) => r.source === "REFERENCE · RESULT FIRST").map((r: { topic: string }) => r.topic)).toEqual(["hook", "sound"]);
    const donts = (await json(`/api/stats/refs/${ref.id}/use`, "POST", { as: "donts" })).json;
    expect(donts.rules.filter((r: { topic: string }) => r.topic === "donts")).toHaveLength(2);
  }, 60000);

  it("refuses a link that is not one, or twice the same", async () => {
    expect((await json("/api/stats/refs", "POST", { url: "not a link" })).status).toBe(400);
    const d = mkdtempSync(join(tmpdir(), "adam refs-"));
    addRef(d, { url: "https://youtu.be/x" });
    expect(() => addRef(d, { url: "https://youtu.be/x" })).toThrow(/already/);
  });

  it("counts a trait once per reference, across the watched ones only", () => {
    const d = mkdtempSync(join(tmpdir(), "adam trends-"));
    const a = addRef(d, { file: "a.mp4" }), b = addRef(d, { file: "b.mp4" }); addRef(d, { file: "c.mp4" });
    updateRef(d, a.id, { status: "watched", traits: ["Bold title", "bold title", "Click per screen"] });
    updateRef(d, b.id, { status: "watched", traits: ["Bold Title"] });
    expect(trends(updateRef(d, b.id, {}) && JSON.parse(readFileSync(join(d, "stats.json"), "utf8")).refs)).toEqual([
      { trait: "Bold Title", count: 2, of: 2 }, { trait: "Click per screen", count: 1, of: 2 }]);
  });
});

describe("what Claude learned", () => {
  it("adds, turns off and removes rules; the ones on go with the asks of their step", async () => {
    const add = (await json("/api/stats/rules", "POST", { topic: "captions", text: "Key word in yellow." })).json;
    const rule = add.rules.find((r: { text: string }) => r.text === "Key word in yellow.");
    expect(rule).toMatchObject({ topic: "captions", source: "YOU", on: true });
    expect(learnedFor(dir, "captions")).toMatch(/Key word in yellow/);
    expect(learnedFor(dir, "captions")).toMatch(/Never: /);
    expect(learnedFor(dir, "sound")).not.toMatch(/Key word in yellow/);
    await json(`/api/stats/rules/${rule.id}`, "PUT", { on: false });
    expect(learnedFor(dir, "captions")).not.toMatch(/Key word in yellow/);
    await json(`/api/stats/rules/${rule.id}`, "DELETE");
    expect((await json("/api/stats")).json.rules.some((r: { id: string }) => r.id === rule.id)).toBe(false);
    expect((await json("/api/stats/rules", "POST", { topic: "mood", text: "x" })).status).toBe(400);
  });

  it("puts the learned rules in the brief Claude gets", () => {
    const d = mkdtempSync(join(tmpdir(), "adam learned-"));
    addRule(d, { topic: "hook", text: "Open on the result.", source: "YOU" });
    const c = askCommand("ep 1", "hook", "x", "default", null, { learned: learnedFor(d, "hook") });
    expect(c.args[c.args.indexOf("--append-system-prompt") + 1]).toMatch(/Rules the creator keeps[\s\S]*Open on the result/);
  });

  it("reviews the rules", async () => {
    const r = (await json("/api/stats/review", "POST", {})).json;
    expect(r.say).toBe("Two rules repeat each other.");
    expect(r.off).toEqual([]);
  });
});

describe("the AI for questions outside the edit", () => {
  it("asks Claude without tools, or with Read for pictures; Codex with -i", () => {
    expect(aiCommand("claude", "default", "hi").args).toEqual(expect.arrayContaining(["--tools", ""]));
    const pic = aiCommand("claude", "sonnet", "read it", ["C:/s.png"]);
    expect(pic.args[1]).toMatch(/Read these pictures[\s\S]*C:\/s\.png/);
    expect(pic.args).toEqual(expect.arrayContaining(["--tools", "Read", "--allowedTools", "Read", "--model", "sonnet"]));
    const codex = aiCommand("codex", "default", "read it", ["C:/s.png"]);
    expect(codex.args.slice(-3)).toEqual(["-i", "C:/s.png", "read it"]);
  });
  it("takes the whole final answer, and the JSON in it", () => {
    expect(fullAnswer('{"type":"result","result":"Long answer\\n\\nwith two paragraphs."}')).toBe("Long answer\n\nwith two paragraphs.");
    expect(fullAnswer('{"type":"item.completed","item":{"type":"agent_message","text":"Codex says"}}')).toBe("Codex says");
    expect(jsonIn<{ a: number }>("Sure:\n```json\n{\"a\": 1}\n```")).toEqual({ a: 1 });
    expect(jsonIn("no json")).toBeNull();
  });
});
