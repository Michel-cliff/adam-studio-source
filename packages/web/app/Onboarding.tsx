import { useEffect, useRef, useState } from "react";
import { api, enc } from "./api";
import { t, useLang } from "./i18n";

/** A guided tour only navigates. It never uploads, runs AI or changes a project. */
export function Onboarding() {
  useLang();
  const [active, setActive] = useState(false), [step, setStep] = useState(0), [project, setProject] = useState("");
  const [rect, setRect] = useState<DOMRect | null>(null), [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), previous = useRef<HTMLElement | null>(null), route = useRef("#/");
  const begin = async () => {
    route.current = location.hash || "#/"; previous.current = document.activeElement as HTMLElement;
    try { const p = await api<{ name: string; ok: boolean }[]>("/projects"); setProject(p.find(v => v.ok)?.name ?? ""); } catch { setProject(""); }
    setStep(0); setError(""); setActive(true);
  };
  useEffect(() => {
    let alive = true;
    void api<{ completed: boolean }>("/onboarding").then(s => { if (!s.completed && alive) void begin(); }, () => {});
    const on = () => void begin(); addEventListener("adam:tour", on);
    return () => { alive = false; removeEventListener("adam:tour", on); };
  }, []);
  const p = `#/p/${enc(project)}`;
  const steps = [
    { title: "Welcome to Adam", text: "Bring a video you have already cut. Adam adds the captions, a hook, visuals and sound, then exports it. He never cuts or reorders your video, and every choice stays yours.", route: "#/", target: ".topnav", hint: "You can replay this tour with Guide." },
    { title: "Start with your video", text: "Drop your video, check its name, press Create. The analysis runs in the background, so you can leave the page and come back.", route: "#/new", target: ".new-cols", hint: "Nothing starts during this tour." },
    { title: "Let Adam finish, or choose yourself", text: "LET ADAM FINISH runs every step and exports the video. Or take the steps one by one and pick among three variants. Either way, you can change any choice afterwards.", route: project ? p : "#/", target: project ? ".modebar" : ".topnav a:nth-child(2)", hint: "AI tasks start only when you ask for them." },
    { title: "The rest can wait", text: "TASKS shows what is running on your computer. Your art direction, the Library and Statistics are there when you want them, for your second video for instance.", route: "#/", target: ".tasks-trigger", hint: "Start with a short video to discover the whole workflow." },
  ];
  const current = steps[step]!;
  useEffect(() => {
    if (!active) return;
    location.hash = current.route;
    if (!dialog.current?.open) dialog.current?.showModal();
    const measure = () => {
      const e = document.querySelector(current.target);
      setRect(e instanceof HTMLElement ? e.getBoundingClientRect() : null);
    };
    measure(); const timer = setInterval(measure, 250);
    dialog.current?.querySelector<HTMLButtonElement>(".tour-next")?.focus();
    return () => clearInterval(timer);
  }, [active, step, project]);
  const finish = async (reason: "finished" | "skipped") => {
    try { await api("/onboarding", { method: "PUT", body: { reason } }); dialog.current?.close(); setActive(false); location.hash = reason === "finished" ? (project ? "#/" : "#/new") : route.current; previous.current?.focus(); }
    catch (e) { setError((e as Error).message); }
  };
  if (!active) return null;
  const r = rect && rect.width && rect.height ? rect : null;
  const left = Math.max(5, rect ? rect.left - 5 : 0), top = Math.max(5, rect ? rect.top - 5 : 0);
  const right = Math.min(innerWidth - 5, rect ? rect.right + 5 : 0), bottom = Math.min(innerHeight - 5, rect ? rect.bottom + 5 : 0);
  const spot = r && right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
  return <dialog className="onboard-root" ref={dialog} aria-labelledby="tour-title" aria-describedby="tour-text" onCancel={e => { e.preventDefault(); void finish("skipped"); }}>
    {spot ? <div className="tour-spot" style={spot} /> : <div className="tour-shade" />}
    <section className="tour-card">
      <div className="tour-top"><span>{t("GETTING STARTED")} · {step + 1} / {steps.length}</span><button className="link" onClick={() => void finish("skipped")}>{t("Skip tour")}</button></div>
      <div className="tour-progress" aria-hidden="true">{steps.map((_, i) => <span className={i <= step ? "on" : ""} key={i} />)}</div>
      <h2 id="tour-title">{t(current.title)}</h2><p id="tour-text">{t(current.text)}</p><p className="tour-hint">{t(current.hint)}</p>
      {error && <p className="error">{error}</p>}
      <div className="tour-actions"><button className="act" disabled={step === 0} onClick={() => setStep(s => s - 1)}>{t("Back")}</button><button className="act fill tour-next" onClick={() => step === steps.length - 1 ? void finish("finished") : setStep(s => s + 1)}>{t(step === steps.length - 1 ? "Let's start" : "Next")}</button></div>
    </section>
  </dialog>;
}
