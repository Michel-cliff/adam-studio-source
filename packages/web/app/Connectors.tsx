import { useEffect, useState } from "react";
import { api, enc } from "./api";
import { t } from "./i18n";

type Connector = { name: string; type: string; source: "claude-code" | "built-in" | "added"; enabled: boolean };
export type Skill = { name: string; description: string };
type Health = { state: "ok" | "sign-in" | "down"; detail?: string };

// Line pictograms for the tiles: a known tool gets its own, the others one picked from their name.
const PICTO: Record<string, string> = {
  blender: "M24 38a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM6 22h16M12 14l10 8",
  figma: "M18 6h12a6 6 0 0 1 0 12H18zM18 18h12a6 6 0 1 1-6 6v-6M18 18v12a6 6 0 1 0 6 6V30",
  higgsfield: "M8 40 24 8l16 32M14 28h20",
  capcut: "M10 14l28 20M10 34l28-20M10 14h6M32 34h6",
  watch: "M4 24s8-12 20-12 20 12 20 12-8 12-20 12S4 24 4 24zM24 30a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
  "adam-studio": "M24 6 40 40H8zM16 28h16",
};
const GENERIC = [
  "M8 12h32v24H8zM8 18h32M14 12v6M22 12v6M30 12v6", "M10 8h22l6 6v26H10zM32 8v6h6", "M8 10h32v24H8zM18 40h12M24 34v6",
  "M20 18v12M14 22v4M26 14v20M32 20v8M38 23v2", "M10 34c8 4 20 4 28-6M12 14h24v14H12z", "M24 8v32M8 24h32M13 13l22 22",
];
const picto = (name: string) => {
  const k = Object.keys(PICTO).find((p) => name.toLowerCase().includes(p));
  if (k) return PICTO[k]!;
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GENERIC[h % GENERIC.length]!;
};

function Tile({ name, on, onLabel, onClick, title, warn }: { name: string; on: boolean; onLabel: string; onClick: () => void; title?: string; warn?: boolean }) {
  return (
    <button type="button" className="tile" aria-pressed={on} onClick={onClick} title={title}>
      <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true"><path d={picto(name)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="38" cy="10" r="4" fill={on ? "var(--green)" : "transparent"} /></svg>
      <span>{name}</span>
      <small className={on ? (warn ? "warn" : "on") : ""}>{on ? onLabel : "OFF"}</small>
    </button>
  );
}

function Term({ title, note, onClose, children }: { title: string; note: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="term" role="dialog" aria-label={title}>
      <div className="thead"><span className="prompt">{title}<i /></span><button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></div>
      {children}
      <p className="tnote">{note}</p>
    </div>
  );
}

