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
    { title: "Welcome to Adam", text: "Turn your takes into a video with your own visual identity. This short tour shows you where everything lives. You can replay it with Guide.", route: "#/", target: ".topnav", hint: "Your work stays under your control." },
    { title: "Start with your art direction", text: "Already have a style? Import 3 to 5 finished videos. Starting from scratch? Try colours, typography and motion on one of your videos. Switch art directions from Projects whenever you want.", route: "#/da", target: ".da-space", hint: "Video analysis uses the AI you selected. Nothing runs during this tour." },
    { title: "Create your first project", text: "Import your takes or start with a script. Give the project a name, then launch analysis when you are ready. Your source files stay available.", route: "#/new", target: ".new-cols, .new-form, .cols", hint: "Check the selected AI and model before starting an analysis." },
    { title: "Build your edit step by step", text: project ? "The Studio guides you through cuts, structure, captions, hook, visuals and sound. Preview the proposals and choose what fits your message. Open Timeline for manual editing." : "Once you create a project, open Studio to review cuts, structure, captions, hook, visuals and sound. Preview each proposal before choosing it.", route: project ? p : "#/", target: project ? ".subnav, .stepnav" : ".topnav a:nth-child(2)", hint: "AI tasks start only when you request them." },
    { title: "Make the timeline yours", text: "Add text, images, sounds and smooth zooms from the left panel. Select a block to adjust it on the right. Project style controls fonts, colours and captions. Zoom into the tracks, split clips and use Undo to recover a change.", route: project ? `${p}/edit` : "#/", target: project ? ".editor-workspace" : ".topnav a:nth-child(2)", hint: "Space: play or pause. Delete: remove selection. Ctrl+Z: undo." },
    { title: "Keep your resources together", text: "The Library holds your images, sounds, fonts and visual references. Import your own resources, then use them in a project or directly from its timeline.", route: "#/library", target: ".topnav a:nth-child(4)", hint: "You can organise your visual references by folder." },
    { title: "Learn from your statistics", text: "My videos follows your projects. Other videos accepts screenshots and statistics exports from videos you want to analyse. References and trends and What Adam learned help you prepare the next video.", route: "#/stats/other", target: ".subnav", hint: "Import statistics manually. Private social account analytics are not connected automatically." },
    { title: "Ready for your first video", text: "Choose your art direction, add a project and review the edit. Export from the last Studio step when it is ready. Your Guide button stays available whenever you need a reminder.", route: "#/", target: ".da-pick", hint: "Start with a short video to discover the whole workflow." },
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
    try { await api("/onboarding", { method: "PUT", body: { reason } }); dialog.current?.close(); setActive(false); location.hash = reason === "finished" ? "#/da" : route.current; previous.current?.focus(); }
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
