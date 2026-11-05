import { Thumbnail } from "@remotion/player";
import { Edit } from "@adam-studio/render/edit";
import type { RenderProps } from "@adam-studio/render/src/props";
import { useEffect, useState } from "react";
import { api, enc } from "./api";
import { keyFrame } from "./frames";
import { Halftone } from "./halftone";

// Preview props per URL, shared by the cards of a step: the base edit is fetched once, each variant once.
const cache = new Map<string, Promise<RenderProps>>();
export function props(url: string, stamp: string): Promise<RenderProps> {
  const key = `${url}#${stamp}`;
  // A failed fetch is not kept: the next try asks again.
  if (!cache.has(key)) {
    if (cache.size >= 48) cache.delete(cache.keys().next().value!);
    cache.set(key, api<RenderProps>(url).catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key)!;
}

/** The variant as one concrete screenshot: the edit with the variant applied, at what it changes, drawn in the browser. */
/** decided: the proposal already has a choice, so its variants are compared with the edit without it. */
export function VariantShot({ name, proposal, variant, stamp, step, decided }: { name: string; proposal: string; variant: string; stamp: string; step?: string; decided?: boolean }) {
  const [v, setV] = useState<RenderProps | null>(null);
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState("");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    const base = `/projects/${enc(name)}/preview`;
    Promise.all([props(`${base}?proposal=${enc(proposal)}&variant=${variant}`, stamp), props(decided ? `${base}?without=${enc(proposal)}` : base, stamp)])
      .then(([p, b]) => { if (alive) { setV(p); setFrame(keyFrame(p.timeline, b.timeline, step)); } })
      .catch((e) => { console.error(`variant ${variant} preview`, e); if (alive) setFailed((e as Error).message || "the preview could not load"); });
    return () => { alive = false; };
  }, [name, proposal, variant, stamp, tries, decided, step]);
  // Never an empty card: say why, and let the creator try again.
  if (failed) return (
    <div className="shot failed" role="alert" onClick={(e) => { e.stopPropagation(); setFailed(""); setTries((n) => n + 1); }}>
      <span className="mono">PREVIEW FAILED</span><span>{failed}</span><span className="link">Try again</span>
    </div>
  );
  const t = v?.timeline;
  return (
    <div className="shot" aria-hidden="true" style={t ? { aspectRatio: `${t.width} / ${t.height}` } : undefined}>
      {t && v ? (
        <Thumbnail component={Edit} inputProps={v} compositionWidth={t.width} compositionHeight={t.height}
          frameToDisplay={frame} durationInFrames={Math.max(1, t.durationFrames)} fps={t.fps} style={{ width: "100%", height: "100%" }} />
      ) : <Halftone fx="ripple" step={7} className="loading" />}
      {(v as (RenderProps & { note?: string }) | null)?.note && <span className="shotnote mono" title={(v as RenderProps & { note: string }).note}>SHOWN IN FRONT · CUT-OUT NOT MADE</span>}
    </div>
  );
}
