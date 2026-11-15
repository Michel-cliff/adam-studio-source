import { createServer, request, type Server } from "node:http";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { Diagnostics, validReportInput } from "../../server/diagnostics";
import { JobManager } from "../../server/jobs";
import { setProjectsRoot } from "../../server/settings";
import type { JobView } from "../../server/types";

const fixture = (over: Partial<JobView> = {}): JobView => ({ id: "j1", project: "Client unique", label: "Render", state: "failed", output: "ENOSPC in C:\\test-home\\Client unique\\source.mp4\nBearer super-private-value", startedAt: 1, endedAt: 20, hint: null, ...over });
it("prepares a local, bounded report without reading project files or exposing AI conversations", () => {
  const d = new Diagnostics("C:/test-home", "desktop-token-secret");
  d.record(Error("ENAMETOOLONG with desktop-token-secret"));
  const result = d.create({ kind: "task" }, [fixture(), fixture({ id: "j2", label: "Claude: hook", output: '{"prompt":"private script and tool arguments"}' })], "fr");
  expect(result.report).toContain("ENOSPC");
  expect(result.report).toContain("ENAMETOOLONG");
  expect(result.report).not.toContain("super-private-value");
  expect(result.report).not.toContain("desktop-token-secret");
  expect(result.report).not.toContain("Client unique");
  expect(result.report).not.toContain("private script");
  expect(result.report).toContain("AI conversation omitted");
  expect(result.mailto).toMatch(/^mailto:hello@contact\.cliffiscurious\.com\?/);
  expect(result.mailto.length).toBeLessThanOrEqual(1900);
  expect(result.filename).toMatch(/^adam-studio-report-\d+\.txt$/);
});
it("accepts only bounded diagnostic selectors", () => {
  expect(validReportInput({ kind: "manual", jobId: "j12" })).toBe(true);
  expect(validReportInput({ jobId: "../backend.log" })).toBe(false);
  expect(validReportInput({ message: "x".repeat(2001) })).toBe(false);
  expect(validReportInput({ kind: "execute" })).toBe(false);
});

let server: Server, port: number;
const jobs = new JobManager();
function call(data: unknown, extra: Record<string, string> = {}) {
  return new Promise<{ status: number; data: any }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/diagnostics/report", headers: { "content-type": "application/json", "x-adam-desktop-token": "test-token", ...extra } }, res => {
      let text = ""; res.on("data", c => text += c); res.on("end", () => resolve({ status: res.statusCode!, data: JSON.parse(text) }));
    });
    req.on("error", reject); req.end(JSON.stringify(data));
  });
}
beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "adam diagnostics-"));
  const settingsFile = join(root, "ui.json");
  mkdirSync(join(root, "projects")); setProjectsRoot(join(root, "projects"), settingsFile);
  server = createApp({ settingsFile, home: root, jobs, sessionToken: "test-token" }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  port = (server.address() as import("node:net").AddressInfo).port;
});
afterAll(() => { server.closeAllConnections(); server.close(); });
it("requires the application session and denies automated MCP requests", async () => {
  expect((await call({}, { "x-adam-desktop-token": "wrong" })).status).toBe(403);
  expect((await call({}, { "x-adam-mcp": "automation" })).status).toBe(403);
  expect((await call({}, { origin: "https://outside.example" })).status).toBe(403);
});
it("generates a report for an existing task and rejects missing jobs or oversized messages", async () => {
  const job = jobs.task("private-test", "Render", "", async () => { throw Error("synthetic export failure"); });
  await new Promise<void>(resolve => jobs.subscribe(job.id, e => { if (e.type === "end") resolve(); }));
  const result = await call({ jobId: job.id, kind: "task" });
  expect(result.status).toBe(200);
  expect(result.data.report).toContain("synthetic export failure");
  expect((await call({ jobId: "j999999" })).status).toBe(404);
  expect((await call({ message: "x".repeat(2001) })).status).toBe(400);
});
