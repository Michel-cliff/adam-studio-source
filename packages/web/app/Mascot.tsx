import { useEffect, useState } from "react";

// The studio's mascot while the AI works: a stickman with the logo's egg for a head, in halftone dots. He walks,
// or pushes his boulder up the hill; every few seconds, at random, he switches.
type Scene = "walk" | "push";

function Egg({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="17" ry="22" fill="url(#eggdots)" />
      <ellipse cx="0" cy="0" rx="17" ry="22" fill="none" stroke="#D9B13B" strokeWidth="1.5" />
    </g>
  );
}

export function Mascot({ label = "YOUR AI IS WORKING…" }: { label?: string }) {
  const [scene, setScene] = useState<Scene>(() => (Math.random() < 0.5 ? "walk" : "push"));
  useEffect(() => {
    const id = setInterval(() => setScene(Math.random() < 0.5 ? "walk" : "push"), 7000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mascot">
      <svg viewBox="0 0 320 200" role="img" aria-label={scene === "walk" ? "The mascot walks" : "The mascot pushes a boulder up a hill"}>
        <defs>
          <pattern id="eggdots" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.35" fill="#D9B13B" /></pattern>
          <pattern id="rockdots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.6" fill="#EDE5C8" /></pattern>
        </defs>
        {scene === "walk" ? (
          <g className="walk">
            <line x1="20" y1="170" x2="300" y2="170" stroke="#EDE5C8" strokeWidth="2" strokeDasharray="6 8" className="ground-move" />
            <g className="walker" stroke="#EDE5C8" strokeWidth="5" strokeLinecap="round" fill="none">
              <Egg x={160} y={52} s={1.35} />
              <line x1="160" y1="82" x2="160" y2="122" />
              <g className="arm a1"><line x1="160" y1="92" x2="146" y2="118" /></g>
              <g className="arm a2"><line x1="160" y1="92" x2="174" y2="118" /></g>
              <g className="leg l1"><line x1="160" y1="122" x2="148" y2="166" /></g>
              <g className="leg l2"><line x1="160" y1="122" x2="172" y2="166" /></g>
            </g>
          </g>
        ) : (
          <g className="push">
            <path d="M0 200 L320 70 L320 200 Z" fill="#1B1A18" stroke="#EDE5C8" strokeWidth="2" />
            <g className="climber">
              <g className="rock"><circle cx="0" cy="0" r="30" fill="url(#rockdots)" stroke="#EDE5C8" strokeWidth="1.5" /></g>
              <g stroke="#EDE5C8" strokeWidth="5" strokeLinecap="round" fill="none" transform="translate(-58 22) rotate(-22)">
                <Egg x={10} y={-34} s={0.8} />
                <line x1="8" y1="-16" x2="2" y2="18" />
                <line x1="6" y1="-8" x2="34" y2="-18" />
                <line x1="6" y1="-4" x2="34" y2="-8" />
                <g className="push-leg p1"><line x1="2" y1="18" x2="-12" y2="44" /></g>
                <g className="push-leg p2"><line x1="2" y1="18" x2="12" y2="44" /></g>
              </g>
            </g>
          </g>
        )}
      </svg>
      <span className="mono">{label}</span>
    </div>
  );
}
