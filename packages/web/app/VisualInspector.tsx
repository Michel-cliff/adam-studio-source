import { useEffect, useState } from "react";
import type { RenderProps } from "@adam-studio/render/src/props";
import { api } from "./api";
import { t } from "./i18n";
type Raw = Record<string, any>;
type Selection = { kind: "clip" | "element" | "caption"; id: string } | null;
type Edit = (body: Raw) => Promise<boolean>;
const clone = (v: any) => JSON.parse(JSON.stringify(v));
const atCaption = (id: string) => Number(id.match(/^cap(\d+)/)?.[1] ?? -1);

function NumberField({ label, value, set, min = 0, max = 100, step = 1 }: { label: string; value: number; set: (n: number) => void; min?: number; max?: number; step?: number }) {
  const number = Number.isFinite(value) ? value : 0;
  const change = (n: number) => { if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n))); };
  const slider = max > min && max - min <= 10000;
  return <div className={`vi-field vi-number${slider ? " has-slider" : ""}`}>
    <span>{t(label)}</span>
    <div className="vi-number-controls">
      {slider && <input className="vi-range" type="range" aria-label={t(label)} min={min} max={max} step={step} value={Math.min(max, Math.max(min, number))} onChange={e => change(e.currentTarget.valueAsNumber)} />}
      <input className="vi-number-input" type="number" aria-label={`${t(label)} · ${t("Exact value")}`} value={number} min={min} max={max} step={step} onChange={e => change(e.currentTarget.valueAsNumber)} />
    </div>
  </div>;
}
function Choice({ label, value, choices, set }: { label: string; value: string; choices: string[]; set: (s: string) => void }) {
  return <label className="vi-field"><span>{t(label)}</span><select aria-label={t(label)} value={value} onChange={e => set(e.target.value)}>{choices.map(c => <option key={c} value={c}>{t(c)}</option>)}</select></label>;
}
function Colour({ label, value, set }: { label: string; value: string; set: (s: string) => void }) {
  return <label className="vi-field"><span>{t(label)}</span><span className="vi-colour"><input type="color" aria-label={t(label)} value={/^#[a-f\d]{6}$/i.test(value) ? value : "#FFFFFF"} onChange={e => set(e.target.value)} /><code>{value}</code></span></label>;
}

/** Visual fields use the same validated, backed-up writes as JSON editing. No unsupported controls. */
export function VisualInspector({ raw, props, selected, edit }: { raw: Raw; props: RenderProps; selected: Selection; edit: Edit }) {
  const [tab, setTab] = useState<"item" | "project">("item");
  const [draft, setDraft] = useState<Raw | null>(null);
  const [style, setStyle] = useState<Raw>({});
  const [dirty, setDirty] = useState(false);
  const [manualPosition, setManualPosition] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fonts, setFonts] = useState<{ family: string; file: string }[]>([]);
  const [fontError, setFontError] = useState("");
  const [phase, setPhase] = useState(0);
  const [json, setJson] = useState("");
  const where = selected ? ({ clip: "story", element: "elements", caption: "captions" } as const)[selected.kind] : "";
  const index = !selected ? -1 : selected.kind === "caption" ? atCaption(selected.id) : (raw[where] ?? []).findIndex((e: Raw) => e.id === selected.id);
  const item = index < 0 ? null : raw[where]?.[index];
  const tl = props.timeline;
  const placed = selected?.kind === "clip" ? tl.clips.find(c => c.id === selected.id) : selected?.kind === "element" ? tl.elements.find(e => e.id === selected.id) : tl.captions.find(c => c.id === selected?.id);
  useEffect(() => { setDraft(item ? clone(item) : null); setJson(JSON.stringify(item, null, 2)); setStyle({}); setDirty(false); setManualPosition(false); setPhase(0); if (selected) setTab("item"); }, [selected?.id, selected?.kind, JSON.stringify(item)]);
  useEffect(() => { void api<{ fonts: { family: string; file: string }[] }>("/editor/fonts").then(r => setFonts(r.fonts), () => {}); }, []);
  const change = (key: string, value: unknown) => { setDraft(d => d ? { ...d, [key]: value } : d); setDirty(true); };
  const prop = (key: string, value: unknown) => { setDraft(d => d ? { ...d, props: { ...d.props, [key]: value } } : d); setDirty(true); };
  const styleValue = (group: string, key: string) => style[group]?.[key] ?? (tl.style as Raw)[group]?.[key];
  const styleSet = (group: string, key: string, value: unknown) => { setStyle(s => ({ ...s, [group]: { ...s[group], [key]: value } })); setDirty(true); };
  const save = async () => {
    setSaving(true);
    try { if (await edit({ op: "inspect", kind: tab === "project" ? "style" : selected?.kind, id: selected?.id, index, value: draft, style: { ...style, ...(manualPosition ? { textLayout: "free" } : {}) } })) { setStyle({}); setDirty(false); setManualPosition(false); } } finally { setSaving(false); }
  };
  const copy = async () => {
    if (!draft || !selected) return;
    if (selected.kind === "caption") await edit({ op: "set_value", pointer: "/captions/-", value: draft });
    else { const value = { ...draft, id: `${draft.id}.copy.${crypto.randomUUID().slice(0, 8)}` }; await edit(selected.kind === "element" ? { op: "patch", patch: { addElements: [value] } } : { op: "set_value", pointer: "/story/-", value }); }
  };
  const remove = async () => { if (item && !(selected?.kind === "clip" && raw.story.length === 1)) await edit({ op: "set_value", pointer: `/${where}/${index}`, remove: true }); };
  const d = draft ?? {}, p = d.props ?? {};
  const uploadFont = async (file?: File) => {
    if (!file) return;
    try { const r = await fetch(`/api/editor/fonts?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file }); const data = await r.json(); if (!r.ok) throw Error(data.error); setFonts(data.fonts); setFontError(""); } catch (e) { setFontError((e as Error).message); }
  };
  return <aside className="visual-inspector" aria-label={t("Inspector")}>
    <div className="vi-tabs" role="tablist" aria-label={t("Inspector")}>{(["item", "project"] as const).map(v => <button key={v} role="tab" aria-selected={tab === v} onClick={() => { if (dirty && !confirm(t("Discard the changes you have not applied?"))) return; setTab(v); setDraft(item ? clone(item) : null); setStyle({}); setDirty(false); setManualPosition(false); }}>{t(v === "item" ? "Selection" : "Project style")}</button>)}</div>
    <div className="vi-scroll">
      {tab === "project" ? <>
        <h2>{t("Project style")}</h2><p className="note">{t("These settings apply to this video only.")}</p>
        <details open><summary>{t("Typography and captions")}</summary>
          {(["title", "caption"] as const).map(role => { const current = style.fonts?.[role] ?? tl.style.fonts[role]; const options = [...fonts]; if (!options.some(f => f.file === current.file)) options.push(current); return <label className="vi-field" key={role}><span>{t(role === "title" ? "Title font" : "Caption font")}</span><select value={current.file} onChange={e => { const font = options.find(f => f.file === e.target.value); if (font) styleSet("fonts", role, font); }}>{options.map(f => <option key={f.file} value={f.file}>{f.family}</option>)}</select></label>; })}
          <label className="act small">{t("Import a font")}<input type="file" accept=".ttf,.otf" hidden onChange={e => void uploadFont(e.target.files?.[0])} /></label>{fontError && <p className="error">{fontError}</p>}
          <NumberField label="Caption size (px)" value={Math.round(styleValue("caption", "size") * tl.width)} min={20} max={120} set={v => styleSet("caption", "size", v / tl.width)} />
          <Choice label="Highlight" value={styleValue("caption", "highlightAs")} choices={["color", "block"]} set={v => styleSet("caption", "highlightAs", v)} />
          <Choice label="Text placement" value={style.textLayout ?? tl.style.textLayout ?? (tl.style.name === "Default" ? "thirds" : "free")} choices={["thirds", "free"]} set={v => { setStyle(s => ({ ...s, textLayout: v })); setDirty(true); }} />
        </details>
        <details open><summary>{t("Colours")}</summary>{["text", "highlight", "accent", "ink"].map(c => <Colour key={c} label={c} value={styleValue("colors", c)} set={v => styleSet("colors", c, v)} />)}</details>
        <details><summary>{t("Image adjustments")}</summary>{["brightness", "contrast", "saturation", "warmth", "vignette"].map(k => <NumberField key={k} label={k} value={Math.round(styleValue("grade", k) * 100)} min={k === "vignette" ? 0 : -100} max={100} set={v => styleSet("grade", k, v / 100)} />)}</details>
        <details><summary>{t("Motion and blur")}</summary><NumberField label="Animation speed" value={styleValue("motion", "speed")} min={0.25} max={3} step={0.05} set={v => styleSet("motion", "speed", v)} /><NumberField label="Zoom blur" value={styleValue("fx", "zoomBlur")} min={0} max={40} set={v => styleSet("fx", "zoomBlur", v)} /><NumberField label="Camera drift (%)" value={(styleValue("motion", "push") ?? 0.012) * 100} min={0} max={3} step={0.1} set={v => styleSet("motion", "push", v / 100)} /></details>
      </> : !item || !draft ? <div className="vi-empty"><h2>{t("Make it yours")}</h2><p>{t("Select a clip, text or sound on the timeline to adjust it here.")}</p><p className="note">{t("Use Project style for fonts, colours, captions and image adjustments.")}</p></div> : <>
        <h2>{String(d.id ?? t("Caption"))}</h2><p className="mono dim">{d.kind ?? selected?.kind}{placed ? ` · ${(placed.durationFrames / tl.fps).toFixed(2)} s` : ""}</p>
        {selected?.kind === "clip" ? <>
          <details open><summary>{t("Clip and audio")}</summary><NumberField label="In (s)" value={d.inMs / 1000} min={0} max={d.outMs / 1000 - 0.04} step={0.01} set={v => change("inMs", Math.round(v * 1000))} /><NumberField label="Out (s)" value={d.outMs / 1000} min={d.inMs / 1000 + 0.04} max={Number(raw.assets.find((a: Raw) => a.id === d.asset)?.meta?.durationMs ?? 3600000) / 1000} step={0.01} set={v => change("outMs", Math.round(v * 1000))} /><NumberField label="Volume (%)" value={(d.volume ?? 1) * 100} max={200} set={v => change("volume", v / 100)} /><Choice label="Framing" value={d.framing?.mode ?? "cover"} choices={["cover", "fit"]} set={v => change("framing", v === "fit" ? { mode: "fit", background: "blur" } : { mode: "cover" })} /><Choice label="Transition to next clip" value={d.transitionOut?.kind ?? "cut"} choices={["cut", "zoom", "crossfade", "subjectSlide"]} set={v => change("transitionOut", v === "cut" ? { kind: "cut" } : { kind: v, durationMs: 400 })} />{d.transitionOut?.kind && d.transitionOut.kind !== "cut" && <NumberField label="Transition duration (ms)" value={d.transitionOut?.durationMs ?? 400} min={0} max={2000} step={50} set={v => { if (d.transitionOut?.kind && d.transitionOut.kind !== "cut") change("transitionOut", { ...d.transitionOut, durationMs: v }); }} />}<NumberField label="Zoom" value={d.zoom?.base ?? 1} min={1} max={4} step={0.01} set={v => change("zoom", { ...d.zoom, base: v })} /></details>
        </> : selected?.kind === "caption" ? <>
          <label className="vi-field vertical"><span>{t("Text")}</span><textarea value={d.text} rows={3} onChange={e => change("text", e.target.value)} /></label>
          <label className="vi-field vertical"><span>{t("Highlighted words")}</span><input value={(d.highlight ?? []).join(", ")} onChange={e => change("highlight", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} /></label>
        </> : <>
          <details open><summary>{t("Timing")}</summary><NumberField label="Duration (s)" value={(d.durationMs ?? (placed ? placed.durationFrames / tl.fps * 1000 : 1000)) / 1000} min={0.1} max={3600} step={0.1} set={v => { const value: Raw = { ...d, durationMs: Math.round(v * 1000) }; delete value.untilEnd; delete value.untilWord; setDraft(value); setDirty(true); }} /><NumberField label="Start (s)" value={d.anchor?.atMs !== undefined ? d.anchor.atMs / 1000 : (placed?.fromFrame ?? 0) / tl.fps} min={0} max={tl.durationFrames / tl.fps} step={0.1} set={v => change("anchor", { atMs: Math.round(v * 1000) })} /></details>
          {d.kind === "title" ? <details open><summary>{t("Title")}</summary>{p.phases?.length > 1 && <select aria-label={t("Phase")} value={phase} onChange={e => setPhase(Number(e.target.value))}>{p.phases.map((_: unknown, i: number) => <option key={i} value={i}>{t("Phase")} {i + 1}</option>)}</select>}<textarea aria-label={t("Title lines")} rows={3} value={(p.phases?.[phase]?.lines ?? []).map((l: Raw) => l.text).join("\n")} onChange={e => { const phases = clone(p.phases); phases[phase].lines = e.target.value.split("\n").map((text: string, i: number) => ({ ...phases[phase].lines[i], text })); prop("phases", phases); }} /><label className="vi-field vertical"><span>{t("Italic connector")}</span><input value={p.connector ?? ""} maxLength={50} onChange={e => prop("connector", e.target.value)} /></label><label className="vi-field vertical"><span>{t("Kicker")}</span><input value={p.kicker ?? ""} onChange={e => prop("kicker", e.target.value)} /></label></details> : typeof p.text === "string" ? <label className="vi-field vertical"><span>{t("Text")}</span><textarea rows={3} value={p.text} onChange={e => prop("text", e.target.value)} /></label> : null}
          {["label", "prefix", "suffix"].filter(k => k in p || d.kind === "hud.stat").map(k => <label key={k} className="vi-field"><span>{t(k)}</span><input value={p[k] ?? ""} onChange={e => prop(k, e.target.value)} /></label>)}
          {d.kind === "camera.zoom" && <><NumberField label="Zoom" value={p.scale ?? 1.08} min={1} max={4} step={0.01} set={v => prop("scale", v)} /><NumberField label="Ease (ms)" value={p.easeMs ?? 400} min={0} max={3000} step={50} set={v => prop("easeMs", v)} /></>}
          {d.kind === "camera.window" && <><NumberField label="Width (%)" value={(p.width ?? 0.8) * 100} min={30} max={100} set={v => prop("width", v / 100)} /><Choice label="Background" value={p.backdrop ?? "blur"} choices={["blur", "color"]} set={v => prop("backdrop", v)} /><Colour label="Background colour" value={p.color ?? "#F4F2ED"} set={v => prop("color", v)} /></>}
          {["value", "from", "decimals", "countMs"].filter(k => k in p && d.kind === "hud.stat").map(k => <NumberField key={k} label={k} value={p[k]} min={k === "from" || k === "value" ? -100000000 : 0} max={k === "decimals" ? 4 : 100000000} step={1} set={v => prop(k, v)} />)}
          {["image", "lottie", "sfx"].includes(d.kind) && <label className="vi-field"><span>{t("Asset")}</span><select value={p.asset} onChange={e => prop("asset", e.target.value)}>{raw.assets.filter((a: Raw) => d.kind === "sfx" ? a.kind === "audio" : d.kind === "lottie" ? a.kind === "lottie" : a.kind === "image" || a.kind === "video").map((a: Raw) => <option key={a.id} value={a.id}>{a.id}</option>)}</select></label>}
          {d.kind === "image" && <><Choice label="Framing" value={p.fit ?? "contain"} choices={["contain", "cover", "full"]} set={v => prop("fit", v)} /><NumberField label="Width (%)" value={(p.width ?? 0.7) * 100} min={3} max={100} set={v => prop("width", v / 100)} /><Choice label="Entrance" value={p.intro ?? "none"} choices={["none", "fade", "softZoom", "pop"]} set={v => prop("intro", v)} /><Choice label="Exit" value={p.outro ?? "none"} choices={["none", "fade", "softZoom"]} set={v => prop("outro", v)} /></>}
          {d.kind === "sfx" && <><NumberField label="Volume (%)" value={(p.volume ?? 1) * 100} max={200} set={v => prop("volume", v / 100)} />{["fadeInMs", "fadeOutMs"].map(k => <NumberField key={k} label={k} value={p[k] ?? 0} max={10000} step={50} set={v => prop(k, v)} />)}</>}
          {d.kind === "lottie" && <><NumberField label="Playback rate" value={p.playbackRate ?? 1} min={0.1} max={4} step={0.1} set={v => prop("playbackRate", v)} /><label><input type="checkbox" checked={p.loop ?? false} onChange={e => prop("loop", e.target.checked)} /> {t("Loop")}</label></>}
          {!d.kind.startsWith("camera.") && d.kind !== "sfx" && <details open><summary>{t("Transform")}</summary><Choice label="Layer" value={d.layer ?? "front"} choices={["front", "behind-subject"]} set={v => change("layer", v)} />{["x", "y"].map(k => <NumberField key={k} label={k === "x" ? "Horizontal (%)" : "Vertical (%)"} value={Math.round((d.position?.[k] ?? (placed as any)?.[k] ?? 0.5) * 100)} min={0} max={100} set={v => { change("position", { x: d.position?.x ?? (placed as any)?.x ?? 0.5, y: d.position?.y ?? (placed as any)?.y ?? 0.5, [k]: v / 100 }); setManualPosition(true); }} />)}<NumberField label="Scale (%)" value={(d.scale ?? 1) * 100} min={10} max={400} set={v => { change("scale", v / 100); setManualPosition(true); }} /><NumberField label="Rotation (°)" value={d.rotation ?? 0} min={-180} max={180} set={v => { change("rotation", v); setManualPosition(true); }} /><NumberField label="Opacity (%)" value={(d.opacity ?? 1) * 100} min={0} max={100} set={v => change("opacity", v / 100)} /><p className="note">{t("Manual positioning switches this video to free text placement.")}</p></details>}
        </>}
        <div className="vi-actions"><button className="act" onClick={() => void copy()}>{t("Duplicate")}</button><button className="act danger" disabled={selected?.kind === "clip" && raw.story.length === 1} onClick={() => void remove()}>{t("DELETE")}</button></div>
        <details className="json-box"><summary>{t("Advanced JSON")}</summary><textarea className="json" value={json} onChange={e => setJson(e.target.value)} spellCheck={false} /><button className="act" onClick={() => { try { setDraft(JSON.parse(json)); setDirty(true); } catch { setFontError(t("Invalid JSON")); } }}>{t("Load fields")}</button></details>
      </>}
    </div>
    <div className="vi-save"><button className="act fill" disabled={!dirty || saving} onClick={() => void save()}>{t(saving ? "Saving…" : "Apply changes")}</button><button className="link" onClick={() => void edit({ op: "undo" })}>{t("UNDO")}</button></div>
  </aside>;
}
