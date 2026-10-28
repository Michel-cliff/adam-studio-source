import { Player, type PlayerRef } from "@remotion/player";
import { Edit } from "@adam-studio/render/edit";
import type { RenderProps } from "@adam-studio/render/src/props";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, enc, go } from "./api";
import { t as tr, useLang } from "./i18n";
import { pack, stripSlots } from "./lanes";
import { Wave } from "./wave";

type Raw = Record<string, any>;
type Selected = { kind: "clip" | "element" | "caption"; id: string } | null;
type Word = { id: string; text: string; startMs: number; endMs: number };
type WordSel = { asset: string; from: number; to: number } | null;
const wordsIn = (raw: Raw, sel: WordSel): Word[] => {
  const list: Word[] = sel ? raw.transcript?.words?.[sel.asset] ?? [] : [];
  return sel ? list.slice(Math.min(sel.from, sel.to), Math.max(sel.from, sel.to) + 1) : [];
};
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

/** The caption's place in project.json, from its timeline id (cap3, or cap3.1 when a cut splits it). */
const capIndex = (id: string) => Number(id.match(/^cap(\d+)/)?.[1] ?? -1);

type Drag = { key: string; x0: number; width: number; dx: number; moved: boolean; from: number };

function Lanes({ props, raw, frame, selected, select, seek, move, trim }: { props: RenderProps; raw: Raw; frame: number; selected: Selected; select: (s: Selected) => void; seek: (f: number) => void;
  move: (what: "element" | "caption" | "story" | "element-start" | "element-end", id: string | number, to: number) => void;
  trim: (clip: string, edge: "in" | "out", deltaMs: number) => void }) {
  const [drag, setDrag] = useState<Drag | null>(null);
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
  const pick = (kind: "clip" | "element" | "caption", id: string, from: number) => { select({ kind, id }); seek(from); };
  // Drag a block to move it: an element or a sound to another moment, a caption onto other words, a story clip to another place.
  // A press without moving is a click: it selects the block.
  const draggable = (key: string, onDrop: (frames: number) => void, onClick: () => void, from = 0) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
      setDrag({ key, x0: e.clientX, width: (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width, dx: 0, moved: false, from });
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      setDrag((d) => (d && d.key === key ? { ...d, dx: e.clientX - d.x0, moved: d.moved || Math.abs(e.clientX - d.x0) > 4 } : d));
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      e.stopPropagation();
      const d = drag;
      setDrag(null);
      if (!d || d.key !== key) return;
      if (d.moved) onDrop(Math.round((d.dx / d.width) * total)); else onClick();
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });
  // The arrows on a block's edges stretch or shorten it (on a story clip: trim it, a cut); moving keeps its length.
  const handles = (key: string, from: number, dur: number, onEdge: (edge: "start" | "end", frames: number) => void) => (["start", "end"] as const).map((edge) => (
    <span key={edge} className={`handle ${edge}`} title={edge === "start" ? "Drag to change the start" : "Drag to change the end"}
      {...draggable(`${key}:${edge}`, (f) => onEdge(edge, f), () => {}, edge === "start" ? from : from + dur)}>{edge === "start" ? "‹" : "›"}</span>
  ));
  const lift = (key: string) => (drag?.key === key && drag.moved ? { transform: `translateX(${drag.dx}px)`, zIndex: 5, opacity: 0.85, cursor: "grabbing" } : {});
  const ms = (f: number) => Math.round((f * 1000) / timeline.fps);
  const inProject = (id: string) => (raw.elements ?? []).some((x: Raw) => x.id === id);
  // A story clip dropped among the others: its place is how many clips have their middle before where its middle lands.
  const storyIndex = (id: string, shift: number) => {
    const c = timeline.clips.find((x) => x.id === id)!;
    const mid = c.fromFrame + c.durationFrames / 2 + shift;
    return timeline.clips.filter((x) => x.id !== id && x.fromFrame + x.durationFrames / 2 < mid).length;
  };
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
        {timeline.clips.map((c) => <button key={c.id} type="button" className={`cliprect${isSel("clip", c.id) ? " sel" : ""}`} title={`${c.id} · ${c.asset} · drag to reorder`}
          {...draggable(`clip:${c.id}`, (f) => move("story", c.id, storyIndex(c.id, f)), () => pick("clip", c.id, c.fromFrame), c.fromFrame)}
          style={{ left: pct(c.fromFrame), width: pct(c.durationFrames), ...lift(`clip:${c.id}`) }}>
          {isSel("clip", c.id) && handles(`clip:${c.id}`, c.fromFrame, c.durationFrames, (edge, f) => trim(c.id, edge === "start" ? "in" : "out", ms(f)))}
        </button>)}
      </>)}
      {lane("ELEMENTS", "", lanesOf(els) * 23 + 2, els.map((e) => {
        const img = typeof e.props.asset === "string" ? media[e.props.asset]?.file : undefined;
        const pic = img && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(img) ? img : undefined;
        return (
          <button key={e.id} type="button" className={`blk${isSel("element", e.id) ? " sel" : ""}`} title={`${e.kind} ${e.id}`}
            {...draggable(`el:${e.id}`, (f) => move("element", e.id, ms(Math.max(0, e.fromFrame + f))), () => pick("element", e.id, e.fromFrame), e.fromFrame)}
            style={{ left: pct(e.fromFrame), width: pct(e.durationFrames), top: e.lane * 23 + 1, ...lift(`el:${e.id}`) }}>
            {isSel("element", e.id) && handles(`el:${e.id}`, e.fromFrame, e.durationFrames, (edge, f) => move(edge === "start" ? "element-start" : "element-end", e.id, ms(Math.max(0, (edge === "start" ? e.fromFrame : e.fromFrame + e.durationFrames) + f))))}
            {pic && <img src={pic} alt="" />}{e.id}
          </button>
        );
      }))}
      {lane("CAPTIONS", "", lanesOf(caps) * 26 + 2, caps.map((c) => (
        <button key={c.id} type="button" className={`cap${isSel("caption", c.id) ? " sel" : ""}`} title={c.text}
          {...draggable(`cap:${c.id}`, (f) => move("caption", capIndex(c.id), ms(Math.max(0, c.fromFrame + f))), () => pick("caption", c.id, c.fromFrame), c.fromFrame)}
          style={{ left: pct(c.fromFrame), width: pct(c.durationFrames), top: c.lane * 26 + 2, ...lift(`cap:${c.id}`) }}>{c.text}</button>
      )))}
      {lane("SOUND", "", lanesOf(sounds) * 36 + 4, sounds.map((a) => (
        <span key={a.id} className={`snd${inProject(a.id) ? " movable" : ""}${isSel("element", a.id) ? " sel" : ""}`} title={inProject(a.id) ? `${a.asset} · drag to move` : a.asset}
          {...(inProject(a.id) ? draggable(`snd:${a.id}`, (f) => move("element", a.id, ms(Math.max(0, a.fromFrame + f))), () => pick("element", a.id, a.fromFrame), a.fromFrame) : {})}
          style={{ left: pct(a.fromFrame), width: pct(Math.max(1, a.durationFrames)), top: a.lane * 36 + 3, ...lift(`snd:${a.id}`) }}>
          <Wave url={media[a.asset]?.file ?? media[a.asset]?.video} label={a.asset} />
        </span>
      )))}
      {/* While dragging: where the block's start will land, and when. */}
      {drag?.moved && (() => {
        const at = Math.min(total, Math.max(0, drag.from + (drag.dx / drag.width) * total));
        return <span className="dropline" aria-hidden="true" style={{ left: `calc(110px + (100% - 110px) * ${at / total})` }}><b>{clock(at / timeline.fps)}</b></span>;
      })()}
      <span className="playhead" aria-hidden="true" style={{ left: `calc(110px + (100% - 110px) * ${frame / total})` }} />
    </section>
  );
}

