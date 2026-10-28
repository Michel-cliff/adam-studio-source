import { useEffect, useState } from "react";

// The interface in English or French: the words of the shell, steps and main actions.
export type Lang = "en" | "fr";
const FR: Record<string, string> = {
  PROJECTS: "PROJETS", STUDIO: "STUDIO", LIBRARY: "BIBLIOTHÈQUE", STATISTICS: "STATISTIQUES",
  Story: "Histoire", Captions: "Sous-titres", Hook: "Accroche", Visuals: "Visuels", Sound: "Son", Wrap: "Livraison",
  STEPS: "ÉTAPES", TIMELINE: "TIMELINE", STATUS: "ÉTAT", "ASK CLAUDE": "DEMANDER À CLAUDE", "DO IT": "FAIS-LE",
  "PROPOSE A / B / C": "PROPOSE A / B / C", CHOOSE: "CHOISIR", "More options": "D'autres options", "None of these": "Aucune",
  "FINE-TUNE IN THE TIMELINE": "AFFINER DANS LA TIMELINE", CONNECTORS: "CONNECTEURS", SKILLS: "SKILLS",
  "Select a variant.": "Choisis une variante.", "NEW PROJECT": "NOUVEAU PROJET", "MOVE TO TRASH": "METTRE À LA CORBEILLE",
  "OPEN IN STUDIO": "OUVRIR DANS LE STUDIO", "Select a project.": "Choisis un projet.", All: "Tous", "In progress": "En cours",
  Exported: "Exportés", "STEP DONE, NEXT": "ÉTAPE FINIE, SUIVANTE", "SKIP THIS STEP": "PASSER CETTE ÉTAPE", "RUN THE FIRST PASS": "LANCER LE PREMIER JET",
  "ADD RUSHES": "AJOUTER DES RUSHES", "Click a folder to open it.": "Clique sur un dossier pour l'ouvrir.", "SEARCH THIS FOLDER": "CHERCHER DANS CE DOSSIER",
  "DROP FILES HERE": "DÉPOSE DES FICHIERS ICI", "My videos": "Mes vidéos", "References & trends": "Références et tendances",
  "What Claude learned": "Ce que Claude a appris", EXPORT: "EXPORTER", "Nothing proposed yet for this step.": "Rien de proposé pour cette étape.",
};

let lang: Lang = (() => { try { return localStorage.getItem("adam.lang") === "fr" ? "fr" : "en"; } catch { return "en"; } })();
const subs = new Set<() => void>();
export const t = (s: string) => (lang === "fr" ? FR[s] ?? s : s);
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem("adam.lang", l); } catch { /* private mode */ }
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}
/** Re-renders the caller when the language changes. */
export function useLang(): Lang {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return lang;
}
