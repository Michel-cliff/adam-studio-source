// The studio's view of the setup: the checks (worked out in a child process, they take seconds) and one install at a time.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { realCtx, runFix, type Check } from "./doctor";
import { WEB } from "./paths";

export interface Fixing { id: string; state: "running" | "done" | "failed"; log: string[]; error?: string }

export class Doctor {
  checks: Check[] | null = null;
  fixing: Fixing | null = null;
  private loading = false;
  constructor(private settingsDir: string) {}

  /** Runs the checks again (setup.ts --json, with the same Node and loader as this server). */
  refresh(): void {
    if (this.loading) return;
    this.loading = true;
    const p = spawn(process.execPath, [...process.execArgv, join(WEB, "server", "setup.ts"), "--json"], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("close", () => {
      this.loading = false;
      try { this.checks = JSON.parse(out) as Check[]; } catch { /* keep the last checks */ }
    });
  }

  view(): { checks: Check[] | null; fixing: Fixing | null; loading: boolean } {
    if (!this.checks && !this.loading) this.refresh();
    return { checks: this.checks, fixing: this.fixing, loading: this.loading };
  }

  fix(id: string): void {
    if (this.fixing?.state === "running") throw new Error(`${this.fixing.id} is being installed, wait for it to finish`);
    const f: Fixing = { id, state: "running", log: [] };
    this.fixing = f;
    const log = (s: string) => { f.log.push(...s.split(/\r?\n/).filter(Boolean)); if (f.log.length > 200) f.log.splice(0, f.log.length - 200); };
    runFix(realCtx(this.settingsDir), id, log).then(
      () => { f.state = "done"; this.refresh(); },
      (e) => { f.state = "failed"; f.error = (e as Error).message; this.refresh(); },
    );
  }
}
