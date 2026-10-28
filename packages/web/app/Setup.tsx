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
      {!required.length && !hidden && (
        <button type="button" className="link" onClick={() => { try { localStorage.setItem(LATER, "1"); } catch { /* private window */ } setHidden(true); }}>later</button>
      )}
    </aside>
  );
}

/** The online libraries' keys (Pixabay images and videos, Freesound sounds): optional, stored on this computer. */
export function LibraryKeys() {
  type K = { pixabay: string | null; freesound: string | null };
  const [k, setK] = useState<K | null>(null);
  const [edit, setEdit] = useState<"" | keyof K>("");
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { api<K>("/keys").then(setK, () => {}); }, []);
  const save = async (p: keyof K, value: string) => {
    try { setK(await api<K>("/keys", { method: "PUT", body: { [p]: value } })); setEdit(""); setVal(""); setErr(""); } catch (e) { setErr((e as Error).message); }
  };
  if (!k) return null;
  const LINKS = { pixabay: "https://pixabay.com/api/docs/", freesound: "https://freesound.org/apiv2/apply/" };
  return (
    <>
      <div className="kv sep"><span>LIBRARY KEYS</span><b className="dim">OPTIONAL</b></div>
      {(["pixabay", "freesound"] as const).map((p) => (
        <div key={p} className="kv">
          <span>{p === "pixabay" ? <a href={LINKS[p]} target="_blank" rel="noreferrer">Pixabay</a> : <a href={LINKS[p]} target="_blank" rel="noreferrer">Freesound</a>}</span>
          {edit === p ? (
            <input type="password" autoFocus aria-label={`${p} API key`} value={val} onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(p, val); if (e.key === "Escape") setEdit(""); }} />
          ) : (
            <span className="row tight">
              <button type="button" className="link" onClick={() => { setEdit(p); setVal(""); }}>{k[p] ? `${k[p]} · change` : "add"}</button>
              {k[p] && <button type="button" className="link" aria-label={`Remove the ${p} key`} onClick={() => void save(p, "")}>×</button>}
            </span>
          )}
        </div>
      ))}
      {err && <p className="error">{err}</p>}
    </>
  );
}