/** MCP servers Claude may use from the studio: Claude Code's own (Blender, CapCut...) and ones added by URL (Higgsfield). */
export function ConnectorsPanel({ onClose, onCount }: { onClose: () => void; onCount?: (n: number) => void }) {
  const [list, setList] = useState<Connector[] | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  // ON means it answered: each connector turned on is asked, and says itself what is missing.
  const [health, setHealth] = useState<Record<string, Health | "checking">>({});
  const check = (name: string) => {
    setHealth((h) => ({ ...h, [name]: "checking" }));
    api<Health>(`/connectors/health?name=${enc(name)}`, { method: "POST" }).then((r) => setHealth((h) => ({ ...h, [name]: r })), (e) => setHealth((h) => ({ ...h, [name]: { state: "down", detail: e.message } })));
  };
  const set = (l: Connector[]) => {
    setList(l); onCount?.(l.filter((c) => c.enabled).length);
    setHealth((h) => { for (const c of l) if (c.enabled && !h[c.name]) check(c.name); return h; });
  };
  const label = (name: string) => { const h = health[name]; return !h || h === "checking" ? "…" : h.state === "ok" ? "ON" : h.state === "sign-in" ? t("SIGN-IN NEEDED") : t("NOT ANSWERING"); };
  const problem = (list ?? []).filter((c) => c.enabled).map((c) => [c.name, health[c.name]] as const).find(([, h]) => h && h !== "checking" && h.state !== "ok");
  const problemText = problem ? `${problem[0]} · ${(problem[1] as Health).state === "sign-in" ? t("Sign in to it from your AI (in Claude: /mcp), then come back.") : `${t("It does not answer. Start it, then come back.")}${(problem[1] as Health).detail ? ` (${(problem[1] as Health).detail})` : ""}`}` : "";
  useEffect(() => { api<Connector[]>("/connectors").then(set, (e) => setNote(e.message)); }, []);
  const toggle = async (c: Connector) => {
    const enabled = (list ?? []).filter((x) => (x.name === c.name ? !c.enabled : x.enabled)).map((x) => x.name);
    // Turned on again: asked again, it may have been started since.
    setHealth((h) => { const { [c.name]: _, ...rest } = h; return rest; });
    try { set(await api<Connector[]>("/connectors", { method: "PUT", body: { enabled } })); } catch (e) { setNote((e as Error).message); }
  };
  // A server added by URL is named after its host (mcp.higgsfield.ai gives higgsfield).
  const add = async () => {
    const host = (() => { try { return new URL(url.trim()).hostname.split(".").filter((p) => p !== "mcp" && p !== "www").slice(-2, -1)[0] ?? "server"; } catch { return ""; } })();
    if (!host) { setNote("Paste the server's MCP URL (https://…)."); return; }
    try { set(await api<Connector[]>("/connectors", { method: "POST", body: { name: host, url: url.trim() } })); setUrl(""); setNote(`${host} added and on.`); }
    catch (e) { setNote((e as Error).message); }
  };
  const remove = async (c: Connector) => {
    try { set(await api<Connector[]>(`/connectors/${enc(c.name)}`, { method: "DELETE" })); } catch (e) { setNote((e as Error).message); }
  };
  return (
    <Term title="connectors" note={note || problemText || "CONNECTED TOOLS ADAM MAY USE IN THIS PROJECT."} onClose={onClose}>
      <div className="tiles">
        {list?.map((c) => <Tile key={c.name} name={c.name} on={c.enabled} onLabel={label(c.name)} warn={label(c.name) !== "ON"} onClick={() => void toggle(c)}
          title={c.source === "added" ? "Added here. Right-click to remove." : c.source === "claude-code" ? "From Claude Code's settings" : "Built in"} />)}
        {list && list.length === 0 && <p className="tnote">No MCP server yet. Add one below.</p>}
      </div>
      <div className="tadd">
        <input aria-label="MCP server URL" placeholder="https://… MCP URL" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) void add(); }} />
        <button type="button" className="act" disabled={!url.trim()} onClick={add}>ADD</button>
        {list?.some((c) => c.source === "added") && (
          <select aria-label="Remove an added server" value="" onChange={(e) => { const c = list.find((x) => x.name === e.target.value); if (c) void remove(c); }}>
            <option value="">Remove…</option>
            {list.filter((c) => c.source === "added").map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
        )}
      </div>
    </Term>
  );
}

/** The skills Claude Code has, to call from the next ask. */
export function SkillsPanel({ picked, onToggle, onClose }: { picked: string[]; onToggle: (name: string) => void; onClose: () => void }) {
  const [list, setList] = useState<Skill[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { api<Skill[]>("/skills").then(setList, () => setList([])); }, []);
  const shown = (list ?? []).filter((s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Term title="skills" note={`${picked.length} ${t("PICKED")} · PICKED SKILLS TRAVEL WITH YOUR NEXT ASK.`} onClose={onClose}>
      <input className="tsearch" aria-label="Search skills" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="tiles">
        {shown.map((s) => <Tile key={s.name} name={s.name} on={picked.includes(s.name)} onLabel="PICKED" onClick={() => onToggle(s.name)} title={s.description} />)}
        {list && shown.length === 0 && <p className="tnote">No skill matches.</p>}
      </div>
    </Term>
  );
}
