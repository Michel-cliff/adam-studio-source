import { t as uiText } from "./i18n";
import { useEffect, useState } from "react";
import type { Quota } from "../server/codex-quota";
import { t } from "./i18n";
import type { UsageSummary } from "../server/usage";
import { api } from "./api";

const MODEL_NAMES: Record<string, string> = { default: "Default", opus: "Opus", sonnet: "Sonnet", haiku: "Haiku" };
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

type Engines = { claude: { installed: boolean; model: string }; codex: { installed: boolean; model: string } };
type Settings = { engine: "claude" | "codex"; engines: Engines; models: string[] };
/** Sent on window when the creator switches AI, so the studio shows what that AI can do (Skills are Claude's). */
export const ENGINE_EVENT = "adam-engine";

function Gauge({ label, used, title }: { label: string; used: number; title: string }) {
  const pct = Math.round(used * 100);
  return (
    <span className={`gauge${pct >= 90 ? " hot" : pct >= 70 ? " warm" : ""}`} title={title}>
      {label}
      <span className="gt" role="meter" aria-label={`${label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${Math.min(100, pct)}%` }} /></span>
      {pct}%
    </span>
  );
}

/** The AI the studio asks (Claude Code or Codex, as installed) and its model; Claude's subscription windows, refreshed after each ask (`stamp`). */
export function ClaudeBar({ stamp }: { stamp: string }) {
  const [s, setS] = useState<Settings | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  useEffect(() => { api<Settings>("/settings").then(setS, () => {}); }, []);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void api<UsageSummary>("/usage").then(v => alive && setUsage(v), () => {});
      if (s) void api<Quota>(s.engine === "codex" ? "/quota" : "/quota/claude").then(v => alive && setQuota(v), () => alive && setQuota({ status: "unavailable", windows: [], updatedAt: null }));
    };
    setQuota(null); refresh(); const timer = setInterval(refresh, 5000);
    const focus = () => refresh(); addEventListener("focus", focus);
    return () => { alive = false; clearInterval(timer); removeEventListener("focus", focus); };
  }, [stamp, s?.engine]);
  if (!s) return null;
  const value = s.engine === "codex" ? `codex:${s.engines.codex.model}` : `claude:${s.engines.claude.model}`;
  const pick = async (v: string) => {
    let [ai, model] = v.split(":") as ["claude" | "codex", string];
    if (ai === "codex" && model === "?") {
      const typed = prompt(uiText("Codex model (as Codex names it, e.g. gpt-5.5):"), s.engines.codex.model === "default" ? "" : s.engines.codex.model);
      if (!typed?.trim()) return;
      model = typed.trim();
    }
    try {
      const next = await api<Settings>("/settings", { method: "PUT", body: ai === "codex" ? { engine: "codex", codexModel: model } : { engine: "claude", claudeModel: model } });
      setS(next);
      dispatchEvent(new CustomEvent(ENGINE_EVENT, { detail: next.engine }));
    } catch (e) { alert(uiText((e as Error).message)); }
  };
  const codexModels = [...new Set(["default", s.engines.codex.model])];
  const l = s.engine === "claude" ? usage?.limits : null;
  const today = usage && usage.today.asks ? ` · today ${usage.today.asks} ask${usage.today.asks === 1 ? "" : "s"}, $${usage.today.costUsd.toFixed(2)} at API prices` : "";
  return (
    <>
      <select className="model" aria-label="AI and model" value={value} onChange={(e) => void pick(e.target.value)}>
        <optgroup label="Claude">
          {s.engines.claude.installed
            ? s.models.map((m) => <option key={m} value={`claude:${m}`}>{m === "default" ? "Claude" : MODEL_NAMES[m] ?? m}</option>)
            : <option disabled value="claude:none">Claude · not installed</option>}
        </optgroup>
        <optgroup label="Codex">
          {s.engines.codex.installed
            ? <>{codexModels.map((m) => <option key={m} value={`codex:${m}`}>{m === "default" ? "Codex" : `Codex · ${m}`}</option>)}<option value="codex:?">Codex · other model…</option></>
            : <option disabled value="codex:none">Codex · not installed</option>}
        </optgroup>
      </select>
      {s.engine === "claude" && <span className="quota-live" aria-live="polite">
        {!quota ? t("Reading quota…") : quota.status !== "available" ? t("Quota unavailable") : <>
          {quota.windows.map(w => <Gauge key={w.label} label={w.label === "7 d" ? t("Week") : w.label} used={1 - w.remainingPercent / 100} title={`${t("Quota used")} · ${t("Last measurement")} ${quota.updatedAt ? day(quota.updatedAt) : ""}${w.resetsAt ? ` · ${t("Resets at")} ${day(w.resetsAt)}` : ""}`} />)}
          <small>{t("Last measurement")} : {quota.updatedAt ? hhmm(quota.updatedAt) : "—"}</small>
        </>}
      </span>}
      {s.engine === "codex" && <span className="quota-live" aria-live="polite">
        {!quota ? t("Reading quota…") : quota.status === "available" ? quota.windows.map(w => <span key={w.label} title={`${t("Quota remaining")} · ${t("Resets at")} ${w.resetsAt ? day(w.resetsAt) : ""}`}><b>{Math.round(w.remainingPercent)}%</b> {t("remaining")} · {w.label.replace(" d", " j")}</span>) : t("Quota unavailable")}
      </span>}
      {usage?.last && <span className="usage-last dim" title={t("Tokens consumed by the last completed request, not a remaining balance.")}>{t("Last request")} : {Math.round((usage.last.tokens.input + usage.last.tokens.output) / 1000)}k tok</span>}
    </>
  );
}
