// What Adam Studio needs on this computer, checked and, where it can be, installed: the tools (Python, ffmpeg, git,
// yt-dlp, Deno), the analysis environment and its models, an AI (Claude Code or Codex) and the adam-studio skill.
// Fonts, CapCut and the library keys are optional: the studio suggests them at startup.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statfsSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { REPO } from "./paths";
import { hostLocalAppData, localAppInstalled } from "./local-apps";

export type Need = "required" | "optional";
export interface Check { id: string; label: string; need: Need; ok: boolean; detail: string; fixable: boolean; hint?: string }

export interface Probe {
  /** stdout + stderr of a command, or null when it cannot start or fails. */
  run(cmd: string, args: string[]): string | null;
  exists(path: string): boolean;
  size?(path: string): number | null;
  list(dir: string): string[];
  freeGb(path: string): number | null;
}

export interface Ctx { platform: NodeJS.Platform; home: string; repo: string; settingsDir: string; localAppData: string; probe: Probe }

export const realProbe: Probe = {
  run(cmd, args) {
    const opts = { encoding: "utf8" as const, stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"], timeout: 120_000, windowsHide: true };
    try { return execFileSync(cmd, args, opts); } catch (e) {
      // npm, claude, codex are .cmd files on Windows: they start through the shell only.
      if (!viaShell(cmd, e)) return null;
      try { return execFileSync(shellLine(cmd, args), { ...opts, shell: true }); } catch { return null; }
    }
  },
  exists: existsSync,
  size(path) { try { return statSync(path).size; } catch { return null; } },
  list(dir) { try { return readdirSync(dir); } catch { return []; } },
  freeGb(path) { try { const s = statfsSync(path); return (s.bavail * s.bsize) / 1e9; } catch { return null; } },
};

const viaShell = (cmd: string, e: unknown) => process.platform === "win32" && !/[\\/]/.test(cmd) && ["ENOENT", "EINVAL"].includes((e as NodeJS.ErrnoException).code ?? "");
const shellLine = (cmd: string, args: string[]) => [cmd, ...args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))].join(" ");

export function realCtx(settingsDir = join(homedir(), ".adam-studio")): Ctx {
  return { platform: process.platform, home: homedir(), repo: REPO, settingsDir, localAppData: hostLocalAppData(), probe: realProbe };
}

const version = (out: string | null) => { const m = out?.match(/(\d+)\.(\d+)/); return m ? [Number(m[1]), Number(m[2])] as const : null; };
const atLeast = (v: readonly [number, number] | null, major: number, minor = 0) => !!v && (v[0] > major || (v[0] === major && v[1] >= minor));

export const python = (c: Ctx) => (c.platform === "win32" ? "python" : "python3");
export const venvPython = (c: Ctx, pkg: "analysis" | "capcut") =>
  (process.env.ADAM_PACKAGED && process.env[pkg === "analysis" ? "ADAM_ANALYSIS_PYTHON" : "ADAM_CAPCUT_PYTHON"]) || join(c.repo, "py", pkg, ".venv", c.platform === "win32" ? "Scripts/python.exe" : "bin/python");

export const FONTS = [
  { name: "Anton", file: "Anton-Regular.ttf", url: "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf" },
  { name: "DM Serif Display", file: "DMSerifDisplay-Regular.ttf", url: "https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf" },
  { name: "Manrope", file: "Manrope-Variable.ttf", url: "https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf" },
];
const fontDirs = (c: Ctx) => c.platform === "win32"
  ? [join(c.localAppData, "Microsoft", "Windows", "Fonts"), "C:\\Windows\\Fonts"]
  : c.platform === "darwin" ? [join(c.home, "Library", "Fonts"), "/Library/Fonts"] : [join(c.home, ".local", "share", "fonts"), "/usr/share/fonts"];
function missingFonts(c: Ctx): string[] {
  const files = fontDirs(c).flatMap((d) => c.probe.list(d)).map((f) => f.toLowerCase().replace(/[^a-z]/g, ""));
  return FONTS.filter((f) => !files.some((x) => x.startsWith(f.name.toLowerCase().replace(/[^a-z]/g, "")))).map((f) => f.name);
}

