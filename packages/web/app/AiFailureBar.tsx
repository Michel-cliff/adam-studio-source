import { useEffect, useState } from "react";
import { AI_FAILURE, go } from "./api";
import { t, useLang } from "./i18n";

/** Lights up the AI switch on the main page for a moment, so the creator sees where to go. */
export function flashAiSwitch(): void {
  document.body.classList.add("ai-switch");
  setTimeout(() => document.body.classList.remove("ai-switch"), 6000);
}

/** When the AI cannot answer: what happened, in plain words, and the way to the AI switch on the main page. */
export function AiFailureBar() {
  useLang();
  const [text, setText] = useState("");
  useEffect(() => {
    const on = (e: Event) => setText((e as CustomEvent<string>).detail);
    addEventListener(AI_FAILURE, on);
    return () => removeEventListener(AI_FAILURE, on);
  }, []);
  if (!text) return null;
  return (
    <div className="ai-failure" role="alert">
      <p>{text}</p>
      <button type="button" className="act" onClick={() => { setText(""); go("#/"); flashAiSwitch(); }}>{t("SWITCH AI")}</button>
      <button type="button" className="x" aria-label={t("Close")} onClick={() => setText("")}>×</button>
    </div>
  );
}
