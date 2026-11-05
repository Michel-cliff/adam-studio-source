import { flashAiSwitch } from "./AiFailureBar";
import { reportAiFailure } from "./api";
import { t as uiText } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { api, enc } from "./api";
import { t, useLang } from "./i18n";

type Msg = { who: "you" | "ai"; text: string };
type VideoStats = { metrics: Record<string, string>; note: string; links: string[]; chat: Msg[]; source?: string };
type Video = { name: string; exported: boolean; where: string; stats: VideoStats };
type Ref = { id: string; name: string; source: string; status: "watching" | "watched" | "failed"; error?: string; aiFailed?: boolean; title?: string;
  saw: { k: string; v: string }[]; beats: { label: string; weight: number; kind: string }[]; shot?: string };
type Rule = { id: string; topic: string; text: string; source: string; on: boolean };
type All = { videos: Video[]; refs: Ref[]; rules: Rule[]; trends: { trait: string; count: number; of: number }[]; metrics: { k: string; label: string }[] };
type View = "videos" | "other" | "refs" | "learned";

const TOPIC_NAMES: Record<string, string> = { hook: "Hook", captions: "Captions", visuals: "Visuals", sound: "Sound", look: "Look", donts: "Don'ts" };
const TOPIC_COLORS: Record<string, string> = { hook: "var(--mustard)", captions: "var(--teal)", visuals: "var(--green)", sound: "var(--red)", look: "var(--mustard)", donts: "var(--red)" };
const BEAT_COLORS: Record<string, string> = { hook: "var(--mustard)", problem: "var(--red)", steps: "var(--teal)", twist: "var(--red)", proof: "var(--green)", cta: "var(--green)", other: "var(--cream)" };
const TREND_COLORS = ["var(--mustard)", "var(--teal)", "var(--green)", "var(--red)"];
const fileUrl = (p: string) => `/api/stats/file?path=${enc(p)}`;

