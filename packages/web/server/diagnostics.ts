import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { release, userInfo } from "node:os";
import { join } from "node:path";
import { REPO } from "./paths";
import { aiOf } from "../app/feed";
import type { JobView } from "./types";

const require = createRequire(import.meta.url);
const { buildReport, mailUrl, keepTail } = require(join(REPO, "packages/desktop/crash.cjs"));
export type ReportInput = { jobId?: string; message?: string; kind?: string };
export type ProblemReport = { report: string; mailto: string; filename: string };
export const validReportInput = (b: Record<string, unknown>): boolean =>
  (b.jobId === undefined || (typeof b.jobId === "string" && /^j\d{1,12}$/.test(b.jobId))) &&
  (b.message === undefined || (typeof b.message === "string" && b.message.length <= 2000)) &&
  (b.kind === undefined || ["manual", "task", "request", "interface", "connection"].includes(String(b.kind)));

export class Diagnostics {
  private log = "";
  private readonly version: string;
  constructor(private home: string, private token?: string) {
    try { this.version = JSON.parse(readFileSync(join(REPO, "packages/desktop/package.json"), "utf8")).version ?? "unknown"; }
    catch { this.version = "unknown"; }
  }
  record(error: unknown): void {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    this.log = keepTail(this.log, "\n" + detail);
  }
  create(input: ReportInput, jobs: JobView[], lang: "fr" | "en"): ProblemReport {
    const lines = jobs.slice(0, 3).map(j => {
      const metadata = [j.label, j.state, j.progress === undefined ? "" : j.progress + " %", j.progressPhase ?? ""].filter(Boolean).join(" | ");
      // AI streams contain prompts, script excerpts and tool arguments: never include them.
      const technical = j.output.split("\n").filter(line => /^(?:spawn(?:sync)?\b|E(?:NOENT|ACCES|PERM|NAMETOOLONG|CONNREFUSED|TIMEDOUT)\b)/.test(line)).slice(-3).map(line => line.slice(0, 1000)).join("\n");
      const output = aiOf(j.label) ? "AI conversation omitted. Failure category: " + (j.ai?.problem ?? "unclassified") + "\n" + technical : j.output.slice(-12000);
      return metadata + "\n" + output;
    });
    const secrets = [this.token, ...Object.entries(process.env).filter(([key]) => /(?:TOKEN|SECRET|PASSWORD|API_KEY|COOKIE)/i.test(key)).map(([, value]) => value)].filter((s): s is string => Boolean(s));
    const report = buildReport({
      kind: "Problem: " + (input.kind ?? "manual"),
      error: input.message ? new Error(input.message) : undefined,
      log: [this.log, ...lines].join("\n\n").slice(-16000),
      version: this.version, system: process.platform + " " + release() + " " + process.arch,
      context: { home: this.home, user: userInfo().username, secrets, projects: jobs.map(j => j.project).filter(Boolean) },
    });
    return { report, mailto: mailUrl({ report, version: this.version, lang }), filename: "adam-studio-report-" + Date.now() + ".txt" };
  }
}
