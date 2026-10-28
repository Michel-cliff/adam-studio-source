import { Player, type PlayerRef } from "@remotion/player";
import { Edit } from "@adam-studio/render/edit";
import type { RenderProps } from "@adam-studio/render/src/props";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, enc, go } from "./api";
import { t as tr, useLang } from "./i18n";
import { pack, peaks, stripSlots } from "./lanes";

type Raw = Record<string, any>;
type Selected = { kind: "clip" | "element" | "caption"; id: string } | null;
type Word = { id: string; text: string; startMs: number; endMs: number };
const SLOTS = 14;
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

// Frames of the takes for the filmstrip, drawn once per moment from the preview's proxy video:
// one video per take, sought from moment to moment.
const frames = new Map<string, Promise<string>>();
const players = new Map<string, Promise<HTMLVideoElement | null>>();
let queue: Promise<unknown> = Promise.resolve();
function videoFor(url: string): Promise<HTMLVideoElement | null> {
  if (!players.has(url)) players.set(url, new Promise((done) => {
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.playsInline = true;
    v.onloadeddata = () => done(v);
    v.onerror = () => done(null);
    v.src = url;
  }));
  return players.get(url)!;
}
function grab(url: string, ms: number): Promise<string> {
  const key = `${url}@${ms}`;
  if (!frames.has(key)) {
    const p = queue.then(async () => {
      const v = await videoFor(url);
      if (!v) return "";
      await new Promise<void>((r) => {
        const t = Math.min(ms / 1000, Math.max(0, v.duration - 0.05));
        if (Math.abs(v.currentTime - t) < 0.01) return r();
        const off = setTimeout(r, 4000);
        v.addEventListener("seeked", () => { clearTimeout(off); r(); }, { once: true });
        v.currentTime = t;
      });
      const c = document.createElement("canvas");
      c.width = 72; c.height = Math.round((72 * v.videoHeight) / Math.max(1, v.videoWidth));
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.7);
    });
    queue = p.catch(() => "");
    frames.set(key, p.catch(() => ""));
  }
  return frames.get(key)!;
}

function Filmstrip({ props }: { props: RenderProps }) {
  const slots = useMemo(() => stripSlots(props.timeline, SLOTS), [props]);
  const [pics, setPics] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    // One after the other: each grab seeks a video, and the browser does that best one at a time.
    (async () => {
      const out: string[] = [];
      for (const s of slots) {
        const url = s ? props.media[s.asset]?.video : undefined;
        out.push(url ? await grab(url, s!.ms) : "");
        if (alive) setPics([...out]);
      }
    })();
    return () => { alive = false; };
  }, [slots]);
  return <div className="film" aria-hidden="true">{slots.map((_, i) => pics[i] ? <img key={i} src={pics[i]} alt="" /> : <span key={i} />)}</div>;
}

// Waveforms of the sounds, decoded once per file.
const waves = new Map<string, Promise<number[]>>();
function useWave(url: string | undefined): number[] {
  const [w, setW] = useState<number[]>([]);
  useEffect(() => {
    if (!url) return;
    if (!waves.has(url)) waves.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => new AudioContext().decodeAudioData(b)).then((a) => peaks(a.getChannelData(0), 60)).catch(() => []));
    let alive = true;
    void waves.get(url)!.then((p) => { if (alive) setW(p); });
    return () => { alive = false; };
  }, [url]);
  return w;
}

function Wave({ url, label }: { url?: string; label: string }) {
  const w = useWave(url);
  const pts = w.map((v, i) => `${((i / Math.max(1, w.length - 1)) * 200).toFixed(1)},${(15 - v * 13).toFixed(1)} `).join("")
    + w.map((v, i) => `${(((w.length - 1 - i) / Math.max(1, w.length - 1)) * 200).toFixed(1)},${(15 + w[w.length - 1 - i]! * 13).toFixed(1)} `).join("");
  return (
    <>
      <svg viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true">{w.length > 0 && <polygon points={pts} />}</svg>
      <span className="lbl">{label}</span>
    </>
  );
}

