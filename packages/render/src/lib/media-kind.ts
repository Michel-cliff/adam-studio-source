// An image element may hold a video (a popup or a full-screen insert): it is played, muted unless asked, from startMs.
const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;

export const isVideoFile = (file: string) => VIDEO.test(file);

/** Where the video starts in its file, in frames of the edit. */
export const startFrames = (startMs: number, fps: number) => Math.round((startMs * fps) / 1000);
