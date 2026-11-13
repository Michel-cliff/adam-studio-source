import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnose, fixSteps, type Ctx, type Probe } from "../../server/doctor";


it("does not request a transcription reinstall when only the visual models are missing", () => {
  const c = machine("linux", {});
  c.probe.list = path => path.endsWith("snapshots") ? ["cached"] : [];
  c.probe.exists = path => /snapshots[/\\]cached[/\\](model.bin|config.json)$/.test(path);
  const checks = diagnose(c);
  expect(checks.find(item => item.id === "models")).toMatchObject({ok:true, need:"required", label:"Transcription model"});
  expect(checks.find(item => item.id === "visual-models")).toMatchObject({ok:false, need:"optional"});
  expect(fixSteps(c,"models")[0]!.args.join(" ")).not.toContain("ensure_rvm");
});

/** A computer where only the given commands answer and only the given paths exist. */
function machine(platform: NodeJS.Platform, commands: Record<string, string>, paths: string[] = [], fonts: string[] = []): Ctx {
  const home = "/home/u", repo = "/repo";
  const probe: Probe = {
    run: (cmd) => commands[cmd.replace(/\\/g, "/")] ?? null,
    exists: (p) => paths.includes(p.replace(/\\/g, "/")),
    list: () => fonts,
    freeGb: () => 50,
  };
  return { platform, home, repo, settingsDir: mkdtempSync(join(tmpdir(), "adam doctor-")), localAppData: "/local", probe };
}

const byId = (c: Ctx) => Object.fromEntries(diagnose(c).map((x) => [x.id, x]));

describe("the setup doctor", () => {
  it("flags the missing required tools and installs them with winget on Windows", () => {
    const c = machine("win32", { python: "Python 3.11.9", ffmpeg: "ffmpeg version 9", ffprobe: "ffprobe version 9", git: "git version 2" });
    const d = byId(c);
    expect(d.python!.ok).toBe(false);
    expect(d["yt-dlp"]!.ok).toBe(false);
    expect(d.deno!).toMatchObject({ ok: false, need: "required", fixable: true });
    expect(d.ffmpeg!.ok).toBe(true);
    expect(fixSteps(c, "deno")[0]).toMatchObject({ cmd: "winget", args: expect.arrayContaining(["DenoLand.Deno"]) });
    expect(fixSteps(c, "python")[0]!.args).toContain("Python.Python.3.12");
  });
  it("uses brew on macOS", () => {
    expect(fixSteps(machine("darwin", {}), "yt-dlp")).toEqual([{ cmd: "brew", args: ["install", "yt-dlp"] }]);
  });
  it("creates the analysis environment when it is missing, and only installs packages when it exists", () => {
    const none = fixSteps(machine("linux", {}), "analysis");
    expect(none[0]).toMatchObject({ cmd: "python3", args: ["-m", "venv", expect.stringContaining(".venv")] });
    expect(none).toHaveLength(3);
    const venv = fixSteps(machine("linux", {}, ["/repo/py/analysis/.venv/bin/python"]), "analysis");
    expect(venv).toHaveLength(2);
    expect(venv[0]!.args).toContain("torch==2.14.1");
  });
  it("needs one AI, either Claude Code or Codex", () => {
    expect(byId(machine("linux", {})).ai!.ok).toBe(false);
    expect(byId(machine("linux", { codex: "codex-cli 0.5" })).ai).toMatchObject({ ok: true, detail: "Codex" });
  });
  it("keeps fonts, CapCut and the library keys optional, and finds fonts already installed", () => {
    const d = byId(machine("linux", {}, [], ["Anton-Regular.ttf", "DMSerifDisplay-Regular.ttf"]));
    for (const id of ["fonts", "capcut"]) expect(d[id]!.need).toBe("optional");
    expect(d.pixabay).toBeUndefined(); expect(d.freesound).toBeUndefined();
    expect(d.fonts!).toMatchObject({ ok: false, detail: "missing Manrope" });
    expect(byId(machine("linux", {}, [], ["Anton-Regular.ttf", "DMSerifDisplay-Regular.ttf", "Manrope[wght].ttf"])).fonts!.ok).toBe(true);
  });
});
