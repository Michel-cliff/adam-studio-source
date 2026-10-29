// The guided art direction path: the creator's six steps, each with what Adam derived and why, and the options to try
// on their own video. The don'ts are written to the rules Adam already learns.
import { resolve } from "@adam-studio/model";
import { analysisPython } from "@adam-studio/render/src/analysis";
import { takeHues } from "@adam-studio/render/src/lib/accent";
import { accentHex } from "@adam-studio/render/src/lib/color";
import { CHOICES, daStatus, DA_STEPS, offerAfter, readDA, setStep, type DaStep } from "@adam-studio/render/src/lib/da";
import { addRule } from "./stats";
import { load } from "./store";

type Lang = "en" | "fr";
type Ctx = { method: string; path: string; daDir: string; lang: Lang; projectDir: (name: string) => string; send: (s: number, b: unknown) => void; body: () => Promise<Record<string, any>> };

const T = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);

/** A colour's name, from its OkLCh hue. */
export function hueName(h: number, lang: Lang): string {
  const names: [number, string, string][] = [[20, "raspberry", "framboise"], [45, "coral", "corail"], [80, "orange", "orange"], [120, "yellow", "jaune"],
    [170, "green", "vert"], [220, "turquoise", "turquoise"], [280, "blue", "bleu"], [320, "violet", "violet"], [360, "pink", "rose"]];
  const n = names.find(([top]) => h < top) ?? names[names.length - 1]!;
  return lang === "fr" ? n[2] : n[1];
}

const LABELS: Record<Exclude<DaStep, "accent" | "donts">, Record<string, [string, string]>> = {
  captions: { bold: ["Bold: 3 words, bigger", "Marqués : 3 mots, plus grands"], clean: ["Clean: 5 words, two lines", "Nets : 5 mots, deux lignes"], minimal: ["Minimal: smaller, no coloured word", "Discrets : plus petits, sans mot en couleur"] },
  rhythm: { calm: ["Calm: pauses over 0.9 s kept at 0.4 s", "Posé : pauses de plus de 0,9 s ramenées à 0,4 s"], standard: ["Standard: over 0.6 s kept at 0.25 s", "Standard : plus de 0,6 s ramenées à 0,25 s"], tight: ["Tight: over 0.4 s kept at 0.15 s", "Serré : plus de 0,4 s ramenées à 0,15 s"] },
  motion: { none: ["None: still shots", "Aucun : plans fixes"], light: ["Light: 0.6 % a second", "Léger : 0,6 % par seconde"], default: ["The default: 1.2 % a second", "Le défaut : 1,2 % par seconde"] },
  typography: { anton: ["Anton titles, Manrope captions", "Titres Anton, sous-titres Manrope"], serif: ["DM Serif titles, Manrope captions", "Titres DM Serif, sous-titres Manrope"], manrope: ["Manrope everywhere", "Manrope partout"] },
};

/** What Adam derived for a step, said before it asks. */
function say(step: DaStep, lang: Lang, hue: number | null): string {
  switch (step) {
    case "accent": return hue === null
      ? T(lang, "No colour comes back in your set: I picked one that stays the same for this video.", "Aucune couleur ne revient dans ton décor : j'en ai pris une qui reste la même pour cette vidéo.")
      : T(lang, `I picked this ${hueName(hue, lang)} because it comes back most in your set.`, `J'ai pris ce ${hueName(hue, lang)} parce qu'il revient le plus dans ton décor.`);
    case "captions": return T(lang, "Your captions: 5 words at most, two lines, the word being said in your accent.", "Tes sous-titres : 5 mots au plus, deux lignes, le mot dit passe en couleur d'accent.");
    case "rhythm": return T(lang, "I keep your breaths under 0.6 s and bring longer pauses down to 0.25 s, never to zero.", "Je garde tes respirations de moins de 0,6 s et ramène les pauses plus longues à 0,25 s, jamais à zéro.");
    case "motion": return T(lang, "Each shot moves 1.2 % a second, one in, the next out: the eye does not see it, but it does not drop off.", "Chaque plan bouge de 1,2 % par seconde, l'un pousse, le suivant revient : l'œil ne le voit pas, mais il ne décroche pas.");
    case "typography": return T(lang, "Your titles and captions use the fonts of your style. Here are three pairs on your video.", "Tes titres et sous-titres sont dans les polices de ton style. Voici trois paires sur ta vidéo.");
    case "donts": return T(lang, "Now that you have seen your video: what do you never want to see? One per line.", "Maintenant que tu as vu ta vidéo : qu'est-ce que tu ne veux jamais voir ? Un par ligne.");
  }
}

export async function daRoute(c: Ctx): Promise<boolean> {
  const { method, path, daDir, lang, send } = c;
  let m: RegExpMatchArray | null;
  if (path === "/api/da" && method === "GET") {
    const da = readDA(daDir);
    send(200, { da, status: daStatus(da) });
    return true;
  }
  if ((m = path.match(/^\/api\/da\/(\w+)$/)) && method === "PUT" && (DA_STEPS as readonly string[]).includes(m[1]!)) {
    const step = m[1] as DaStep;
    const b = await c.body();
    if (step === "donts") {
      const lines = String(b.text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const text of lines) addRule(daDir, { topic: "donts", text, source: "YOUR ART DIRECTION" });
      setStep(daDir, "donts", lines.length ? true : null);
    } else {
      try { setStep(daDir, step, b.value ?? null); } catch (e) { send(400, { error: (e as Error).message }); return true; }
    }
    const da = readDA(daDir);
    send(200, { da, status: daStatus(da) });
    return true;
  }
  if (path === "/api/da/offer" && method === "POST") {
    send(200, { offer: offerAfter(daDir, String((await c.body()).project ?? "")) });
    return true;
  }
  // A step's options on a project: what Adam derived, why, and up to three choices to try on the creator's video.
  if ((m = path.match(/^\/api\/projects\/([^/]+)\/da\/(\w+)$/)) && method === "GET" && (DA_STEPS as readonly string[]).includes(m[2]!)) {
    const step = m[2] as DaStep;
    const da = readDA(daDir);
    let hue: number | null = null;
    let options: { key: string; label: string; value: string }[] = [];
    if (step === "accent") {
      const dir = c.projectDir(decodeURIComponent(m[1]!));
      const { project, style } = load(dir);
      const found = takeHues(dir, resolve(project, style), project, analysisPython, true);
      hue = found?.hue ?? null;
      options = (found?.hues ?? []).slice(0, 3).map((h, i) => ({ key: "ABC"[i]!, label: hueName(h, lang), value: accentHex(h, "ink") }));
    } else if (step !== "donts") {
      options = CHOICES[step].map((v, i) => ({ key: "ABC"[i]!, label: LABELS[step][v]![lang === "fr" ? 1 : 0], value: v }));
    }
    send(200, { step, say: say(step, lang, hue), options, current: da[step] ?? null });
    return true;
  }
  return false;
}
