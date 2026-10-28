// A reference, watched once: the video (downloaded with yt-dlp, or the dropped file), eight frames and the captions
// if the platform has them, then the AI says what it saw, the structure and the traits worth counting across references.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { jsonIn, type AskAI } from "./ai";
import { readStats, topicOf, TOPICS, trends, updateRef, type Beat, type Ref, type Saw, type Topic } from "./stats";

const run = promisify(execFile);
const FRAMES = 8;

async function download(url: string, folder: string): Promise<{ video: string; title: string; subs: string }> {
  mkdirSync(folder, { recursive: true });
  const { stdout } = await run("yt-dlp", ["--no-playlist", "--no-progress", "-f", "mp4[height<=720]/best[height<=720]/best", "--max-filesize", "300M",
    "--write-auto-subs", "--write-subs", "--sub-langs", "fr.*,en.*", "--convert-subs", "srt", "-o", join(folder, "video.%(ext)s"),
    "--print", "after_move:title", url], { timeout: 300_000, windowsHide: true, maxBuffer: 1 << 24 });
  const files = readdirSync(folder);
  const video = files.find((f) => /^video\.(mp4|webm|mkv|mov)$/.test(f));
  if (!video) throw new Error("the video could not be downloaded from this link");
  const srt = files.find((f) => f.endsWith(".srt"));
  const subs = srt ? readFileSync(join(folder, srt), "utf8").split("\n").filter((l) => l && !/^\d+$/.test(l) && !/-->/.test(l)).join(" ") : "";
  return { video: join(folder, video), title: stdout.trim().split("\n").pop() ?? "", subs };
}

async function frames(video: string, folder: string): Promise<string[]> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", video], { windowsHide: true });
  const d = Math.max(1, Number(stdout.trim()) || 10);
  const out: string[] = [];
  for (let i = 0; i < FRAMES; i++) {
    const f = join(folder, `frame-${i}.jpg`);
    await run("ffmpeg", ["-v", "error", "-y", "-ss", ((d * (i + 0.5)) / FRAMES).toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale=360:-2", f], { windowsHide: true });
    if (existsSync(f)) out.push(f);
  }
  return out;
}

export function watchPrompt(ref: Ref, subs: string, knownTraits: string[]): string {
  return [
    "You are helping a talking-head creator learn from a reference video. The pictures are eight frames taken evenly through it, in order.",
    ref.title || ref.name ? `Its title or name: ${ref.title || ref.name}.` : "",
    subs ? `What is said (automatic captions, may be rough): ${subs.slice(0, 2500)}` : "No captions were available: judge from the frames.",
    "Answer with ONE JSON object only, in English, short plain sentences, no markdown:",
    '{"title": "a short title for this reference (max 40 chars, uppercase)",',
    ' "saw": [{"k": "HOOK|PACE|VISUALS|TEXT|SOUND|LOOK", "v": "one sentence: what it does, concretely"}] (4 to 6 lines; SOUND only if captions or frames show it),',
    ' "beats": [{"label": "1 to 3 words", "weight": relative length 1 to 4, "kind": "hook|problem|steps|twist|proof|cta|other"}] (3 to 6 beats, in order),',
    ' "traits": ["3 to 5 reusable traits, at most 8 words each"],',
    ' "lessons": [{"topic": "hook|captions|visuals|sound|look", "text": "what the creator should do in their own videos, an instruction of at most 15 words"}] (3 to 5)}',
    knownTraits.length ? `When a trait matches one of these already counted, reuse its exact wording: ${knownTraits.join(" | ")}.` : "",
  ].filter(Boolean).join("\n");
}

type Seen = { title?: string; saw?: Saw[]; beats?: Beat[]; traits?: string[]; lessons?: { topic?: string; text?: string }[] };

/** Watches one reference end to end and stores the result (or why it failed). Never throws. */
export async function watchRef(dir: string, ref: Ref, ai: AskAI): Promise<Ref> {
  const folder = join(dir, "refs", ref.id);
  try {
    let video = ref.file ?? "", subs = "", title = "";
    if (ref.url) ({ video, title, subs } = await download(ref.url, folder));
    if (!video || !existsSync(video)) throw new Error("the video file is missing");
    mkdirSync(folder, { recursive: true });
    const pics = await frames(video, folder);
    if (!pics.length) throw new Error("no frame could be read from the video");
    const known = trends(readStats(dir).refs).map((t) => t.trait);
    const answer = await ai({ prompt: watchPrompt({ ...ref, title }, subs, known), images: pics });
    const seen = jsonIn<Seen>(answer);
    if (!seen?.saw?.length) throw new Error("the AI did not describe the video");
    return updateRef(dir, ref.id, {
      status: "watched", error: undefined, title: String(seen.title ?? title ?? ref.name).slice(0, 60), shot: pics[0],
      saw: seen.saw.slice(0, 6).map((s) => ({ k: String(s.k).toUpperCase().slice(0, 10), v: String(s.v).slice(0, 240) })),
      beats: (seen.beats ?? []).slice(0, 6).map((b) => ({ label: String(b.label).slice(0, 24), weight: Math.min(4, Math.max(1, Number(b.weight) || 1)), kind: String(b.kind ?? "other") })),
      traits: (seen.traits ?? []).slice(0, 5).map((t) => String(t).slice(0, 80)),
      lessons: (seen.lessons ?? []).filter((l) => l?.text).slice(0, 5).map((l) => ({ topic: TOPICS.includes(l.topic as Topic) && l.topic !== "donts" ? l.topic as Topic : topicOf(String(l.topic ?? "")), text: String(l.text).slice(0, 200) })),
      ...(title && ref.url ? { name: title.slice(0, 60) } : {}),
    });
  } catch (e) {
    return updateRef(dir, ref.id, { status: "failed", error: (e as Error).message.split("\n").find((l) => /ERROR|error/.test(l))?.slice(0, 200) ?? (e as Error).message.slice(0, 200) });
  }
}
