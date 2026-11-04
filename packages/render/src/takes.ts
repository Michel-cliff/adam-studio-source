import { existsSync } from "node:fs";
import { fontsDir } from "./lib/da";
import { join } from "node:path";
import type { ProjectInput } from "@adam-studio/model";

export type Take = {
  path: string;
  probe: { durationMs: number; width: number; height: number; hasAudio: boolean };
  transcript: { lang: string | null; words: { text: string; startMs: number; endMs: number }[] };
};

export function nextAssetIds(existing: string[], n: number): string[] {
  const max = Math.max(0, ...existing.map((id) => /^c(\d+)$/.exec(id)).filter((m) => m).map((m) => Number(m![1])));
  return Array.from({ length: n }, (_, i) => `c${String(max + i + 1).padStart(2, "0")}`);
}

/** One story clip per take: from 150 ms before the first word to 250 ms after the last, the whole take without words. */
export function takeClip(id: string, words: { startMs: number; endMs: number }[], durationMs: number) {
  if (words.length === 0) return { id, asset: id, inMs: 0, outMs: durationMs };
  return { id, asset: id, inMs: Math.max(0, words[0]!.startMs - 150), outMs: Math.min(durationMs, words[words.length - 1]!.endMs + 250) };
}

export function addTakes(project: ProjectInput, takes: Take[]): ProjectInput {
  const known = new Set((project.assets ?? []).map((a) => a.path));
  const fresh = takes.filter((t) => !known.has(t.path));
  for (const t of takes) if (known.has(t.path)) console.log(`already in the project, skipped: ${t.path}`);
  const ids = nextAssetIds((project.assets ?? []).map((a) => a.id), fresh.length);
  const words = { ...(project.transcript?.words ?? {}) };
  const assets = [...(project.assets ?? [])];
  const story = [...project.story];
  fresh.forEach((t, i) => {
    const id = ids[i]!;
    assets.push({ id, kind: "video", path: t.path, meta: { ...t.probe } });
    words[id] = t.transcript.words.map((w, n) => ({ id: `${id}.w${n}`, text: w.text, startMs: w.startMs, endMs: w.endMs }));
    story.push(takeClip(id, t.transcript.words, t.probe.durationMs));
  });
  const lang = project.transcript?.lang ?? fresh.find((t) => t.transcript.lang)?.transcript.lang ?? "fr";
  return { ...project, assets, story, transcript: { lang, words } };
}

const FONTS = ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf"];

export function findSystemFont(): string {
  const f = FONTS.find((p) => existsSync(p));
  if (!f) throw new Error(`no font found among ${FONTS.join(", ")}: pass --style with your own style.json`);
  return f;
}

export function defaultStyle(fontFile: string, houseFonts = fontsDir()) {
  const fallback = { family: "Default", file: fontFile };
  const titleFile = join(houseFonts, "Anton-Regular.ttf"), captionFile = join(houseFonts, "Manrope-Variable.ttf");
  const title = existsSync(titleFile) ? { family: "Anton", file: titleFile } : fallback;
  const caption = existsSync(captionFile) ? { family: "Manrope", file: captionFile } : fallback;
  const slots = { caption: { x: 0.5, y: 0.76 }, title: { x: 0.5, y: 0.15 }, center: { x: 0.5, y: 0.43 } };
  return {
    name: "Default",
    textLayout: "thirds" as const,
    fonts: { caption, title },
    colors: { text: "#F4F2ED", highlight: "#88B4C8", accent: "#88B4C8", ink: "#121212" },
    motion: { speed: 0.8, stable: true },
    fx: { grain: 0, scanlines: { window: 0, burst: 0, burstFrames: 3 }, zoomBlur: 8 },
    grade: { warmth: 0, contrast: 0, saturation: 0, brightness: 0, vignette: 0 },
    inserts: { bw: 0, grain: 0, bloom: 0 },
    caption: { size: 0.0445, stroke: 0.06, shadow: true, maxCharsPerLine: 32, intro: "none" },
    slots: { "9:16": slots, "16:9": { caption: { x: 0.5, y: 0.86 }, title: { x: 0.5, y: 0.22 }, center: { x: 0.5, y: 0.5 } } },
    lint: { "9:16": { minDurationMs: 0, maxDurationMs: 90000 }, "16:9": { minDurationMs: 0, maxDurationMs: 1200000 } },
  };
}
