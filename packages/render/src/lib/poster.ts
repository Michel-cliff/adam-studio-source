// The poster dress of the 4:3 window (camera.window chrome "poster"): what is drawn is computed here.

/** Bars of a barcode drawn from a text: widths of 1 to 4 units with gaps of 1 to 3, filling `width` px. */
export function barcode(text: string, width: number): { x: number; w: number }[] {
  let h = 2166136261;
  const next = () => { h = Math.imul(h ^ (h >>> 13), 16777619) + 0x9e3779b9; return (h >>> 0) / 4294967296; };
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const units: { bar: number; gap: number }[] = [];
  let total = 0;
  while (total < 90) {
    const bar = 1 + Math.floor(next() * 4), gap = 1 + Math.floor(next() * 3);
    units.push({ bar, gap });
    total += bar + gap;
  }
  const unit = width / total;
  let x = 0;
  return units.map((u) => { const b = { x: x * unit, w: u.bar * unit }; x += u.bar + u.gap; return b; });
}
