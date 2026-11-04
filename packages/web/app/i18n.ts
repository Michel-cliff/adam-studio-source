import { useEffect, useState } from "react";
import { api } from "./api";
import { FR } from "./i18n-fr";
import { toFrench, translatePage } from "./translate";

// The interface in English or French: the words of the shell, steps and main actions.
export type Lang = "en" | "fr";

let lang: Lang = (() => { try { return localStorage.getItem("adam.lang") === "fr" ? "fr" : "en"; } catch { return "en"; } })();
const subs = new Set<() => void>();
export const t = (s: string) => (lang === "fr" ? FR[s] ?? toFrench(s) ?? s : s);
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem("adam.lang", l); } catch { /* private mode */ }
  document.documentElement.lang = l;
  subs.forEach((f) => f());
  translatePage(l === "fr");
  // The server knows it too: what Adam writes for the creator (labels, titles, captions) follows this language.
  void api("/settings", { method: "PUT", body: { lang: l } }).catch(() => {});
}
/** At start: the page in the saved language, and the server told which one it is. */
export function startLang(): void { setLang(lang); }
/** Re-renders the caller when the language changes. */
export function useLang(): Lang {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return lang;
}
