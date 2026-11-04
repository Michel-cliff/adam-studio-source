import { useEffect, useState } from "react";
import type { Check } from "../server/doctor";
import type { Fixing } from "../server/doctor-routes";
import { api } from "./api";

type View = { checks: Check[] | null; fixing: Fixing | null; loading: boolean };
const LATER = "adam.setup.later";
const RECOMMENDED = ["fonts", "capcut"];

function later(): boolean { try { return localStorage.getItem(LATER) === "1"; } catch { return false; } }

/**
 * The startup message: what Adam Studio still needs on this computer (required, in red) and what it recommends
 * (the house fonts, CapCut), each with its Install button; the install's output shows while it runs.
 */
export function SetupNote() {
  const [v, setV] = useState<View | null>(null);
  const [hidden, setHidden] = useState(later());
  const [err, setErr] = useState("");
  const busy = !v || v.loading || v.fixing?.state === "running";
  useEffect(() => {
    let alive = true;
    const tick = () => api<View>("/doctor").then((x) => { if (alive) setV(x); }, () => {});
    tick();
    const t = setInterval(tick, busy ? 1500 : 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [busy]);
  if (!v?.checks) return null;
  const required = v.checks.filter((c) => c.need === "required" && !c.ok);
  const recommended = v.checks.filter((c) => RECOMMENDED.includes(c.id) && !c.ok);
  const running = v.fixing?.state === "running" ? v.fixing : null;
  if (!required.length && (hidden || !recommended.length) && !running) return null;
  const install = async (id: string) => { try { setV(await api<View>("/doctor/fix", { method: "POST", body: { id } })); setErr(""); } catch (e) { setErr((e as Error).message); } };
  const row = (c: Check) => (
    <li key={c.id}>
      <span><b>{c.label}</b><span className="mono dim">{c.detail}</span></span>
      {c.fixable ? <button type="button" className="link" disabled={!!running} onClick={() => void install(c.id)}>{running?.id === c.id ? "installing…" : "install"}</button>
        : <span className="mono dim">{c.hint ?? "by hand"}</span>}
    </li>
  );
  return (
    <aside className={`setupnote${required.length ? " must" : ""}`} aria-label="Setup" role="status">
      {required.length > 0 && <><div className="h">ADAM STUDIO NEEDS</div><ul>{required.map(row)}</ul></>}
      {!hidden && recommended.length > 0 && <><div className="h">RECOMMENDED · OPTIONAL</div><ul>{recommended.map(row)}</ul></>}
      {running && <pre className="setuplog">{running.log.slice(-4).join("\n") || "starting…"}</pre>}
      {v.fixing?.state === "failed" && <p className="error">{v.fixing.id}: {v.fixing.error}</p>}
      {err && <p className="error">{err}</p>}
      <button type="button" className="link" disabled={busy} onClick={() => { void api<View>("/doctor/refresh", { method: "POST" }).then(setV, e => setErr(e.message)); }}>{busy ? "Checking locally…" : "Check locally"}</button>
      {!required.length && !hidden && (
        <button type="button" className="link" onClick={() => { try { localStorage.setItem(LATER, "1"); } catch { /* private window */ } setHidden(true); }}>later</button>
      )}
    </aside>
  );
}

