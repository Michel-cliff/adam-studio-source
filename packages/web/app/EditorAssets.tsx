import { useState } from "react";
import type { RenderProps } from "@adam-studio/render/src/props";
import { enc } from "./api";
import { t } from "./i18n";
type Raw = Record<string, any>;
export function EditorAssets({ name, raw, props, frame, edit, select, reload }: { name: string; raw: Raw; props: RenderProps; frame: number; edit: (b: Raw) => Promise<boolean>; select: (s: { kind: "element" | "clip"; id: string }) => void; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const ms = Math.round(frame / props.timeline.fps * 1000);
  const durationMs = Math.max(100, Math.min(2400, (props.timeline.durationFrames - frame) / props.timeline.fps * 1000));
  const add = async (kind: string, p: Raw, extra: Raw = {}) => {
    const id = `${kind}.${crypto.randomUUID().slice(0, 8)}`;
    if (await edit({ op: "patch", patch: { addElements: [{ id, kind, anchor: { atMs: ms }, durationMs: Math.round(durationMs), props: p, ...extra }] } })) select({ kind: "element", id });
  };
  const useAsset = async (a: Raw, asClip = false) => {
    if (asClip) {
      const id = `clip.${crypto.randomUUID().slice(0, 8)}`;
      if (await edit({ op: "set_value", pointer: "/story/-", value: { id, asset: a.id, inMs: 0, outMs: a.meta?.durationMs ?? 3000 } })) select({ kind: "clip", id });
    } else await add(a.kind === "audio" ? "sfx" : a.kind === "lottie" ? "lottie" : "image", { asset: a.id, ...(a.kind === "image" || a.kind === "video" ? { fit: "contain", width: 0.7, intro: "softZoom", outro: "fade" } : {}) });
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError("");
    try { for (const f of files) { const r = await fetch(`/api/library/upload?project=${enc(name)}&name=${enc(f.name)}`, { method: "POST", body: f }); const b = await r.json(); if (!r.ok) throw Error(b.error); } await reload(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const presets: [string, string, Raw][] = [
    ["Title", "title", { phases: [{ startMs: 0, endMs: Math.round(durationMs), lines: [{ text: t("Your title") }] }] }],
    ["Large text", "text.stack", { text: t("Your message"), atoms: 0 }],
    ["Text card", "card", { archetype: "statement", text: t("Your message") }],
    ["Counter", "hud.stat", { label: t("Your number"), value: 100, from: 0 }],
    ["Information panel", "hud.panel", { title: t("Your title"), lines: [t("Your message")], typing: false }],
    ["Smooth zoom", "camera.zoom", { scale: 1.12, easeMs: 450 }],
    ["Video window", "camera.window", { chrome: "plain", backdrop: "blur", width: 0.8 }],
  ];
  return <div className="editor-assets">
    <p className="note">{t("New elements start at the playhead.")}</p>
    <div className="preset-grid">{presets.map(([label, kind, p]) => <button className="preset" key={kind} onClick={() => void add(kind, p)}><span aria-hidden="true">{kind === "title" ? "T" : kind === "camera.zoom" ? "⊕" : kind === "hud.stat" ? "123" : "▤"}</span>{t(label)}</button>)}</div>
    <div className="row-between"><h3>{t("Project media")}</h3><label className={`act small${busy ? " dim" : ""}`}>{t(busy ? "Importing…" : "Import")}<input disabled={busy} type="file" hidden multiple accept="video/*,image/*,audio/*,.json" onChange={e => void upload(e.target.files)} /></label></div>
    {error && <p className="error">{error}</p>}
    <div className="asset-list">{raw.assets.map((a: Raw) => <div className="asset-tile" key={a.id}>
      {a.kind === "image" ? <img src={props.media[a.id]?.file} alt="" /> : <span className="asset-kind" aria-hidden="true">{a.kind === "video" ? "▶" : a.kind === "audio" ? "♫" : "◇"}</span>}
      <div><b title={a.id}>{a.id}</b><small>{a.kind}</small><div className="row"><button className="link" onClick={() => void useAsset(a)}>{t("Insert")}</button>{a.kind === "video" && <button className="link" onClick={() => void useAsset(a, true)}>{t("Add clip")}</button>}</div></div>
    </div>)}</div>
  </div>;
}
