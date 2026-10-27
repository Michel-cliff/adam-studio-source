import { Thumbnail } from "@remotion/player";
import { Edit } from "@adam-studio/render/edit";
import type { RenderProps } from "@adam-studio/render/src/props";
import { useEffect, useState } from "react";
import { api, enc } from "./api";
import { keyFrames } from "./frames";

// Preview props per URL, shared by the cards of a step: the base edit is fetched once, each variant once.
const cache = new Map<string, Promise<RenderProps>>();
function props(url: string, stamp: string): Promise<RenderProps> {
  const key = `${url}#${stamp}`;
  if (!cache.has(key)) cache.set(key, api<RenderProps>(url));
  return cache.get(key)!;
}

/** The variant as pictures: three frames of the edit with the variant applied, drawn in the browser. */
export function VariantStrip({ name, proposal, variant, stamp }: { name: string; proposal: string; variant: string; stamp: string }) {
  const [v, setV] = useState<RenderProps | null>(null);
  const [frames, setFrames] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const base = `/projects/${enc(name)}/preview`;
    Promise.all([props(`${base}?proposal=${enc(proposal)}&variant=${variant}`, stamp), props(base, stamp)])
      .then(([p, b]) => { if (alive) { setV(p); setFrames(keyFrames(p.timeline, b.timeline)); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [name, proposal, variant, stamp]);
  if (failed) return null;
  const t = v?.timeline;
  return (
    <div className="strip" aria-hidden="true">
      {t && v ? frames.map((f, i) => (
        <div className="th" key={i} style={{ aspectRatio: `${t.width} / ${t.height}` }}>
          <Thumbnail component={Edit} inputProps={v} compositionWidth={t.width} compositionHeight={t.height}
            frameToDisplay={f} durationInFrames={Math.max(1, t.durationFrames)} fps={t.fps} style={{ width: "100%", height: "100%" }} />
        </div>
      )) : [0, 1, 2].map((i) => <div className="th loading" key={i} />)}
    </div>
  );
}
