import { useEffect, useState } from "react";
import { Halftone } from "./halftone";

// The studio's mascot while the AI works, drawn like the cliffiscurious.com cards: gold dots on a black card.
// A stickman with the logo's egg for a head walks, or pushes his boulder up the hill; at random, he switches.
export function Mascot({ label = "YOUR AI IS WORKING…" }: { label?: string }) {
  const [scene, setScene] = useState<"walker" | "sisyphus">(() => (Math.random() < 0.5 ? "walker" : "sisyphus"));
  useEffect(() => {
    const id = setInterval(() => setScene(Math.random() < 0.5 ? "walker" : "sisyphus"), 9000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mascot">
      <Halftone fx={scene} step={7} label={scene === "walker" ? "The mascot walks" : "The mascot pushes his boulder up the hill"} />
      <span className="mono">{label}</span>
    </div>
  );
}