function useAll() {
  const [all, setAll] = useState<All | null>(null);
  const [error, setError] = useState("");
  const load = () => api<All>("/stats").then((a) => { setAll(a); setError(""); }, (e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  // A reference being watched comes back on its own: look again every few seconds while one is.
  useEffect(() => {
    if (!all?.refs.some((r) => r.status === "watching")) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [all]);
  const call = async (path: string, method: string, body?: unknown) => {
    try { const a = await api<All & { say?: string }>(path, { method, body }); setAll(a); setError(""); return a; }
    catch (e) { setError((e as Error).message); return null; }
  };
  return { all, setAll, error, setError, call, load };
}

function useAiName() {
  const [name, setName] = useState("CLAUDE");
  useEffect(() => {
    api<{ engine: string; engines: Record<string, { model: string }> }>("/settings").then((s) => {
      const m = s.engines[s.engine]?.model ?? "default";
      setName(`${s.engine.toUpperCase()}${m === "default" ? "" : ` · ${m.toUpperCase()}`}`);
    }, () => {});
  }, []);
  return name;
}

async function upload(path: string, file: File) {
  const r = await fetch(`/api${path}${path.includes("?") ? "&" : "?"}name=${enc(file.name)}`, { method: "POST", body: file });
  const j = await r.json();
  if (j.aiFailure) reportAiFailure(j.error);
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j;
}

/** A drop zone: one file to onFile, or every matching file to onFiles. */
function Drop({ label, accept, onFile, onFiles, disabled = false }: { label: React.ReactNode; accept: RegExp; onFile?: (f: File) => void; onFiles?: (fs: File[]) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const take = (list: FileList | null | undefined) => {
    if (disabled) return;
    const fs = [...(list ?? [])].filter((x) => accept.test(x.name));
    if (onFiles) { if (fs.length) onFiles(fs); } else if (fs[0]) onFile?.(fs[0]);
  };
  return (
    <div className={`statdrop mono${over ? " over" : ""}`} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
      <span>{label}</span>
      <label className="link">browse<input type="file" disabled={disabled} hidden multiple={!!onFiles} onChange={(e) => { take(e.target.files); e.target.value = ""; }} /></label>
    </div>
  );
}

type Imported = { say: string; videos: string[]; added: string[]; off: string[] };

/** The stats of other videos, dropped as screenshots or exports: the AI reads them, advises each video, updates the rules. */
function ImportStats({ s, onPick, video, own = false }: { s: ReturnType<typeof useAll>; onPick: (name: string) => void; video?: string; own?: boolean }) {
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<Imported | null>(null);
  const running = useRef(false);
  const run = async (files: File[]) => {
    if (running.current || (own && !video)) return;
    running.current = true;
    const sum: Imported = { say: "", videos: [], added: [], off: [] };
    for (const [i, f] of files.entries()) {
      setBusy(`${files.length > 1 ? `READING ${i + 1} OF ${files.length}` : "ADAM READS THE NUMBERS"} · ABOUT 20 S…`);
      try {
        const j = await upload(`/stats/import${video ? `?video=${enc(video)}` : ""}`, f) as All & { imported: Imported };
        s.setAll(j); s.setError("");
        sum.say = j.imported.say || sum.say;
        sum.videos.push(...j.imported.videos); sum.added.push(...j.imported.added); sum.off.push(...j.imported.off);
      } catch (e) { s.setError(`${f.name}: ${(e as Error).message}`); }
    }
    running.current = false; setBusy("");
    if (sum.videos.length) { setDone(sum); onPick(sum.videos[0]!); }
  };
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return (
    <div className="importbox">
      <div className="h small">{own ? t("IMPORT VIDEO STATISTICS") : t("STATS OF OTHER VIDEOS")}</div>
      {own && <p className="note">{video ? `${t("Selected video")} : ${video}` : t("Export a project, then select it here to import its statistics.")}</p>}
      <Drop disabled={Boolean(busy) || (own && !video)} accept={/\.(png|jpe?g|webp|pdf|csv|tsv|txt|json)$/i} onFiles={(fs) => void run(fs)}
        label={busy || <>DROP THE STATS OF ANY VIDEO<br />PNG · JPG · PDF · CSV</>} />
      {done && <div className="importdone">
        <span className="mono ok">{[n(done.videos.length, "VIDEO", "VIDEOS"), n(done.added.length, "NEW RULE", "NEW RULES"), done.off.length ? n(done.off.length, "RULE OFF", "RULES OFF") : ""].filter(Boolean).join(" · ")}</span>
        {done.say && <p>{done.say}</p>}
      </div>}
      {!done && !busy && <p className="note">DROP AN EXPORT OR SCREENSHOT. ADAM ANALYSES YOUR STATS AND ADVISES YOUR NEXT VIDEOS.</p>}
    </div>
  );
}

function MyVideos({ s, other = false }: { s: ReturnType<typeof useAll>; other?: boolean }) {
  const all = s.all!;
  const videos = all.videos.filter(v => other ? !v.exported && v.stats.source === "IMPORTED" : v.exported || v.stats.source !== "IMPORTED");
  const [pick, setPick] = useState(videos[0]?.name ?? "");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [link, setLink] = useState("");
  const ai = useAiName();
  const box = useRef<HTMLDivElement>(null);
  const v = videos.find((x) => x.name === pick) ?? videos[0];
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [v?.stats.chat.length, busy]);
  if (!v) return (
    <div className="cols stats-cols">
      <section className="list stats-video-sidebar"><div className="stats-import-dock"><ImportStats s={s} onPick={setPick} own={!other} /></div></section>
      <section className="center">
        <div className="head"><h1>{other ? t("OTHER VIDEOS") : t("YOUR VIDEO, ONCE EXPORTED")}</h1></div>
        <div className="perf"><div className="frame dummyframe" /><div className="metrics">{all.metrics.map((m) => <div key={m.k} className="kv"><span>{m.label}</span><b className="dim">—</b></div>)}</div></div>
        <p className="note">{other ? t("Import statistics from a screenshot or export to compare other videos and learn from them.") : t("EXPORT A VIDEO FROM THE STUDIO (WRAP), PUBLISH IT, THEN COME BACK WITH ITS NUMBERS: ADAM TELLS YOU WHAT WORKED.")}</p>
      </section>
      <aside className="status"><div className="h">WHAT ADAM APPLIES</div><p className="note">RULES APPEAR HERE AS ADAM LEARNS FROM YOUR VIDEOS.</p></aside>
    </div>
  );
  const put = (body: Record<string, unknown>) => s.call(`/stats/videos/${enc(v.name)}`, "PUT", body);
  const send = async () => {
    if (!q.trim() || busy) return;
    const text = q; setQ(""); setBusy("chat");
    s.setAll({ ...all, videos: all.videos.map((x) => (x.name === v.name ? { ...x, stats: { ...x.stats, chat: [...x.stats.chat, { who: "you", text }] } } : x)) });
    if (!(await s.call(`/stats/videos/${enc(v.name)}/chat`, "POST", { text }))) await s.load();
    setBusy("");
  };
  const strategy = async () => { setBusy("strategy"); await s.call("/stats/strategy", "POST", { video: v.name }); setBusy(""); };
  const applied = all.rules.filter((r) => r.on);
  return (
    <div className="cols stats-cols">
      <section aria-label={other ? "Other videos" : "My published videos"} className="list stats-video-sidebar">
        <div className="stats-video-list" tabIndex={0} aria-label={t("Video list")}>
        {videos.map((x) => (
          <button key={x.name} type="button" className={`row-item${x.name === v.name ? " on" : ""}`} onClick={() => setPick(x.name)}>
            <span>{x.name}</span><span className="mono">{x.where || (x.exported ? "EXPORTED" : x.stats.source ?? "")}</span>
          </button>
        ))}
        </div>
        <div className="stats-import-dock">
        <ImportStats key={v.name} s={s} onPick={setPick} own={!other} video={other ? undefined : v.name} />
        <label htmlFor="vlink" className="h small">{t("Published video link")}</label>
        <input id="vlink" placeholder="tiktok.com/@…, youtube.com/…" value={link} onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && link.trim()) { const u = /^https?:\/\//.test(link.trim()) ? link.trim() : `https://${link.trim()}`; void put({ links: [...v.stats.links, u] }).then((ok) => ok && setLink("")); } }} />
        {v.stats.links.map((l) => (
          <div key={l} className="kv"><a href={l} target="_blank" rel="noreferrer" className="mono ellipsis">{l.replace(/^https?:\/\/(www\.)?/, "")}</a>
            <button type="button" className="link" aria-label={`Remove ${l}`} onClick={() => void put({ links: v.stats.links.filter((x) => x !== l) })}>×</button></div>
        ))}
        </div>
      </section>

      <section aria-label={`${v.name} performance`} className="center">
        <div className="head"><h1>{v.name.toUpperCase()}</h1><span className="mono">{v.where || (v.stats.source === "IMPORTED" ? "IMPORTED STATS" : "NOT PUBLISHED YET")}</span></div>
        <div className="perf">
          {v.exported ? <div className="frame"><img src={`/api/projects/${enc(v.name)}/thumb`} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /></div>
            : <div className="frame dummyframe" />}
          <div className="metrics">
            {all.metrics.map((m) => (
              <label key={`${v.name}-${m.k}`} className="kv"><span>{m.label}</span>
                <input className="field" aria-label={m.label} defaultValue={v.stats.metrics[m.k] ?? ""} placeholder="—"
                  onBlur={(e) => { if (e.target.value !== (v.stats.metrics[m.k] ?? "")) void put({ metrics: { [m.k]: e.target.value } }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></label>
            ))}
            <p className="note">EDIT THESE VALUES OR USE THE IMPORT PANEL ON THE LEFT.</p>
          </div>
        </div>
        <div className="talk">
          <div className="notecol">
            <label htmlFor="worked" className="chathead">WHAT YOU THINK WORKED</label>
            <textarea id="worked" key={v.name} defaultValue={v.stats.note} onBlur={(e) => { if (e.target.value !== v.stats.note) void put({ note: e.target.value }); }} />
          </div>
          <div className="chatbox">
            <div className="chathead"><span>ADAM ON {v.name.toUpperCase()}</span><span className="mono">{ai.split(" · ")[1] ?? ""}</span></div>
            <div className="msgs" ref={box}>
              {v.stats.chat.length === 0 && <p className="note">ASK ABOUT THIS VIDEO: WHY PEOPLE LEFT, WHAT TO KEEP, WHAT TO TRY NEXT.</p>}
              {v.stats.chat.map((m, i) => <div key={i} className={`msg ${m.who}`}><b>{m.who === "you" ? "YOU" : "ADAM"}</b>{m.text}</div>)}
              {busy === "chat" && <div className="msg ai"><b>ADAM</b><i className="pulse" /></div>}
            </div>
            <div className="chatin">
              <input aria-label="Ask about this video" placeholder="Why did people leave at 0:05?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
              <button type="button" className="act fill" disabled={!q.trim() || Boolean(busy)} onClick={() => void send()}>SEND</button>
            </div>
          </div>
        </div>
      </section>

      <aside aria-label="What Adam applies" className="status">
        <div className="h">WHAT ADAM APPLIES</div>
        {applied.length === 0 && <p className="note">NOTHING YET: RULES COME FROM YOUR FEEDBACK, YOUR REFERENCES AND YOUR NUMBERS.</p>}
        <div className="scroll">
          {applied.map((r) => (
            <div key={r.id} className="applied"><span className={`sq${r.source === "YOUR NUMBERS" ? " full" : ""}`} aria-hidden="true" />
              <span>{r.text} <span className="mono dim">{r.source}</span></span></div>
          ))}
        </div>
        <p className="note sepline">FILLED SQUARE: FROM YOUR NUMBERS · EMPTY: FROM YOUR FEEDBACK OR A REFERENCE</p>
        <button type="button" className="act fill" disabled={Boolean(busy)} onClick={() => void strategy()}>{busy === "strategy" ? "THINKING…" : "ASK ADAM FOR THE NEXT STRATEGY"}</button>
      </aside>
    </div>
  );
}

function References({ s }: { s: ReturnType<typeof useAll> }) {
  const all = s.all!;
  const [pick, setPick] = useState(all.refs[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [added, setAdded] = useState("");
  const r = all.refs.find((x) => x.id === pick) ?? all.refs[0];
  const total = r ? r.beats.reduce((a, b) => a + b.weight, 0) || 1 : 1;
  const watch = async () => {
    const u = url.trim(); if (!u) return;
    const a = await s.call("/stats/refs", "POST", { url: /^https?:\/\//.test(u) ? u : `https://${u}` });
    if (a) { setUrl(""); setPick(a.refs[0]?.id ?? ""); }
  };
  const drop = async (f: File) => {
    try { const a = await upload("/stats/refs/upload", f); s.setAll(a); s.setError(""); setPick(a.refs[0]?.id ?? ""); } catch (e) { s.setError((e as Error).message); }
  };
  const use = async (as: "use" | "donts") => { if (r && await s.call(`/stats/refs/${r.id}/use`, "POST", { as })) setAdded(as === "use" ? "KEPT AS RULES FOR YOUR NEXT VIDEOS." : "ADDED TO YOUR DON'TS."); };
  return (
    <div className="cols stats-cols stats-reference-cols">
      <section aria-label="References" className="list stats-video-sidebar">
        <div className="stats-video-list" tabIndex={0} aria-label={t("References")}>
        {all.refs.map((x) => (
          <button key={x.id} type="button" className={`row-item${x.id === r?.id ? " on" : ""}`} onClick={() => { setPick(x.id); setAdded(""); }}>
            <span className="ellipsis">{x.title ?? x.name}</span><span className="mono">{x.status === "watching" ? "…" : x.status === "failed" ? "!" : x.source}</span>
          </button>
        ))}
        </div>
        <div className="stats-import-dock reference-import-dock">
        <label htmlFor="ref-link" className="h small">ADD A REFERENCE</label>
        <div className="row tight">
          <input id="ref-link" placeholder="Paste a TikTok, Reels or YouTube link" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void watch(); }} />
          <button type="button" className="act fill" disabled={!url.trim()} onClick={() => void watch()}>WATCH</button>
        </div>
        <Drop accept={/\.(mp4|mov|mkv|m4v|webm)$/i} onFile={drop} label="OR DROP A VIDEO FILE" />
        </div>
      </section>

      <section aria-label="Selected reference" className="center">
        {!r ? <p className="mono note">ADD A REFERENCE: A LINK OR A VIDEO YOU WANT TO LEARN FROM.</p> : <>
          <div className="head"><h1>{(r.title ?? r.name).toUpperCase()}</h1>
            <span className="mono">{r.source} · {r.status === "watching" ? "WATCHING…" : r.status.toUpperCase()}</span></div>
          <div className="ref-scroll">
          {r.status === "watching" && <p className="note"><i className="pulse" /> DOWNLOADING, TAKING FRAMES, THEN THE AI DESCRIBES IT. A MINUTE OR TWO.</p>}
          {r.status === "failed" && <p className="error">{r.error} {r.aiFailed && <><a className="link" href="#/" onClick={() => flashAiSwitch()}>{t("Switch AI")}</a> · </>}<button type="button" className="link" onClick={() => void s.call(`/stats/refs/${r.id}/retry`, "POST")}>Try again</button></p>}
          {r.status === "watched" && <>
            <div className="refbody">
              <div className="frame">{r.shot && <img src={fileUrl(r.shot)} alt="" />}</div>
              <div className="saw">
                <div className="h small">WHAT IT SAW</div>
                {r.saw.map((x, i) => <div key={i} className="sawline"><span className="mono dim">{t(x.k ? x.k[0]!.toUpperCase() + x.k.slice(1) : x.k)}</span><span>{x.v}</span></div>)}
              </div>
            </div>
            <div className="mono sepline">STRUCTURE</div>
            <div className="beats">{r.beats.map((b, i) => <span key={i} style={{ flex: b.weight / total, background: BEAT_COLORS[b.kind] ?? BEAT_COLORS.other }}>{b.label}</span>)}</div>
          </>}
          </div>
          <div className="row refacts">
            <button type="button" className="act fill" disabled={r.status !== "watched"} onClick={() => void use("use")}>USE IN MY NEXT VIDEO</button>
            <button type="button" className="act" disabled={r.status !== "watched"} onClick={() => void use("donts")}>ADD TO DON'TS</button>
            <button type="button" className="link" onClick={() => { if (confirm(uiText(`Remove “${r.title ?? r.name}” from your references?`))) void s.call(`/stats/refs/${r.id}`, "DELETE").then(() => setPick("")); }}>Remove</button>
            {added && <span className="mono ok">{added}</span>}
          </div>
        </>}
      </section>

      <aside aria-label="Trends" className="status">
        <div className="h">TRENDS IN YOUR REFERENCES</div>
        {all.trends.length === 0 && <p className="note">AFTER A FEW WATCHED REFERENCES, WHAT THEY SHARE SHOWS HERE.</p>}
        {all.trends.map((x, i) => (
          <div key={x.trait} className="trend"><span className="bar" style={{ background: TREND_COLORS[i % TREND_COLORS.length] }} aria-hidden="true" />
            <span>{x.trait}</span><span className="mono">{x.count} OF {x.of}</span></div>
        ))}
        <p className="note sepline">COUNTED ACROSS THE REFERENCES YOU ADDED. NO SCRAPING: ONLY WHAT YOU PASTE OR DROP.</p>
      </aside>
    </div>
  );
}

function Learned({ s }: { s: ReturnType<typeof useAll> }) {
  const all = s.all!;
  const [topic, setTopic] = useState("hook");
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [say, setSay] = useState("");
  const [busy, setBusy] = useState(false);
  const ai = "ADAM";
  const rules = all.rules.filter((r) => r.topic === topic);
  const kind = (src: string) => (src === "YOU" ? "From you" : src === "YOUR NUMBERS" ? "From your numbers" : src.startsWith("REFERENCE") ? "From references" : `From ${ai.toLowerCase()}`);
  const sources = Object.entries(all.rules.reduce<Record<string, number>>((a, r) => ({ ...a, [kind(r.source)]: (a[kind(r.source)] ?? 0) + 1 }), {}));
  const review = async () => { setBusy(true); const a = await s.call("/stats/review", "POST"); if (a?.say) setSay(a.say); setBusy(false); };
  return (
    <div className="cols learned-cols">
      <nav aria-label="Topics" className="list">
        {Object.keys(TOPIC_NAMES).map((k) => (
          <button key={k} type="button" className={`row-item topic${k === topic ? " on" : ""}`} style={{ borderLeftColor: TOPIC_COLORS[k] }} onClick={() => setTopic(k)}>
            <span>{TOPIC_NAMES[k]}</span><span className="mono">{all.rules.filter((r) => r.topic === k).length}</span>
          </button>
        ))}
      </nav>

      <section aria-label="Rules" className="center">
        <div className="head"><h1>{TOPIC_NAMES[topic]!.toUpperCase()}</h1><span className="mono">{rules.filter((r) => r.on).length} ON · APPLIED BY DEFAULT</span></div>
        <div className="rules">
          {rules.length === 0 && <p className="note">NO RULE HERE YET. ADD ONE, OR KEEP WHAT A REFERENCE DOES.</p>}
          {rules.map((r) => (
            <div key={r.id} className={`rule${r.on ? "" : " off"}`}>
              <button type="button" role="switch" aria-checked={r.on} aria-label={`${r.on ? "Turn off" : "Turn on"}: ${r.text}`} className="switch" onClick={() => void s.call(`/stats/rules/${r.id}`, "PUT", { on: !r.on })}><i /></button>
              <div><div className="rtext">{r.text}</div><div className="mono dim">{r.source}</div></div>
              <button type="button" className="link" aria-label={`Delete: ${r.text}`} onClick={() => void s.call(`/stats/rules/${r.id}`, "DELETE")}>×</button>
            </div>
          ))}
        </div>
      </section>

      <aside aria-label="Summary" className="status">
        <div className="h">WHERE IT COMES FROM</div>
        {sources.length === 0 && <p className="note">NO RULE YET.</p>}
        {sources.map(([k, n]) => <div key={k} className="kv"><span>{k}</span><b>{n}</b></div>)}
        <p className="readme">Every rule that is on travels with each ask to Adam, in the steps it belongs to. Turn one off to stop it without losing it.</p>
        {adding ? (
          <div className="addrule">
            <textarea aria-label={`New ${TOPIC_NAMES[topic]} rule`} placeholder={`A ${TOPIC_NAMES[topic]!.toLowerCase()} rule, in a sentence`} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <div className="row tight">
              <button type="button" className="act fill" disabled={!text.trim()} onClick={() => void s.call("/stats/rules", "POST", { topic, text }).then((a) => { if (a) { setText(""); setAdding(false); } })}>ADD</button>
              <button type="button" className="link" onClick={() => setAdding(false)}>cancel</button>
            </div>
          </div>
        ) : <button type="button" className="act fill" onClick={() => setAdding(true)}>ADD A RULE</button>}
        <button type="button" className="act" disabled={busy || !all.rules.length} onClick={() => void review()}>{busy ? "REVIEWING…" : `ASK ${ai} TO REVIEW THEM`}</button>
        {say && <p className="readme said">{say}</p>}
      </aside>
    </div>
  );
}

/** Statistics: my videos and their numbers, the references the AI watched, and the rules it learned. */
export function Stats({ view = "videos" }: { view?: string }) {
  useLang();
  const s = useAll();
  const v: View = view === "other" ? "other" : view === "refs" ? "refs" : view === "learned" ? "learned" : "videos";
  const views: [View, string, string][] = [["videos", "My videos", "#/stats"], ["other", "Other videos", "#/stats/other"], ["refs", "References & trends", "#/stats/refs"], ["learned", "What Adam learned", "#/stats/learned"]];
  const foot = v === "other" ? "Import statistics from other videos here." : v === "videos" ? "Your numbers stay on this computer. Adam reads them when you ask." : v === "refs" ? "Adam watches each reference once and keeps what it saw." : "Rules learned from your feedback, your references and your numbers.";
  return (
    <>
      <nav aria-label="Statistics views" className="subnav stats-subnav">
        {views.map(([k, label, href]) => <a key={k} href={href} className={v === k ? "on" : ""} aria-current={v === k ? "page" : undefined}>{t(label)}</a>)}
      </nav>
      {s.error && <p className="error" onClick={() => s.setError("")}>{s.error}</p>}
      {!s.all ? <p className="mono note">LOADING</p> : v === "videos" || v === "other" ? <MyVideos key={v} s={s} other={v === "other"} /> : v === "refs" ? <References s={s} /> : <Learned s={s} />}
      <footer className="foot"><span className="hint">{foot}</span></footer>
    </>
  );
}
