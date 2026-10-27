import { Thumbnail } from "@remotion/player";
import { Edit } from "@adam-studio/render/edit";
import type { RenderProps } from "@adam-studio/render/src/props";
import { useEffect, useState } from "react";
import { api, enc } from "./api";
import { keyFrame } from "./frames";

// Preview props per URL, shared by the cards of a step: the base edit is fetched once, each variant once.
const cache = new Map<string, Promise<RenderProps>>();
function props(url: string, stamp: string): Promise<RenderProps> {
  const key = `${url}#${stamp}`;
  if (!cache.has(key)) cache.set(key, api<RenderProps>(url));
  return cache.get(key)!;
}

/** The variant as one concrete screenshot: the edit with the variant applied, at what it changes, drawn in the browser. */
export function VariantShot({ name, proposal, variant, stamp }: { name: string; proposal: string; variant: string; stamp: string }) {
  const [v, setV] = useState<RenderProps | null>(null);
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const base = `/projects/${enc(name)}/preview`;
    Promise.all([props(`${base}?proposal=${enc(proposal)}&variant=${variant}`, stamp), props(base, stamp)])
      .then(([p, b]) => { if (alive) { setV(p); setFrame(keyFrame(p.timeline, b.timeline)); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [name, proposal, variant, stamp]);
  if (failed) return null;
  const t = v?.timeline;
  return (
    <div className="shot" aria-hidden="true" style={t ? { aspectRatio: `${t.width} / ${t.height}` } : undefined}>
      {t && v ? (
        <Thumbnail component={Edit} inputProps={v} compositionWidth={t.width} compositionHeight={t.height}
          frameToDisplay={frame} durationInFrames={Math.max(1, t.durationFrames)} fps={t.fps} style={{ width: "100%", height: "100%" }} />
      ) : <div className="loading" />}
    </div>
  );
}