const IMPORTS = "import torch, faster_whisper, cv2, simple_lama_inpainting";
const whisperDir = (c: Ctx) => join(process.env.HF_HOME ?? join(c.home, ".cache", "huggingface"), "hub", "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo");
const rvmDir = (c: Ctx) => join(process.env.TORCH_HOME ?? join(c.home, ".cache", "torch"), "hub", "PeterL1n_RobustVideoMatting_master");
const hasFile = (c: Ctx, path: string, min = 0) => c.probe.size ? (c.probe.size(path) ?? 0) > min : c.probe.exists(path);
export function modelsReady(c: Ctx): boolean {
  const w = whisperDir(c), t = process.env.TORCH_HOME ?? join(c.home, ".cache", "torch");
  const whisper = c.probe.list(join(w, "snapshots")).some(name => hasFile(c, join(w, "snapshots", name, "model.bin"), 1_000_000) && hasFile(c, join(w, "snapshots", name, "config.json")));
  return whisper && hasFile(c, join(rvmDir(c), "hubconf.py")) && hasFile(c, join(t, "hub", "checkpoints", "rvm_mobilenetv3.pth"), 1_000_000) && hasFile(c, join(t, "hub", "checkpoints", "big-lama.pt"), 1_000_000);
}

/** Every check, the required ones first. */
export function diagnose(c: Ctx): Check[] {
  const p = c.probe;
  const tool = (id: string, label: string, cmd: string, args: string[], test: (out: string | null) => boolean, detail: (out: string | null) => string, need: Need = "required"): Check => {
    const out = p.run(cmd, args);
    const ok = test(out);
    return { id, label, need, ok, detail: ok ? detail(out) : "not found", fixable: !!pkgFix(c, id) };
  };
  const firstLine = (o: string | null) => (o ?? "").trim().split(/\r?\n/)[0]!.slice(0, 60);
  const node = version(process.version);
  const vpy = venvPython(c, "analysis");
  const venv = p.exists(vpy);
  const deps = venv && p.run(vpy, ["-c", IMPORTS]) !== null;
  const models = modelsReady(c);
  const claude = p.run("claude", ["--version"]), codex = p.run("codex", ["--version"]);
  const free = p.freeGb(c.home);
  const fonts = missingFonts(c);
  const capcut = localAppInstalled("capcut", c);
  const lab = p.exists(join(process.env.ADAM_CAPCUT_LAB ?? join(c.home, "ClaudeCapcut", "VectCutAPI"), "pyJianYingDraft"));
  return [
    { id: "node", label: "Node.js 24+", need: "required", ok: atLeast(node, 24), detail: process.version, fixable: false, hint: "nodejs.org" },
    tool("python", "Python 3.12+", python(c), ["--version"], (o) => atLeast(version(o), 3, 12), firstLine),
    tool("ffmpeg", "ffmpeg", "ffmpeg", ["-version"], (o) => o !== null, (o) => firstLine(o).replace(/ Copyright.*/, "")),
    tool("ffprobe", "ffprobe", "ffprobe", ["-version"], (o) => o !== null, (o) => firstLine(o).replace(/ Copyright.*/, "")),
    tool("git", "Git", "git", ["--version"], (o) => o !== null, firstLine),
    tool("yt-dlp", "yt-dlp", "yt-dlp", ["--version"], (o) => o !== null, firstLine),
    tool("deno", "Deno (for yt-dlp)", "deno", ["--version"], (o) => o !== null, firstLine),
    { id: "analysis", label: "Analysis environment", need: "required", ok: deps, detail: deps ? "Whisper, matting, inpainting" : venv ? "packages missing" : "not created", fixable: !process.env.ADAM_PACKAGED },
    { id: "models", label: "Analysis models", need: "required", ok: models, detail: models ? "Whisper large-v3-turbo, RobustVideoMatting" : "not downloaded (about 2 GB)", fixable: true },
    { id: "ai", label: "Adam's engine (Claude Code or Codex)", need: "required", ok: claude !== null || codex !== null,
      detail: [claude && "Claude Code", codex && "Codex"].filter(Boolean).join(" + ") || "none", fixable: true, hint: "then sign in once: claude, or codex" },
    { id: "skill", label: "adam-studio skill", need: "required", ok: p.exists(join(c.home, ".claude", "skills", "adam-studio", "SKILL.md")), detail: "", fixable: true },
    { id: "disk", label: "10 GB free", need: "required", ok: free === null || free >= 10, detail: free === null ? "" : `${Math.floor(free)} GB free`, fixable: false, hint: "free some space on this disk" },
    { id: "fonts", label: "House fonts", need: "optional", ok: fonts.length === 0, detail: fonts.length ? `missing ${fonts.join(", ")}` : FONTS.map((f) => f.name).join(", "), fixable: true },
    { id: "capcut", label: "CapCut Desktop", need: "optional", ok: capcut, detail: capcut ? "installed" : "to finish edits by hand", fixable: !!pkgFix(c, "capcut"), hint: "capcut.com" },
    { id: "capcut-export", label: "CapCut export (experimental)", need: "optional", ok: p.exists(venvPython(c, "capcut")) && lab, detail: lab ? "" : "needs the CapCut lab", fixable: lab },
  ];
}