// What the keyboard and the mouse do in the timeline, as built.
const KEYS: [string, string][] = [
  ["Space", "Play · pause"], ["Del · ⌫", "Remove the selection"], ["Ctrl+Z", "Undo the last change"], ["T", "Back to the steps"],
  ["Drag a block", "Move it (story: reorder)"], ["Click a word", "Jump there"], ["Shift+click", "Select a passage"],
];
function Keys() {
  return (
    <div className="keys" aria-label="Shortcuts">
      <div className="h small">SHORTCUTS</div>
      {KEYS.map(([k, v]) => <div key={k} className="kv"><kbd>{k}</kbd><span>{v}</span></div>)}
    </div>
  );
}

function Inspector({ raw, props, selected, edit }: { raw: Raw; props: RenderProps; selected: Selected; edit: (body: Raw) => Promise<boolean> }) {
  const where = selected ? ({ clip: "story", element: "elements", caption: "captions" } as const)[selected.kind] : null;
  const index = !where || !Array.isArray(raw[where]) ? -1 : selected!.kind === "caption" ? (raw.captions[capIndex(selected!.id)] ? capIndex(selected!.id) : -1) : raw[where].findIndex((x: Raw) => x.id === selected!.id);
  const item = index >= 0 ? raw[where!][index] : null;
  const [text, setText] = useState("");
  useEffect(() => { setText(item ? JSON.stringify(item, null, 2) : ""); }, [JSON.stringify(item)]);
  const tl = props.timeline;
  const placed = selected?.kind === "clip" ? tl.clips.find((c) => c.id === selected.id) : selected?.kind === "element" ? tl.elements.find((e) => e.id === selected.id) : tl.captions.find((c) => c.id === selected?.id);
  const undo = <button type="button" className="act" onClick={() => edit({ op: "undo" })}>UNDO</button>;
  if (!selected) return <aside aria-label="Selected element" className="status"><div className="h">NOTHING SELECTED</div><p className="note">CLICK A BLOCK OF THE TIMELINE.</p><div className="pair">{undo}</div><Keys /></aside>;
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
      <Keys />
    </aside>
  );
}

