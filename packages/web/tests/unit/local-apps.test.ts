import { expect, it, vi } from "vitest";
import { localAppInstalled, type AppProbe } from "../../server/local-apps";
import { diagnose, runFix, type Ctx } from "../../server/doctor";
const context = (probe: AppProbe): Ctx => ({ platform: "win32", home: "/empty-user", localAppData: "/local", repo: "/repo", settingsDir: "/settings", probe: { ...probe, freeGb: () => 50 } });
it("finds Store apps even with an empty application profile, without opening or installing anything", () => {
  const run = vi.fn((_cmd: string, _args: string[]) => JSON.stringify({ claude: true, codex: true, capcut: false }));
  const probe: AppProbe = { run, exists: () => false, list: () => [] };
  expect(localAppInstalled("claude", { platform: "win32", probe })).toBe(true);
  expect(localAppInstalled("codex", { platform: "win32", probe })).toBe(true);
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls.every(call => call[0] === "powershell.exe")).toBe(true);
});
it("finds a versioned CapCut executable and skips winget when it is already installed", async () => {
  const run = vi.fn(() => null);
  const probe: AppProbe = { run, list: p => p.replace(/\\/g,"/") === "/local/CapCut/Apps" ? ["7.2.0"] : [], exists: p => ["/local/CapCut/Apps", "/local/CapCut/Apps/7.2.0/CapCut.exe"].includes(p.replace(/\\/g,"/")) };
  const ctx = context(probe);
  await runFix(ctx,"capcut");
  expect(run).not.toHaveBeenCalled();
});
it("does not download fonts that are already installed", async () => {
  const fetch = vi.fn(() => { throw Error("unexpected network"); });vi.stubGlobal("fetch",fetch);
  try {
    const ctx = context({ run: () => null, exists: () => false, list: () => ["Anton-Regular.ttf","DMSerifDisplay-Regular.ttf","Manrope-Variable.ttf"] });
    // No folder is created when all fonts are present.
    await runFix(ctx,"fonts");expect(fetch).not.toHaveBeenCalled();
  } finally {vi.unstubAllGlobals();}
});
it("does not mark empty model directories as usable models", () => {
  const ctx = context({ run: () => null, exists: () => true, list: () => ["partial-snapshot"] });
  ctx.probe.size = () => 0;
  expect(diagnose(ctx).find(c => c.id === "models")?.ok).toBe(false);
});
