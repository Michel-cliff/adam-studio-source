import { useEffect, useRef } from "react";

// The dot-matrix animations of cliffiscurious.com: gold dots on black whose size follows a moving field.
const sat = (x: number) => Math.max(0, Math.min(1, x));
const h1 = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
type Field = (u: number, v: number, t: number, a: number) => number;
// Distance from a point to a segment: the stickman's limbs are segments drawn in dots.
const seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1e-9;
  const k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l));
  return Math.hypot(px - ax - k * dx, py - ay - k * dy);
};
const limb = (d: number, w = .024) => sat(1.15 - d / w);
const egg = (x: number, y: number, cx: number, cy: number, r: number) => { const dy = (y - cy) / (r * 1.25), dx = (x - cx) / (r * (dy < 0 ? .85 : 1)); const d = Math.hypot(dx, dy); return d < 1 ? .55 + .45 * sat((1 - d) * 3) : sat(1 - (d - 1) * 14) * .6; };
export const FX: Record<string, Field> = {
  // The mascot walking: the egg head, a body, swinging arms and legs, the ground passing under him.
  walker(u, v, t, a) {
    const x = (u - .5) * a, y = v - .5, sw = Math.sin(t * 5.5) * .55, bob = Math.abs(Math.sin(t * 5.5)) * -.012;
    const hip = [0, .07 + bob], sh = [0, -.07 + bob];
    let f = egg(x, y, 0, -.19 + bob, .075);
    f = Math.max(f, limb(seg(x, y, sh[0]!, sh[1]! - .03, hip[0]!, hip[1]!)));
    for (const s of [1, -1]) {
      f = Math.max(f, limb(seg(x, y, hip[0]!, hip[1]!, hip[0]! + Math.sin(sw * s) * .19, hip[1]! + Math.cos(sw * s) * .19)));
      f = Math.max(f, limb(seg(x, y, sh[0]!, sh[1]!, sh[0]! + Math.sin(-sw * s) * .14, sh[1]! + Math.cos(sw * s) * .14), .02));
    }
    if (Math.abs(y - .27) < .012 && ((x * 9 + t * 1.6) % 1 + 1) % 1 < .55) f = Math.max(f, .7);
    return f;
  },
  // The mascot pushing his boulder up the hill; near the top it rolls back down, and he starts again.
  sisyphus(u, v, t, a) {
    const x = u * a, y = v, slope = (q: number) => .92 - .5 * (q / a);
    const p = (t * .09) % 1, s = p < .82 ? p / .82 : 1 - (p - .82) / .18, r = .13;
    const cx = (.38 + .42 * s) * a, cy = slope(cx) - r * 1.08;
    let f = y > slope(x) ? (Math.abs(y - slope(x)) < .012 ? .85 : .1) : 0;
    const dr = Math.hypot(x - cx, y - cy);
    if (dr < r) { const ang = Math.atan2(y - cy, x - cx) + s * 9; f = Math.max(f, .5 + .4 * Math.abs(Math.sin(ang * 3 + dr * 30))); }
    const hx = cx - r - .07, step = Math.sin(t * 4) * .05;
    const hip = [hx - .1, cy + .1], sh = [hx - .01, cy - .04];
    f = Math.max(f, egg(x, y, hx - .03, cy - .13, .06));
    f = Math.max(f, limb(seg(x, y, sh[0]!, sh[1]!, hip[0]!, hip[1]!)));
    f = Math.max(f, limb(seg(x, y, sh[0]!, sh[1]!, cx - r * .95, cy - .02), .02), limb(seg(x, y, sh[0]!, sh[1]! + .02, cx - r * .9, cy + .04), .02));
    for (const k of [1, -1]) { const fx = hip[0]! - .07 + k * step; f = Math.max(f, limb(seg(x, y, hip[0]!, hip[1]!, fx, slope(fx) - .005))); }
    return f;
  },
  ripple(u, v, t, a) { const px = .5 + .24 * Math.sin(t * .7), py = .5 + .18 * Math.cos(t * .9); const d = Math.hypot((u - px) * a, v - py); return sat((.5 + .5 * Math.sin(d * 34 - t * 4)) * Math.exp(-d * 2.4)); },
  target(u, v, t, a) { const x = (u - .5) * a, y = v - .5, d = Math.hypot(x, y); const r = .5 + .5 * Math.cos(d * 38 - t * 2.2); const cx = Math.sin(t * .6) * .2 * a, cy = Math.cos(t * .45) * .13; const sp = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) * 70); return sat(r * (1 - d * 1.7) * .9 + sp); },
  timeline(u, v, t) { const rows = 8, r = Math.floor(v * rows), fv = (v * rows) % 1; const ph = (t * .1) % 1; if (Math.abs(u - ph) < .008) return 1; if (fv < .25 || fv > .75) return 0; const dir = r % 2 ? 1 : -1; const x = ((u * 1.3 + r * .37 + t * .06 * dir) % 1 + 1) % 1; const len = .3 + .45 * h1(r); return x < len ? .72 : .08; },
  wave(u, v, t) { const amp = .05 + .33 * Math.abs(Math.sin(u * 9 + t * 2.4) * Math.sin(u * 2.3 - t * .8)); const dv = Math.abs(v - .5); return dv < amp ? 1 - dv / amp * .6 : 0; },
  radar(u, v, t, a) { const x = (u - .5) * a, y = v - .5, d = Math.hypot(x, y); if (d > .44) return 0; const ring = Math.abs(Math.sin(d * 28)) < .16 ? 1 : 0; let ang = (Math.atan2(y, x) - t * 1.3) % (Math.PI * 2); if (ang < 0) ang += Math.PI * 2; const sw = Math.pow(1 - ang / (Math.PI * 2), 3); return sat(ring * (.25 + .75 * sw) + sw * .35); },
  code(u, v, t) { const q = v * 13 + t * .45, r = Math.floor(q), fv = q % 1; if (fv < .3 || fv > .7) return 0; const ind = Math.floor(h1(r) * 4) * .07, len = .18 + h1(r * 7.3) * .5; const x0 = .08 + ind; if (u < x0 || u > x0 + len) return 0; return h1(r * 3.1) > .75 ? 1 : .55; },
};

/** One animated dot field; still (one frame) when the system asks for less motion, paused off screen. */
export function Halftone({ fx, step = 8, className = "", label }: { fx: keyof typeof FX; step?: number; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ctx = el.getContext("2d"); if (!ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, on = true;
    const io = new IntersectionObserver(([e]) => { on = Boolean(e?.isIntersecting); if (on && !raf && !still) raf = requestAnimationFrame(draw); });
    io.observe(el);
    function draw(ms: number) {
      raf = 0;
      const w = el!.clientWidth | 0, h = el!.clientHeight | 0;
      if (w && h) {
        if (el!.width !== w || el!.height !== h) { el!.width = w; el!.height = h; }
        ctx!.fillStyle = "#121210"; ctx!.fillRect(0, 0, w, h);
        ctx!.fillStyle = "#D9B13B"; ctx!.beginPath();
        const t = ms / 1000, a = w / h, f = FX[fx]!;
        for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) {
          const k = f(x / w, y / h, t, a);
          if (k > .05) { const r = k * step * .54; ctx!.moveTo(x + r, y); ctx!.arc(x, y, r, 0, 6.2832); }
        }
        ctx!.fill();
      }
      if (on && !still) raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [fx, step]);
  return <canvas ref={ref} className={`halftone ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
