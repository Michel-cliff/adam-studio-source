import { useEffect, useState } from "react";
import type { UsageSummary } from "../server/usage";
import { api } from "./api";

const MODEL_NAMES: Record<string, string> = { default: "Claude Code default", opus: "Opus", sonnet: "Sonnet", haiku: "Haiku" };
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

function Gauge({ label, used, resets }: { label: string; used: number; resets: string }) {
  const pct = Math.round(used * 100);
  return (
    <span className={`gauge${pct >= 90 ? " hot" : pct >= 70 ? " warm" : ""}`} title={`${label}: ${pct}% used, resets ${resets}`}>
      <span className="gl">{label}</span>
      <span className="gt" role="meter" aria-label={`${label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${Math.min(100, pct)}%` }} /></span>
      <span className="gv">{pct}%</span>
    </span>
  );
}

/** The model Claude uses and what the subscription has left, refreshed after each ask (`stamp` changes). */
export function ClaudeBar({ stamp }: { stamp: string }) {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("default");
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  useEffect(() => { api<{ claudeModel: string; models: string[] }>("/settings").then((s) => { setModels(s.models); setModel(s.claudeModel); }, () => {}); }, []);
  useEffect(() => { api<UsageSummary>("/usage").then(setUsage, () => {}); }, [stamp]);
  const pick = (m: string) => { setModel(m); void api("/settings", { method: "PUT", body: { claudeModel: m } }); };
  const l = usage?.limits;
  return (
    <div className="claudebar">
      <label className="row" style={{ gap: 6 }}>
        <span className="muted">Model</span>
        <select value={model} onChange={(e) => pick(e.target.value)}>{models.map((m) => <option key={m} value={m}>{MODEL_NAMES[m] ?? m}</option>)}</select>
      </label>
      {l ? (
        <>
          <Gauge label="5 h" used={l.fiveHour.used} resets={hhmm(l.fiveHour.resetsAt)} />
          <Gauge label="week" used={l.sevenDay.used} resets={day(l.sevenDay.resetsAt)} />
          <span className="muted">resets {hhmm(l.fiveHour.resetsAt)}</span>
        </>
      ) : <span className="muted">Usage shows after your first ask</span>}
      {usage && usage.today.asks > 0 && (
        <span className="muted" title="What these asks would cost at API list prices; your subscription covers them">
          today {usage.today.asks} ask{usage.today.asks === 1 ? "" : "s"} · ${usage.today.costUsd.toFixed(2)} API value
        </span>
      )}
    </div>
  );
}