function Lanes({ props, frame, selected, select, seek }: { props: RenderProps; frame: number; selected: Selected; select: (s: Selected) => void; seek: (f: number) => void }) {
  const { timeline, media } = props;
  const total = Math.max(1, timeline.durationFrames);
  const pct = (f: number) => `${(f / total) * 100}%`;
  const els = pack(timeline.elements);
  const caps = pack(timeline.captions);
  const sounds = pack(timeline.audio.filter((a) => !a.id.startsWith("clip:")));
  const lanesOf = (l: { lane: number }[]) => Math.max(1, ...l.map((x) => x.lane + 1));
  const secs = total / timeline.fps;
  const step = secs > 90 ? 15 : secs > 30 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(secs / step) + 1 }, (_, i) => i * step);
  const isSel = (kind: string, id: string) => selected?.kind === kind && selected.id === id;
  const pick = (kind: "clip" | "element" | "caption", id: string, from: number) => (e: React.MouseEvent) => { e.stopPropagation(); select({ kind, id }); seek(from); };
  const onTrack = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); seek(Math.round(((e.clientX - r.left) / r.width) * total)); };
  const lane = (label: string, cls: string, height: number, children: React.ReactNode) => (
    <div className="lane"><span className="lname">{label}</span><div className={`track ${cls}`} style={{ height }} onClick={onTrack}>{children}</div></div>
  );
  return (
    <section aria-label="Timeline" className="lanes">
      <div className="lane"><span /><div className="ticks mono">{ticks.map((s) => <span key={s} style={{ left: pct(s * timeline.fps) }}>{clock(s).replace(/\.0$/, "")}</span>)}</div></div>
      <div className="lane"><span /><div className="ruler" aria-hidden="true" style={{ backgroundSize: `${(timeline.fps / total) * 100}% 100%` }} /></div>
      {lane("STORY", "story", 62, <>
        <Filmstrip props={props} />
        {timeline.clips.map((c) => <button key={c.id} type="button" className={`cliprect${isSel("clip", c.id) ? " sel" : ""}`} title={`${c.id} · ${c.asset}`}
          style={{ left: pct(c.fromFrame), width: pct(c.durationFrames) }} onClick={pick("clip", c.id, c.fromFrame)} />)}
      </>)}
      {lane("ELEMENTS", "", lanesOf(els) * 23 + 2, els.map((e) => {
        const img = typeof e.props.asset === "string" ? media[e.props.asset]?.file : undefined;
        const pic = img && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(img) ? img : undefined;
        return (
          <button key={e.id} type="button" className={`blk${isSel("element", e.id) ? " sel" : ""}`} title={`${e.kind} ${e.id}`}
            style={{ left: pct(e.fromFrame), width: pct(e.durationFrames), top: e.lane * 23 + 1 }} onClick={pick("element", e.id, e.fromFrame)}>
            {pic && <img src={pic} alt="" />}{e.id}
          </button>
        );
      }))}
      {lane("CAPTIONS", "", lanesOf(caps) * 26 + 2, caps.map((c) => (
        <button key={c.id} type="button" className={`cap${isSel("caption", c.id) ? " sel" : ""}`} title={c.text}
          style={{ left: pct(c.fromFrame), width: pct(c.durationFrames), top: c.lane * 26 + 2 }} onClick={pick("caption", c.id, c.fromFrame)}>{c.text}</button>
      )))}
      {lane("SOUND", "", lanesOf(sounds) * 36 + 4, sounds.map((a) => (
        <span key={a.id} className="snd" style={{ left: pct(a.fromFrame), width: pct(Math.max(1, a.durationFrames)), top: a.lane * 36 + 3 }}>
          <Wave url={media[a.asset]?.file ?? media[a.asset]?.video} label={a.asset} />
        </span>
      )))}
      <span className="playhead" aria-hidden="true" style={{ left: `calc(110px + (100% - 110px) * ${frame / total})` }} />
    </section>
  );
}