const WINGET: Record<string, string> = { python: "Python.Python.3.12", ffmpeg: "Gyan.FFmpeg", ffprobe: "Gyan.FFmpeg", git: "Git.Git", "yt-dlp": "yt-dlp.yt-dlp", deno: "DenoLand.Deno", capcut: "ByteDance.CapCut" };
const BREW: Record<string, string[]> = { python: ["python@3.12"], ffmpeg: ["ffmpeg"], ffprobe: ["ffmpeg"], git: ["git"], "yt-dlp": ["yt-dlp"], deno: ["deno"], capcut: ["--cask", "capcut"] };

export interface Step { cmd: string; args: string[] }

function pkgFix(c: Ctx, id: string): Step | null {
  if (c.platform === "win32" && WINGET[id]) return { cmd: "winget", args: ["install", "-e", "--id", WINGET[id]!, "--silent", "--accept-source-agreements", "--accept-package-agreements"] };
  if (c.platform === "darwin" && BREW[id]) return { cmd: "brew", args: ["install", ...BREW[id]!] };
  return null;
}

/** The commands that fix one check, in order; fonts are installed by installFonts. */
export function fixSteps(c: Ctx, id: string): Step[] {
  const pkg = pkgFix(c, id);
  if (pkg) return [pkg];
  const vpy = venvPython(c, "analysis");
  const npmCmd = c.platform === "win32" ? "npm.cmd" : "npm";
  switch (id) {
    case "analysis": return [
      ...(c.probe.exists(vpy) ? [] : [{ cmd: python(c), args: ["-m", "venv", join(c.repo, "py", "analysis", ".venv")] }]),
      { cmd: vpy, args: ["-m", "pip", "install", "torch==2.14.1", "torchvision==0.29.1", "--index-url", "https://download.pytorch.org/whl/cpu"] },
      { cmd: vpy, args: ["-m", "pip", "install", "-e", join(c.repo, "py", "analysis")] },
    ];
    case "models": return [{ cmd: vpy, args: ["-c", [
      "from faster_whisper import WhisperModel", "WhisperModel('large-v3-turbo', device='cpu', compute_type='int8')",
      "import torch", "torch.hub.load('PeterL1n/RobustVideoMatting', 'mobilenetv3', trust_repo=True)",
      "from simple_lama_inpainting import SimpleLama", "SimpleLama()"].join("\n")] }];
    case "ai": return [{ cmd: npmCmd, args: ["install", "-g", ...(process.env.ADAM_TOOLS ? ["--prefix", process.env.ADAM_TOOLS] : []), "@anthropic-ai/claude-code"] }];
    case "skill": return process.env.ADAM_PACKAGED ? [{ cmd: process.execPath, args: ["-e", [
      "const fs=require('node:fs'),path=require('node:path');",
      `const src=${JSON.stringify(join(c.repo, "skills", "adam-studio"))},dst=${JSON.stringify(join(c.home, ".claude", "skills", "adam-studio"))};`,
      "if(fs.existsSync(path.join(dst,'SKILL.md')))console.log('Skill already installed; kept unchanged');else{fs.mkdirSync(path.dirname(dst),{recursive:true});fs.cpSync(src,dst,{recursive:true,force:false,errorOnExist:true});console.log('Skill installed');}",
    ].join("\n")] }] : [{ cmd: npmCmd, args: ["run", "skill", "--prefix", c.repo] }];
    case "capcut-export": return [
      { cmd: python(c), args: ["-m", "venv", join(c.repo, "py", "capcut", ".venv")] },
      { cmd: venvPython(c, "capcut"), args: ["-m", "pip", "install", "-e", join(c.repo, "py", "capcut")] },
    ];
    default: return [];
  }
}

