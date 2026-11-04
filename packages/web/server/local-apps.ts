import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export type LocalApp = "claude" | "codex" | "capcut";
export type AppProbe = { exists(path: string): boolean; list(path: string): string[]; run(cmd: string, args: string[]): string | null };
const real: AppProbe = {
  exists: existsSync,
  list(path) { try { return readdirSync(path); } catch { return []; } },
  run(cmd, args) { try { return execFileSync(cmd, args, { encoding: "utf8", timeout: 15_000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } },
};
export const hostHome = () => process.env.ADAM_HOST_HOME || homedir();
export const hostLocalAppData = () => process.env.ADAM_HOST_LOCALAPPDATA || process.env.LOCALAPPDATA || join(hostHome(), "AppData", "Local");
export const hostAppData = () => process.env.ADAM_HOST_APPDATA || process.env.APPDATA || join(hostHome(), "AppData", "Roaming");
const inventory = new WeakMap<AppProbe, { at: number; apps: Partial<Record<LocalApp, boolean>> }>();
// Installed-app metadata only. No browser, package installation, account or credential access.
const WINDOWS_INVENTORY = `$names=@(); $names+=@(Get-AppxPackage -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name); $names+=@(Get-StartApps -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name); $names+=@(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DisplayName); @{claude=[bool]($names -match '(^|[. ])Claude($|[ _])');codex=[bool]($names -match '(^|[. ])Codex($|[ _])');capcut=[bool]($names -match 'CapCut')} | ConvertTo-Json -Compress`;

export function localAppInstalled(app: LocalApp, opts: { platform?: NodeJS.Platform; home?: string; localAppData?: string; probe?: AppProbe; refresh?: boolean } = {}): boolean {
  const p = opts.probe ?? real, platform = opts.platform ?? process.platform;
  const home = process.env.ADAM_HOST_HOME || opts.home || hostHome();
  const local = process.env.ADAM_HOST_LOCALAPPDATA || opts.localAppData || hostLocalAppData();
  const pf = process.env.ProgramFiles || "C:\\Program Files";
  const roots: Record<LocalApp, string[]> = {
    claude: [join(local, "AnthropicClaude"), join(local, "Programs", "Claude"), join(pf, "Claude")],
    codex: [join(local, "Programs", "Codex"), join(pf, "Codex"), join(home, ".codex", "bin")],
    capcut: [join(local, "CapCut"), join(local, "CapCut", "Apps"), join(pf, "CapCut")],
  };
  if (platform === "win32") {
    const exe = { claude: "Claude.exe", codex: "Codex.exe", capcut: "CapCut.exe" }[app];
    for (const folder of roots[app]) {
      if (p.exists(join(folder, exe))) return true;
      if (p.exists(folder) && p.list(folder).slice(0, 80).some(name => p.exists(join(folder, name, exe)))) return true;
    }
    let cached = inventory.get(p);
    if (opts.refresh || !cached || Date.now() - cached.at > 30_000) {
      let apps: Partial<Record<LocalApp, boolean>> = {};
      try { apps = JSON.parse(p.run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_INVENTORY]) ?? "{}"); } catch { /* keep a failed probe distinct from a successful install */ }
      cached = { at: Date.now(), apps }; inventory.set(p, cached);
    }
    if (cached.apps[app] === true) return true;
    return app === "codex" && p.run("where.exe", ["codex"]) !== null;
  }
  if (platform === "darwin") return p.exists(join("/Applications", { claude: "Claude.app", codex: "Codex.app", capcut: "CapCut.app" }[app]));
  return app === "codex" && p.run("which", ["codex"]) !== null;
}