function Inspector({ raw, props, selected, edit }: { raw: Raw; props: RenderProps; selected: Selected; edit: (body: Raw) => Promise<boolean> }) {
  const where = selected ? ({ clip: "story", element: "elements", caption: "captions" } as const)[selected.kind] : null;
  const index = where && Array.isArray(raw[where]) ? raw[where].findIndex((x: Raw) => x.id === selected!.id) : -1;
  const item = index >= 0 ? raw[where!][index] : null;
  const [text, setText] = useState("");
  useEffect(() => { setText(item ? JSON.stringify(item, null, 2) : ""); }, [JSON.stringify(item)]);
  const tl = props.timeline;
  const placed = selected?.kind === "clip" ? tl.clips.find((c) => c.id === selected.id) : selected?.kind === "element" ? tl.elements.find((e) => e.id === selected.id) : tl.captions.find((c) => c.id === selected?.id);
  const undo = <button type="button" className="act" onClick={() => edit({ op: "undo" })}>UNDO</button>;
  if (!selected) return <aside aria-label="Selected element" className="status"><div className="h">NOTHING SELECTED</div><p className="note">CLICK A BLOCK OF THE TIMELINE.</p><div className="pair">{undo}</div></aside>;
  const kv: [string, string][] = [];
  if (placed) { kv.push(["Starts", clock(placed.fromFrame / tl.fps)], ["Duration", `${(placed.durationFrames / tl.fps).toFixed(2)} s`]); }
  if (placed && "x" in placed) kv.push(["Position", `${placed.x.toFixed(2)} · ${placed.y.toFixed(2)}`]);
  if (item) for (const [k, v] of Object.entries(item.props ?? {})) if (["string", "number", "boolean"].includes(typeof v) && kv.length < 9) kv.push([k[0]!.toUpperCase() + k.slice(1), String(v)]);
  if (selected.kind === "clip" && item) kv.push(["Asset", item.asset], ["In", `${(item.inMs / 1000).toFixed(2)} s`], ["Out", `${(item.outMs / 1000).toFixed(2)} s`]);
  const save = () => { let v; try { v = JSON.parse(text); } catch (e) { alert(`Not valid JSON: ${(e as Error).message}`); return; } void edit({ op: "set_value", pointer: `/${where}/${index}`, value: v }); };
  const nudge = (key: "inMs" | "outMs", d: number) => edit({ op: "update_item", collection: "story", id: item.id, changes: { [key]: Math.max(0, item[key] + d) } });
  const textProp = selected.kind === "element" && item && typeof item.props?.text === "string";
  return (
    <aside aria-label="Selected element" className="status">
      <div className="h">{selected.id.toUpperCase()} · {(placed && "kind" in placed ? placed.kind : selected.kind).toUpperCase()}</div>
      {kv.map(([k, v]) => <div key={k} className="kv"><span>{k}</span><b title={v}>{v}</b></div>)}
      {!item && <p className="note">GENERATED FROM THE TRANSCRIPT OR THE STYLE: EDIT ITS SOURCE INSTEAD.</p>}
      {selected.kind === "clip" && item && (
        <div className="kv"><span>Trim</span><span className="nudges">
          <button type="button" className="link" onClick={() => nudge("inMs", -100)}>in −0.1</button><button type="button" className="link" onClick={() => nudge("inMs", 100)}>+0.1</button>
          <button type="button" className="link" onClick={() => nudge("outMs", -100)}>out −0.1</button><button type="button" className="link" onClick={() => nudge("outMs", 100)}>+0.1</button>
        </span></div>
      )}
      {textProp && <input aria-label="Text" defaultValue={item.props.text} key={item.props.text} title="Enter to save"
        onKeyDown={(e) => { if (e.key === "Enter") void edit({ op: "update_item", collection: "elements", id: item.id, changes: { props: { text: (e.target as HTMLInputElement).value } } }); }} />}
      <div className="pair">
        {undo}
        {item && selected.kind !== "clip" && <button type="button" className="act fill" onClick={() => { if (confirm(`Delete ${selected.kind} ${selected.id}?`)) void edit({ op: "set_value", pointer: `/${where}/${index}`, remove: true }); }}>DELETE</button>}
      </div>
      {item && (
        <details className="json-box">
          <summary className="mono">ALL FIELDS</summary>
          <textarea className="json" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <button type="button" className="act" onClick={save}>SAVE</button>
        </details>
      )}
    </aside>
  );
}

