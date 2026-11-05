import { useEffect, useState } from "react";
import { peaks } from "./lanes";

// Waveforms of the sounds, decoded once per file.
const waves = new Map<string, Promise<number[]>>();
export function useWave(url: string | undefined): number[] {
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

export function Wave({ url, label }: { url?: string; label: string }) {
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