/** Downloads the house fonts (SIL Open Font License) and installs them for this user. */
export async function installFonts(c: Ctx, log: (s: string) => void = () => {}): Promise<void> {
  const missing = new Set(missingFonts(c));
  if (!missing.size) { log("House fonts are already installed locally"); return; }
  const dir = fontDirs(c)[0]!;
  mkdirSync(dir, { recursive: true });
  for (const f of FONTS) {
    if (!missing.has(f.name)) { log(`${f.name}: already installed locally`); continue; }
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`${f.name}: download failed (HTTP ${res.status})`);
    const path = join(dir, f.file);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    // Windows lists per-user fonts in the registry; macOS and Linux read the folder.
    if (c.platform === "win32") c.probe.run("reg", ["add", "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", "/v", `${f.name} (TrueType)`, "/t", "REG_SZ", "/d", path, "/f"]);
    log(`installed ${f.name}`);
  }
  if (c.platform === "linux") c.probe.run("fc-cache", ["-f"]);
}

/** After an install, Windows only updates the PATH of new processes: read it again from the registry. */
export function refreshPath(c: Ctx): void {
  if (c.platform !== "win32") return;
  const out = c.probe.run("powershell", ["-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"]);
  if (out?.trim()) process.env.PATH = process.env.ADAM_PACKAGED ? `${process.env.PATH ?? ""};${out.trim()}` : `${out.trim()};${process.env.PATH ?? ""}`;
}

/** Runs the fix of one check, its output streamed to log; throws on the first step that fails. */
export async function runFix(c: Ctx, id: string, log: (s: string) => void = () => {}): Promise<void> {
  if (id === "capcut" && localAppInstalled("capcut", { ...c, refresh: true })) { log("CapCut is already installed locally"); return; }
  if (id === "models" && modelsReady(c)) { log("Analysis models are already available locally"); return; }
  if (id === "fonts") return installFonts(c, log);
  const steps = fixSteps(c, id);
  if (!steps.length) throw new Error(`no automatic install for ${id}`);
  for (const s of steps) {
    log(`> ${s.cmd} ${s.args.join(" ").slice(0, 120)}`);
    await new Promise<void>((done, fail) => {
      const start = (shell: boolean): void => {
        let p;
        // Node refuses .cmd files without a shell right away (EINVAL), not through the error event.
        try { p = shell ? spawn(shellLine(s.cmd, s.args), { shell: true, windowsHide: true }) : spawn(s.cmd, s.args, { windowsHide: true }); }
        catch (e) { return !shell && viaShell(s.cmd, e) ? start(true) : fail(e); }
        p.stdout.on("data", (d) => log(String(d).trimEnd()));
        p.stderr.on("data", (d) => log(String(d).trimEnd()));
        p.on("error", (e) => (!shell && viaShell(s.cmd, e) ? start(true) : fail(e)));
        p.on("close", (code) => (code === 0 ? done() : code === null ? undefined : fail(new Error(`${s.cmd} stopped with code ${code}`))));
      };
      start(false);
    });
    refreshPath(c);
  }
}
