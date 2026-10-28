import type { RenderProps } from "@adam-studio/render/src/props";
import { useEffect, useRef, useState } from "react";
import type { ProposalView } from "../server/types";
import { api, enc } from "./api";
import { Wave } from "./wave";

/** What a step's button asks when nothing is proposed yet: three genuinely different options, like the hook. */
export const PRESETS: Record<string, { button: string; prompt: string }> = {
  story: { button: "PROPOSE 3 STORY SHAPES", prompt: "Propose three different shapes for the story (order and framework), anchored on what I say: for example result first, problem then fixes, open loop." },
  captions: { button: "PROPOSE 3 CAPTION STYLES", prompt: "Propose three caption styles that are genuinely different: the font, the size, the colors, how the key word is highlighted and where the captions sit. Keep my words." },
  hook: { button: "PROPOSE 3 HOOKS", prompt: "Propose three hooks for the first three seconds that pull different levers, anchored on what I say." },
  visuals: { button: "PROPOSE 3 VISUAL DIRECTIONS", prompt: "Propose three visual directions that are genuinely different: the images or icons, the effects and a color treatment, each anchored on what I say." },
  sound: { button: "PROPOSE 3 SOUNDTRACKS", prompt: "Propose three sound designs that are genuinely different: a music bed or none, effects on the key moments, the levels. Use audio files from my Inspiration folder or the free libraries." },
};

/** The script panel of the story: written by the creator, or drafted by the AI from the transcript, always editable. */
export function ScriptPanel({ name, aiName }: { name: string; aiName: string }) {
  const [s, setS] = useState<{ text: string; by: string } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api<{ text: string; by: string }>(`/projects/${enc(name)}/script`).then((x) => { setS(x); setText(x.text); }, (e) => setError(e.message)); }, [name]);
  const save = async () => {
    if (!s || text === s.text) return;
    try { const x = await api<{ text: string; by: string }>(`/projects/${enc(name)}/script`, { method: "PUT", body: { text } }); setS(x); setError(""); } catch (e) { setError((e as Error).message); }
  };
  const draft = async () => {
    if (s?.text && !confirm("Replace your script with one written from the transcript?")) return;
    setBusy(true);
    try { const x = await api<{ text: string; by: string }>(`/projects/${enc(name)}/script/draft`, { method: "POST" }); setS(x); setText(x.text); setError(""); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="script">
      <div className="chathead"><span>SCRIPT</span><span className="mono">{busy ? `${aiName} IS WRITING…` : s?.by === "ai" ? `DRAFTED BY ${aiName} · EDIT IT` : s?.by === "you" ? "YOURS" : "EMPTY"}</span></div>
      <textarea aria-label="Script" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => void save()} disabled={busy}
        placeholder={"Paste your script here, part by part:\n\nHOOK\n…\n\nPROBLEM\n…\n\nor let the AI write it from what you say."} />
      <div className="scriptacts">
        <button type="button" className={`act${s?.text ? "" : " fill"}`} disabled={busy} onClick={() => void draft()}>
          {busy ? "WRITING…" : s?.text ? "REWRITE FROM MY TRANSCRIPT" : "WRITE IT FROM MY TRANSCRIPT"}
        </button>
        <span className="mono dim">SENT WITH EVERY ASK</span>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

type Track = { id: string; asset: string; url: string };

/** The sounds a variant adds, as files the browser can play: what is new in its timeline's audio. */
function useTracks(name: string, p: ProposalView, stamp: string): Record<string, Track[]> {
  const [tracks, setTracks] = useState<Record<string, Track[]>>({});
  useEffect(() => {
    let alive = true;
    const base = `/projects/${enc(name)}/preview`;
    Promise.all([api<RenderProps>(base), ...p.variants.map((v) => api<RenderProps>(`${base}?proposal=${enc(p.id)}&variant=${v.key}`))]).then(([b, ...vs]) => {
      const known = new Set(b!.timeline.audio.map((a) => `${a.id}:${a.asset}`));
      const out: Record<string, Track[]> = {};
      p.variants.forEach((v, i) => {
        const props = vs[i]!;
        out[v.key] = props.timeline.audio.filter((a) => !a.id.startsWith("clip:") && !known.has(`${a.id}:${a.asset}`))
          .map((a) => ({ id: a.id, asset: a.asset, url: props.media[a.asset]?.file ?? props.media[a.asset]?.video ?? "" })).filter((t) => t.url);
      });
      if (alive) setTracks(out);
    }, () => {});
    return () => { alive = false; };
  }, [name, p.id, stamp]);
  return tracks;
}

/** The three soundtracks of a sound proposal, listed with their waveforms; each sound plays on its own. */
export function SoundTracks({ name, p, chosen, onPick, stamp }: { name: string; p: ProposalView; chosen: string | null; onPick: (key: string) => void; stamp: string }) {
  const tracks = useTracks(name, p, stamp);
  const [playing, setPlaying] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const play = (t: Track) => {
    audio.current?.pause();
    if (playing === t.url) { setPlaying(""); return; }
    audio.current = new Audio(t.url);
    audio.current.onended = () => setPlaying("");
    void audio.current.play();
    setPlaying(t.url);
  };
  return (
    <div className="tracks">
      {p.variants.map((v) => (
        <div key={v.key} className={`track-card${v.key === chosen ? " on" : ""}`}>
          <button type="button" className="vlabel" aria-pressed={v.key === chosen} onClick={() => onPick(v.key)}><b>{v.key}</b><span>{v.label}</span></button>
          {(tracks[v.key] ?? []).map((t) => (
            <div key={t.id} className="tline">
              <button type="button" className="playbtn" aria-label={`${playing === t.url ? "Stop" : "Play"} ${t.asset}`} onClick={() => play(t)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={playing === t.url ? "M6 5h12v14H6z" : "M7 5v14l12-7z"} /></svg>
              </button>
              <span className="snd"><Wave url={t.url} label={t.asset} /></span>
            </div>
          ))}
          {tracks[v.key] && tracks[v.key]!.length === 0 && <p className="note">NO NEW SOUND FILE: IT CHANGES THE LEVELS OR REMOVES SOUNDS.</p>}
          {!tracks[v.key] && <p className="note">LOADING THE SOUNDS…</p>}
        </div>
      ))}
    </div>
  );
}
