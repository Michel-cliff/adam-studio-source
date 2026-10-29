import { Player, Thumbnail } from "@remotion/player";
import { Edit } from "@adam-studio/render/edit";
import type { RenderProps } from "@adam-studio/render/src/props";
import { useEffect, useState } from "react";
import { api, enc, go } from "./api";
import { t, useLang } from "./i18n";
import { props as cachedProps } from "./VariantShot";

type Step = "accent" | "captions" | "rhythm" | "motion" | "typography" | "donts";
const STEPS: Step[] = ["accent", "captions", "rhythm", "motion", "typography", "donts"];
const NAMES: Record<Step, string> = { accent: "Accent", captions: "Captions", rhythm: "Rhythm", motion: "Motion", typography: "Typography", donts: "Don'ts" };
type Option = { key: string; label: string; value: string };
type StepData = { say: string; options: Option[]; current: string | boolean | null };
type Status = { step: Step; set: boolean }[];

/** One option played on the creator's own video: 6 s from the first caption, looping when it is the one picked. */
function Try({ name, step, value, playing, version }: { name: string; step: Step; value: string; playing: boolean; version: number }) {
  const [p, setP] = useState<RenderProps | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setP(null);
    cachedProps(`/projects/${enc(name)}/preview?da=${enc(`${step}:${value}`)}`, `da${version}`).then((x) => { if (alive) setP(x); }, (e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [name, step, value, version]);
  if (error) return <div className="shot failed"><span className="mono">PREVIEW FAILED</span><span>{error}</span></div>;
  if (!p) return <div className="shot loading-shot" />;
  const tl = p.timeline;
  const from = Math.min(tl.captions[0]?.fromFrame ?? tl.fps, Math.max(0, tl.durationFrames - 1));
  const to = Math.min(from + 6 * tl.fps, tl.durationFrames - 1);
  const size = { compositionWidth: tl.width, compositionHeight: tl.height, durationInFrames: Math.max(1, tl.durationFrames), fps: tl.fps };
  return playing
    ? <Player component={Edit} inputProps={p} {...size} inFrame={from} outFrame={Math.max(from + 1, to)} loop autoPlay controls acknowledgeRemotionLicense style={{ width: "100%", height: "100%" }} />
    : <Thumbnail component={Edit} inputProps={p} {...size} frameToDisplay={from + Math.round(tl.fps)} style={{ width: "100%", height: "100%" }} />;
}

/**
 * The guided art direction path (default art direction): six steps after the creator has seen a video of theirs,
 * each with what Adam derived and why, three options played on their own video, saved as soon as one is chosen.
 */
export function DaPath({ name }: { name: string }) {
  useLang();
  const [status, setStatus] = useState<Status>([]);
  const [i, setI] = useState(0);
  const [data, setData] = useState<StepData | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [hex, setHex] = useState("");
  const [donts, setDonts] = useState("");
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const step = STEPS[i]!;
  const close = () => go(`#/p/${enc(name)}`);
  useEffect(() => { api<{ status: Status }>("/da").then((r) => setStatus(r.status), () => {}); }, []);
  useEffect(() => {
    let alive = true;
    setData(null); setPick(null); setHex(""); setError("");
    api<StepData>(`/projects/${enc(name)}/da/${step}`).then((d) => { if (alive) { setData(d); setPick(d.options[0]?.value ?? null); } }, (e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [name, step]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [name]);

  const next = () => (i + 1 < STEPS.length ? setI(i + 1) : close());
  // Saved at once: a creator who stops at the third step keeps the first two.
  const save = async (body: Record<string, unknown>) => {
    try {
      const r = await api<{ status: Status }>(`/da/${step}`, { method: "PUT", body });
      setStatus(r.status); setVersion((v) => v + 1); next();
    } catch (e) { setError((e as Error).message); }
  };
  const custom = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : null;
  const options: Option[] = data ? [...data.options, ...(step === "accent" && custom ? [{ key: "D", label: custom, value: custom }] : [])] : [];
  const chosen = options.find((o) => o.value === pick);

  return (
    <div className="da-veil" role="dialog" aria-modal="true" aria-label="Your art direction">
      <div className="da-box">
        <nav className="da-steps" aria-label="Steps">
          <div className="h">{t("YOUR ART DIRECTION")}</div>
          {STEPS.map((s, k) => {
            const set = status.find((x) => x.step === s)?.set;
            return (
              <button key={s} type="button" className={`row-item${k === i ? " on" : ""}`} onClick={() => setI(k)}>
                <span>{k + 1}. {t(NAMES[s])}</span><span className={`mono${set ? " ok" : " dim"}`}>{set ? t("SET BY YOU") : t("DERIVED")}</span>
              </button>
            );
          })}
          <p className="note">{t("Each step is saved as soon as you choose. Skipping keeps what Adam derived.")}</p>
        </nav>
        <section className="da-main" aria-label={NAMES[step]}>
          <div className="head"><h1>{t(NAMES[step]).toUpperCase()}</h1><span className="mono">{t("STEP")} {i + 1} / 6</span></div>
          <p className="da-say">{data?.say ?? "…"}</p>
          {error && <p className="error">{error}</p>}
          {step === "donts" ? (
            <textarea className="da-donts" aria-label="Don'ts" value={donts} onChange={(e) => setDonts(e.target.value)}
              placeholder={t("No sad music\nNo yellow text\nNever a zoom on my face")} />
          ) : (
            <div className="da-tries">
              {options.map((o) => (
                <button key={o.value} type="button" className={`da-try${o.value === pick ? " on" : ""}`} onClick={() => setPick(o.value)} aria-pressed={o.value === pick}>
                  <span className="da-shot"><Try name={name} step={step} value={o.value} playing={o.value === pick} version={version} /></span>
                  <span className="vlabel">{step === "accent" && <i className="da-swatch" style={{ background: o.value }} />}<b>{o.key}</b><span>{o.label}{data?.current === o.value ? ` · ${t("CHOSEN")}` : ""}</span></span>
                </button>
              ))}
            </div>
          )}
          <div className="da-acts">
            {step === "accent" && <input className="da-hex" aria-label="Your colour" placeholder="#5AC576" value={hex} onChange={(e) => setHex(e.target.value.trim())} />}
            {step === "donts"
              ? <button type="button" className="act fill" disabled={!donts.trim()} onClick={() => void save({ text: donts })}>{t("SAVE")}</button>
              : <button type="button" className="act fill" disabled={!chosen} onClick={() => chosen && void save({ value: chosen.value })}>{t("CHOOSE")} {chosen?.key ?? ""}</button>}
            <button type="button" className="act" onClick={next}>{t("SKIP")}</button>
            <button type="button" className="link" onClick={close}>{t("close")}</button>
          </div>
        </section>
      </div>
    </div>
  );
}