function Words({ raw, props, frame, seek, edit }: { raw: Raw; props: RenderProps; frame: number; seek: (f: number) => void; edit: (body: Raw) => Promise<boolean> }) {
  const [sel, setSel] = useState<{ asset: string; from: number; to: number } | null>(null);
  const [minPause, setMinPause] = useState(600);
  const box = useRef<HTMLDivElement>(null);
  const words: Record<string, Word[]> = raw.transcript?.words ?? {};
  const story: Raw[] = raw.story ?? [];
  const kept = (asset: string, w: Word) => story.some((c) => c.asset === asset && w.startMs >= c.inMs && w.endMs <= c.outMs);
  const frameOf = (asset: string, ms: number) => {
    const c = props.timeline.clips.find((x) => x.asset === asset && ms >= x.sourceInMs && ms < x.sourceOutMs);
    return c ? c.fromFrame + Math.round(((ms - c.sourceInMs) * props.timeline.fps) / 1000) : null;
  };
  // The word being said at the playhead.
  const now = useMemo(() => {
    let best: { id: string; f: number } | null = null;
    for (const [asset, list] of Object.entries(words)) for (const w of list) {
      const f = frameOf(asset, w.startMs);
      if (f !== null && f <= frame && (!best || f > best.f)) best = { id: w.id, f };
    }
    return best?.id ?? null;
  }, [frame, raw, props]);
  useEffect(() => { box.current?.querySelector(".word.now")?.scrollIntoView({ block: "nearest" }); }, [now]);
  const chosen = sel ? words[sel.asset]!.slice(Math.min(sel.from, sel.to), Math.max(sel.from, sel.to) + 1) : [];
  return (
    <section aria-label="Transcript" className="words-col">
      <div className="h row-between"><span>WORDS</span><span className="mono">CLICK TO JUMP · SHIFT+CLICK A PASSAGE</span></div>
      <div className="words-box" ref={box}>
        {Object.entries(words).map(([asset, list]) => (
          <p key={asset} className="words">
            {Object.keys(words).length > 1 && <span className="mono dim">{asset} </span>}
            {list.map((w, i) => {
              const inSel = sel?.asset === asset && i >= Math.min(sel.from, sel.to) && i <= Math.max(sel.from, sel.to);
              return (
                <span key={w.id} className={`word${kept(asset, w) ? "" : " cut"}${inSel ? " sel" : ""}${w.id === now ? " now" : ""}`} title={`${w.id} ${(w.startMs / 1000).toFixed(2)} s`}
                  onClick={(e) => {
                    if (e.shiftKey && sel?.asset === asset) setSel({ ...sel, to: i });
                    else setSel({ asset, from: i, to: i });
                    const f = frameOf(asset, w.startMs);
                    if (f !== null) seek(f);
                  }}>{w.text} </span>
              );
            })}
          </p>
        ))}
      </div>
      <div className="row words-acts mono">
        <button type="button" className="act" disabled={!chosen.length} onClick={async () => { if (await edit({ op: "cut_words", words: chosen.map((w) => w.id) })) setSel(null); }}>CUT {chosen.length ? `${chosen.length} WORD${chosen.length > 1 ? "S" : ""}` : "SELECTION"}</button>
        <span>PAUSES OVER</span>
        <input type="number" aria-label="Pauses over, in milliseconds" step={100} value={minPause} onChange={(e) => setMinPause(Number(e.target.value))} />
        <span>MS</span>
        <button type="button" className="act" onClick={() => edit({ op: "tighten", minPauseMs: minPause, keepMs: 200 })}>TIGHTEN</button>
      </div>
    </section>
  );
}

