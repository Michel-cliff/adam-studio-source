// What each step asks the AI for by default: the button of the step view, and what auto mode asks on its own.
export const PRESETS: Record<string, { button: string; prompt: string }> = {
  story: { button: "PROPOSE 3 STORY SHAPES", prompt: "Propose three different shapes for the story (order and framework), anchored on what I say: for example result first, problem then fixes, open loop." },
  captions: { button: "PROPOSE 3 CAPTION STYLES", prompt: "Propose three caption styles that are genuinely different: the font, the size, the colors, how the key word is highlighted and where the captions sit. Keep my words." },
  hook: { button: "PROPOSE 3 HOOKS", prompt: "Propose three hooks for the first three seconds that pull different levers, anchored on what I say." },
  visuals: { button: "PROPOSE 3 VISUAL DIRECTIONS", prompt: "Propose three visual directions within the stable editorial skeleton: condensed headline, optional italic connector, compact captions, smooth zoom and blur. Vary the generic icon subjects and chosen or derived colours, each anchored on what I say. No shake, glitch, whip, retro 4:3 chrome or pixel icons." },
  sound: { button: "PROPOSE 3 SOUNDTRACKS", prompt: "Propose three sound designs that are genuinely different: a music bed or none, effects on the key moments, the levels. Use audio files from my Inspiration folder or the free libraries." },
};

/** The preset a workflow step asks for in auto mode; the cuts come from the first pass, the story from the script,
 * beats and look ride along. */
export const STEP_PRESET: Record<string, string | undefined> = { captions: "captions", hook: "hook", visuals: "visuals", sound: "sound" };
