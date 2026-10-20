import { useEffect, useState } from "react";
import type { UsageSummary } from "../server/usage";
import { api } from "./api";

const MODEL_NAMES: Record<string, string> = { default: "Default model", opus: "Opus", sonnet: "Sonnet", haiku: "Haiku" };
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

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

/** Inline with the composer's tools: the model Claude uses and the subscription's windows, refreshed after each ask (`stamp`). */
export function ClaudeBar({ stamp }: { stamp: string }) {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("default");
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  useEffect(() => { api<{ claudeModel: string; models: string[] }>("/settings").then((s) => { setModels(s.models); setModel(s.claudeModel); }, () => {}); }, []);
  useEffect(() => { api<UsageSummary>("/usage").then(setUsage, () => {}); }, [stamp]);
  const pick = (m: string) => { setModel(m); void api("/settings", { method: "PUT", body: { claudeModel: m } }); };
  const l = usage?.limits;
  const today = usage && usage.today.asks ? ` · today ${usage.today.asks} ask${usage.today.asks === 1 ? "" : "s"}, $${usage.today.costUsd.toFixed(2)} at API prices` : "";
  return (
    <>
      <select className="model" aria-label="Claude model" value={model} onChange={(e) => pick(e.target.value)}>
        {models.map((m) => <option key={m} value={m}>{MODEL_NAMES[m] ?? m}</option>)}
      </select>
      {l && <Gauge label="5 h" used={l.fiveHour.used} title={`5-hour window: resets at ${hhmm(l.fiveHour.resetsAt)}${today}`} />}
      {l && <Gauge label="week" used={l.sevenDay.used} title={`Weekly window: resets ${day(l.sevenDay.resetsAt)}`} />}
    </>
  );
}