export function Editor({ name }: { name: string }) {
  useLang();
  const [props, setProps] = useState<RenderProps | null>(null);
  const [raw, setRaw] = useState<Raw | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<Selected>(null);
  const player = useRef<PlayerRef>(null);
  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([api<RenderProps>(`/projects/${enc(name)}/preview`), api<Raw>(`/projects/${enc(name)}/raw`)]);
      setProps(p); setRaw(r); setError("");
    } catch (e) { setError((e as Error).message); }
  }, [name]);
  useEffect(() => {
    void load();
    const ev = new EventSource("/api/events");
    ev.onmessage = (m) => { if (JSON.parse(m.data).project === name) void load(); };
    return () => ev.close();
  }, [name]);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const on = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const play = () => setPlaying(true), pause = () => setPlaying(false);
    p.addEventListener("frameupdate", on); p.addEventListener("play", play); p.addEventListener("pause", pause);
    return () => { p.removeEventListener("frameupdate", on); p.removeEventListener("play", play); p.removeEventListener("pause", pause); };
  }, [props !== null]);
  // T goes back to the steps, space plays.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "t") go(`#/p/${enc(name)}`);
      if (e.key === " " && player.current) { e.preventDefault(); player.current.toggle(); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [name]);
  const seek = (f: number) => { player.current?.seekTo(f); setFrame(f); };
  const edit = async (body: Raw): Promise<boolean> => {
    try {
      const r = await api<{ lint?: string[]; durationMs?: number; message?: string }>(`/projects/${enc(name)}/edit`, { method: "POST", body });
      setNote(r.message ?? (r.lint?.length ? r.lint.join("\n") : "Saved."));
      await load();
      return true;
    } catch (e) { setNote(""); setError((e as Error).message); return false; }
  };
  const tl = props?.timeline;
  const playerEl = useMemo(() => tl && props && (
    <Player ref={player} component={Edit} inputProps={props} durationInFrames={Math.max(1, tl.durationFrames)} fps={tl.fps}
      compositionWidth={tl.width} compositionHeight={tl.height} clickToPlay acknowledgeRemotionLicense style={{ width: "100%", height: "100%" }} />
  ), [props]);
  const sec = tl ? frame / tl.fps : 0;

  return (
    <>
      <div className="subbar">
        <h1 className="tl-title">Timeline <span className="mono">{name} · {clock(sec)} / {tl ? clock(tl.durationFrames / tl.fps) : ""}</span></h1>
        <div role="group" aria-label="View" className="toggle">
          <a href={`#/p/${enc(name)}`}>{tr("STEPS")} · T</a>
          <a href={`#/p/${enc(name)}/edit`} aria-current="page" className="on">{tr("TIMELINE")}</a>
        </div>
      </div>
      {error && <p className="error" onClick={() => setError("")}>{error}</p>}
      {props && raw && tl && (
        <>
          <div className="cols editor-cols">
            <div className="preview-col">
              <div className="frame lit" style={{ aspectRatio: `${tl.width} / ${tl.height}` }}>{playerEl}</div>
              <div role="group" aria-label="Transport" className="transport mono">
                <button type="button" className="act" aria-label="Back one second" onClick={() => seek(Math.max(0, frame - tl.fps))}>−1s</button>
                <button type="button" className="act fill" aria-label={playing ? "Pause" : "Play"} onClick={() => player.current?.toggle()}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={playing ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M7 5v14l12-7z"} /></svg>
                </button>
                <button type="button" className="act" aria-label="Forward one second" onClick={() => seek(Math.min(tl.durationFrames - 1, frame + tl.fps))}>+1s</button>
                <span>{clock(sec)}</span>
              </div>
            </div>
            <Words raw={raw} props={props} frame={frame} seek={seek} edit={edit} />
            <Inspector raw={raw} props={props} selected={selected} edit={edit} />
          </div>
          <Lanes props={props} frame={frame} selected={selected} select={setSelected} seek={seek} />
        </>
      )}
      <footer className="foot">
        {note && <span className="mono note-line" title={note}>{note.split("\n")[0]}</span>}
        <span className="hint">{selected ? "Space plays · T goes back to the steps." : "Select an element on the timeline."}</span>
      </footer>
    </>
  );
}
