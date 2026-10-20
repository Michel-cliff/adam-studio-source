import { useEffect, useState } from "react";
import { api, enc } from "./api";

type Connector = { name: string; type: string; source: "claude-code" | "added"; enabled: boolean };
export type Skill = { name: string; description: string };

function useEsc(onClose: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, []);
}

/** MCP servers Claude may use from the studio: Claude Code's own (Blender, CapCut...) and ones added by URL (Higgsfield). */
export function ConnectorsPanel({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Connector[] | null>(null);
  const [name, setName] = useState("higgsfield");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  useEsc(onClose);
  useEffect(() => { api<Connector[]>("/connectors").then(setList, (e) => setNote(e.message)); }, []);
  const toggle = async (c: Connector) => {
    const enabled = (list ?? []).filter((x) => (x.name === c.name ? !c.enabled : x.enabled)).map((x) => x.name);
    try { setList(await api<Connector[]>("/connectors", { method: "PUT", body: { enabled } })); } catch (e) { setNote((e as Error).message); }
  };
  const add = async () => {
    try { setList(await api<Connector[]>("/connectors", { method: "POST", body: { name: name.trim(), url: url.trim() } })); setUrl(""); setNote(`${name} added and on.`); }
    catch (e) { setNote((e as Error).message); }
  };
  const remove = async (c: Connector) => {
    try { setList(await api<Connector[]>(`/connectors/${enc(c.name)}`, { method: "DELETE" })); } catch (e) { setNote((e as Error).message); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="win modal connectors" role="dialog" aria-modal="true" aria-label="Connectors" onClick={(e) => e.stopPropagation()}>
        <div className="bar"><span className="t">connectors.exe</span><button className="ghost" style={{ color: "#fff", padding: "2px 6px" }} aria-label="Close" onClick={onClose}>×</button></div>
        <div className="body">
          <p className="muted" style={{ marginTop: 0 }}>Turned on, a server's tools are available to Claude when you ask it something in the studio.</p>
          <ul className="clist">
            {list?.map((c) => (
              <li key={c.name}>
                <label className="row" style={{ gap: 10, flex: 1 }}>
                  <input type="checkbox" checked={c.enabled} onChange={() => void toggle(c)} />
                  <b>{c.name}</b>
                  <span className="tag">{c.type}</span>
                  <span className="muted">{c.source === "claude-code" ? "from Claude Code" : "added here"}</span>
                </label>
                {c.source === "added" && <button className="ghost" onClick={() => void remove(c)}>Remove</button>}
              </li>
            ))}
            {list && list.length === 0 && <li className="muted">No MCP server in Claude Code yet. Add one below.</li>}
            <li>
              <span className="row" style={{ gap: 10, flex: 1 }}><b>TikTok, Instagram</b><span className="muted">your published numbers</span></span>
              <a href="#/insights" onClick={onClose}>Insights</a>
            </li>
          </ul>
          <h3 style={{ margin: "18px 0 8px" }}>Add a server</h3>
          <div className="row">
            <input aria-label="Server name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 160 }} />
            <input aria-label="Server URL" placeholder="https://… (its MCP URL)" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
            <button disabled={!name.trim() || !url.trim()} onClick={add}>Add</button>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>Higgsfield: on higgsfield.ai, open MCP in the top bar and copy the server URL here. Servers that need a sign-in ask for it the first time Claude uses them.</p>
          {note && <p className="muted">{note}</p>}
        </div>
      </div>
    </div>
  );
}

/** The skills Claude Code has, to call from the prompt. */
export function SkillsPanel({ picked, onToggle, onClose }: { picked: string[]; onToggle: (name: string) => void; onClose: () => void }) {
  const [list, setList] = useState<Skill[] | null>(null);
  const [q, setQ] = useState("");
  useEsc(onClose);
  useEffect(() => { api<Skill[]>("/skills").then(setList, () => setList([])); }, []);
  const shown = (list ?? []).filter((s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="win modal skills" role="dialog" aria-modal="true" aria-label="Skills" onClick={(e) => e.stopPropagation()}>
        <div className="bar"><span className="t">skills.exe</span><button className="ghost" style={{ color: "#fff", padding: "2px 6px" }} aria-label="Close" onClick={onClose}>×</button></div>
        <div className="body">
          <input aria-label="Search skills" placeholder="Search your Claude Code skills" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 12 }} autoFocus />
          <ul className="clist">
            {shown.map((s) => (
              <li key={s.name}>
                <label className="row" style={{ gap: 10, flex: 1, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={picked.includes(s.name)} onChange={() => onToggle(s.name)} style={{ marginTop: 3 }} />
                  <span><b>{s.name}</b><br /><span className="muted" style={{ fontSize: 13 }}>{s.description}</span></span>
                </label>
              </li>
            ))}
            {list && shown.length === 0 && <li className="muted">No skill matches.</li>}
          </ul>
          <div className="row" style={{ marginTop: 12 }}><span className="muted">{picked.length} picked: Claude uses them for this ask.</span><span className="spacer" /><button onClick={onClose}>Done</button></div>
        </div>
      </div>
    </div>
  );
}
