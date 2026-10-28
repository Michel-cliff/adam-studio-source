// The whole page in the creator's language: every text node, placeholder, title and aria-label whose text is in the
// dictionary is translated, whatever component drew it; English comes back from the kept originals. Exact matches
// only, so the creator's own content (names, transcripts, Adam's answers) is never touched.
import { FR, PATTERNS } from "./i18n-fr";

const ATTRS = ["placeholder", "title", "aria-label"] as const;
const original = new WeakMap<Node, string>();
const originalAttr = new WeakMap<Element, Map<string, string>>();
const values = new Set(Object.values(FR));

/** The French of an English text: the dictionary, then the patterns ("ADAM ON {name}"); null when unknown. */
export function toFrench(text: string): string | null {
  const s = text.trim();
  if (!s || values.has(s)) return null;
  const hit = FR[s] ?? PATTERNS.reduce<string | null>((out, [re, fr]) => out ?? (re.test(s) ? s.replace(re, fr) : null), null);
  return hit === null ? null : text.replace(s, hit);
}

function translateNode(n: Node, fr: boolean): void {
  if (n.nodeType === Node.TEXT_NODE) {
    const was = original.get(n);
    if (!fr) { if (was !== undefined && n.nodeValue !== was) n.nodeValue = was; return; }
    const src = was !== undefined && toFrench(was) === n.nodeValue ? was : n.nodeValue ?? "";
    const out = toFrench(src);
    if (out !== null && out !== n.nodeValue) { original.set(n, src); n.nodeValue = out; }
    return;
  }
  if (!(n instanceof Element) || n.closest("[data-no-tr]")) return;
  for (const a of ATTRS) {
    const v = n.getAttribute(a);
    if (v === null) continue;
    const kept = originalAttr.get(n) ?? new Map<string, string>();
    if (!fr) { const was = kept.get(a); if (was !== undefined && v !== was) n.setAttribute(a, was); continue; }
    const out = toFrench(v);
    if (out !== null && out !== v) { kept.set(a, v); originalAttr.set(n, kept); n.setAttribute(a, out); }
  }
  for (const c of Array.from(n.childNodes)) translateNode(c, fr);
}

let observer: MutationObserver | null = null;

/** Keeps the page in French (or restores English) as React draws it. */
export function translatePage(fr: boolean): void {
  observer?.disconnect();
  translateNode(document.body, fr);
  if (!fr) { observer = null; return; }
  observer = new MutationObserver((list) => {
    observer!.disconnect();
    for (const m of list) {
      if (m.type === "characterData") translateNode(m.target, true);
      else if (m.type === "attributes") translateNode(m.target, true);
      else m.addedNodes.forEach((x) => translateNode(x, true));
    }
    observer!.observe(document.body, OPTS);
  });
  observer.observe(document.body, OPTS);
}
const OPTS: MutationObserverInit = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] };
