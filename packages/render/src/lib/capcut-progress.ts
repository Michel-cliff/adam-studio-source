/**
 * One export, rather than a fresh 0-100 % for each rendered piece. Frames weight
 * each piece; the final 10 % belongs to assembling the editable CapCut project.
 */
export function capcutRenderProgress(frames: number[], write: (line: string) => void = console.log): (index: number) => (progress: number) => void {
  const total = frames.reduce((sum, count) => sum + count, 0);
  const starts = frames.map((_, index) => frames.slice(0, index).reduce((sum, count) => sum + count, 0));
  let highest = 0, previous = "";
  return index => progress => {
    const fraction = Math.max(0, Math.min(1, progress));
    const percent = Math.max(highest, Math.min(90, Math.floor(90 * (starts[index]! + frames[index]! * fraction) / total)));
    highest = percent;
    const line = `capcut: ${percent} % | Effect ${index + 1}/${frames.length}`;
    if (line !== previous) { previous = line; write(line); }
  };
}