function Words({ raw, props, frame, seek, edit, sel, setSel }: { raw: Raw; props: RenderProps; frame: number; seek: (f: number) => void; edit: (body: Raw) => Promise<boolean>; sel: WordSel; setSel: (s: WordSel) => void }) {
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
  const chosen = wordsIn(raw, sel);
  return (
    <section aria-label="Transcript" className="words-col">
      <div className="h row-between"><span>WORDS</span><span className="mono">CLICK TO JUMP · SHIFT+CLICK A PASSAGE · DEL CUTS</span></div>
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
  const [selected, setSelectedRaw] = useState<Selected>(null);
  const [wordSel, setWordSelRaw] = useState<WordSel>(null);
  // One selection at a time, so Delete knows what to remove: a block of the timeline or a passage of words.
  const setSelected = (s: Selected) => { setSelectedRaw(s); if (s) setWordSelRaw(null); };
  const setWordSel = (s: WordSel) => { setWordSelRaw(s); if (s) setSelectedRaw(null); };
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
  // Delete or Backspace removes the selection, Ctrl+Z undoes the last change, T goes back to the steps, space plays.
  const keys = useRef({ remove: () => {}, undo: () => {} });
  keys.current = {
    undo: () => void edit({ op: "undo" }).then((ok) => ok && setNote("Undone.")),
    remove: () => {
      if (!raw) return;
      const words = wordsIn(raw, wordSel);
      if (words.length) { void edit({ op: "cut_words", words: words.map((w) => w.id) }).then((ok) => ok && setWordSelRaw(null)); return; }
      if (!selected || selected.kind === "clip") return;
      const where = selected.kind === "element" ? "elements" : "captions";
      const index = !Array.isArray(raw[where]) ? -1 : selected.kind === "caption" ? (raw.captions[capIndex(selected.id)] ? capIndex(selected.id) : -1) : raw[where].findIndex((x: Raw) => x.id === selected.id);
      if (index >= 0) void edit({ op: "set_value", pointer: `/${where}/${index}`, remove: true }).then((ok) => ok && setSelectedRaw(null));
    },
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); keys.current.undo(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); keys.current.remove(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
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
            <Words raw={raw} props={props} frame={frame} seek={seek} edit={edit} sel={wordSel} setSel={setWordSel} />
            <Inspector raw={raw} props={props} selected={selected} edit={edit} />
          </div>
          <Lanes props={props} raw={raw} frame={frame} selected={selected} select={setSelected} seek={seek}
            trim={(clip, edge, d) => { const c = (raw.story ?? []).find((x: Raw) => x.id === clip); if (c) void edit({ op: "update_item", collection: "story", id: clip, changes: edge === "in" ? { inMs: Math.max(0, c.inMs + d) } : { outMs: Math.max(c.inMs + 100, c.outMs + d) } }).then((ok) => ok && setNote("Clip trimmed. Ctrl+Z puts it back.")); }}
            move={(what, id, to) => void edit({ op: "move", what, ...(what === "caption" ? { index: id } : { id }), to }).then((ok) => ok && setNote(what === "story" ? "Clip moved. Ctrl+Z puts it back." : "Moved. Ctrl+Z puts it back."))} />
        </>
      )}
      <footer className="foot">
        {note && <span className="mono note-line" title={note}>{note.split("\n")[0]}</span>}
        <span className="hint">{selected || wordSel ? "Del removes it · Ctrl+Z undoes · Space plays · T goes back to the steps." : "Select an element on the timeline. Ctrl+Z undoes."}</span>
      </footer>
    </>
  );
}
