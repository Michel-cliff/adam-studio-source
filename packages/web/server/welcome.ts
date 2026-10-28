// The first launch: an empty projects folder gets the "Welcome to Adam Studio" project, made from the tutorial video
// shipped with the app (demo/welcome.mp4), so the creator meets every screen on a real edit. Once only.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { newProjectCommand } from "./actions";
import type { JobManager } from "./jobs";
import { WEB } from "./paths";

export const WELCOME_NAME = "Welcome to Adam Studio";
export const welcomeVideo = () => join(WEB, "demo", "welcome.mp4");

/** True when this launch should create the welcome project: never done before, no project yet, the video shipped. */
export function shouldWelcome(root: string, marker: string, video = welcomeVideo()): boolean {
  if (existsSync(marker) || !existsSync(video)) return false;
  const projects = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")) : [];
  return projects.length === 0;
}

export function welcome(root: string, marker: string, jobs: JobManager): void {
  if (!shouldWelcome(root, marker)) return;
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, new Date().toISOString());
  mkdirSync(root, { recursive: true });
  jobs.start(WELCOME_NAME, newProjectCommand(join(root, WELCOME_NAME), [welcomeVideo()], "16:9", "fr"));
}
