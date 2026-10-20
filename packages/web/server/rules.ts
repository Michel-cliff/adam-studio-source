// The editing rules Claude follows when it proposes. Distilled, in our own words, from open-source editing skills
// listed in awesome-claude-video-skills (CC0 list): cut-video (Louise de Sadeleer, MIT), favstash edit-video and
// hook levers (alisadiq-ai, Apache-2.0), ghost-editor playbook (kurbaitaev, MIT), claude-shorts scoring rubric
// (Daniel Agrici, MIT), naive-video-skill content logic (MIT), claude-youtube-editor suggest-sfx (Hasan Aboul
// Hasan, MIT). See docs/editing-rules.md for the sources.

export const GENERAL_RULES = `How a proposal is judged (follow every rule):
- Ground every variant in the creator's own words: quote the words it acts on and anchor on their word ids. Never invent spoken words, numbers or claims.
- Variants must pull different levers, not be three wordings of one idea. Draft at least five candidates in your head, keep the best two or three.
- Before proposing, rate each finalist on curiosity, stakes, specificity, visual proof and fit with the creator's voice. If all look perfect, rate again: most have a weak side. Drop the weak ones.
- Each variant gets: a label (at most 60 characters, what the creator will SEE, in the transcript's language), a "why" (one or two sentences in the transcript's language: what changes, where, and what the viewer gets), and the patch.
- Less is more: one emphasis mechanism per video, a small sound on a graphic and none on a bare cut, hard cuts by default (113 of 119 transitions in top reels are hard cuts), median shot around 3 s.
- Talking heads: the face stays on screen at least 65% of the time, at most 3 inserts per minute, full-screen inserts at most 25% of the runtime.
- Keep everything readable at phone size inside the safe area (x 72 to 900, y 269 to 1248 on 1080x1920); never cover the eyes or mouth; no em dashes on screen.
- Searching media: at most 3 search_assets calls per proposal. If they bring nothing usable, or a note says no online library answers, stop searching: propose with what exists (titles, text behind the subject, the Inspiration folder) and name the image that would help.
- The creator's taste so far: animations slower than default, few meaningful effects. The decisions and notes in the project's proposal history are taste: follow them.`;

export const STEP_RULES: Record<string, string> = {
  cuts: `Cuts, rules:
- Remove silences, fillers (um, uh, euh, ben, bah), hedges said as filler (like, you know, I mean, genre, en fait, du coup, voilà), weak openers (so, okay so, alors), restart preambles and false starts.
- Self-corrections within about 3 s: drop the first attempt. Full-line retakes (the same opening words again, up to 60 s later, often after a pause or "okay"): keep the LAST complete take unless an earlier one is clearly cleaner, and say which.
- Never cut laughs, reactions (sighs, wow), a beat after a punchline (trim it to 0.4 to 0.6 s, not away), or a one-word zinger and its beat.
- Pace targets: aggressive about one cut every 1.3 to 1.5 s and 40 to 60% shorter; leave about 0.2 s of breath between sentences. Retake-heavy footage compresses more by dropping whole lines; do not force mid-sentence cuts into fluent takes.
- Offer tones as variants when it helps: aggressive, balanced (natural pauses kept), sentimental.`,
  structure: `Story, rules:
- Find the strongest honest opening and the minimum context its payoff needs. Group the talk into viewer-facing ideas: for each, the viewer's question, one takeaway, the words that carry it.
- Arc: context, conflict, what was done, a twist, the ending with one useful thing; steps 2 to 4 may repeat. The end must give value (a tip, a takeaway, a clear next step).
- A reordered story must still make sense to someone who never saw the raw take: no "as I said", no pronoun without its noun, no ending mid-thought.
- Variants are different shapes (chronological, result first then how, problem then fixes, open loop teased at the start and closed at the end), each anchored on real sentences.`,
  captions: `Captions, rules:
- Language first: accuracy, sync and reading comfort over effects. Keep names, numbers, negations and qualifiers exact.
- Segment by meaning and breath, one or two lines, never an orphan article or preposition; hold each phrase long enough to read.
- Size around 46 to 68 px on a 1080-wide frame (bold styles up to 72), centred on the canvas, clear of the face and of the app buttons.
- One emphasis mechanism: one highlighted word per phrase, not a rainbow. Karaoke word fill only if the creator asked.
- Variants are distinct presets: bold (2 to 3 words, uppercase, one highlighted word), clean (3 to 5 words, sentence case, soft shadow), minimal (one line).`,
  hook: `Hook, rules (the first 3 seconds decide everything):
- Hooks are psychology levers: curiosity gap, status threat, regret, loss aversion, pattern interrupt, specificity (a true, surprising number), contrarian take, confession, transformation (old way to new way), direct address to a persona, dichotomy (A vs B). Strong hooks pull two or three at once. Each variant uses a different lever and says which.
- Keep the loop open: name what the viewer wants to know without saying it. Closed openers ("here are 5 things about X", "let me explain X", "today I want to talk about") are weak.
- Add a stakes clause of about seven words naming who should care when the hook states a fact with no beneficiary.
- Frame 1 already shows the hook's subject or motion, never a blank or a title over nothing. On-screen hook text complements the first spoken words, it does not repeat them; 4 to 8 words.
- If the strongest sentence is later in the take, propose moving it to the start (open on it, then the context).`,
  beats: `Beats, rules:
- Mark a change of idea, not every sentence: a key word behind the speaker, a punch-in, a flash, at the moment the word is said.
- Hard cuts by default; a transition only at a section change. At most three comic punch-ins per video; hide jump cuts with short dissolves rather than a zoom on every cut.
- Leave the speaker's face readable; a punch-in that the speaker's own movement cancels is useless.`,
  visuals: `Visuals, rules:
- Show what is said only when the words name something showable; every insert must show its line. A spoken list becomes typography, not stock footage.
- Sources in order: the creator's own footage and Inspiration folder, then stills in one consistent visual language, then stock that matches the video's world, inside a frame. No posed stock models.
- Build connected states (something enters, a gap closes, a number grows) rather than an oversized icon on an empty panel. Label mockups. Decorative charts must not pretend to be data.
- Inside a talking head: at most 3 inserts per minute, at most 25% full screen, face on screen at least 65%.`,
  sound: `Sound, rules:
- Speech first; silence is valid. Effects follow visible events: click for a UI action, pop for an element arriving, whoosh for a motivated move, impact for a reveal, tick for a step.
- Put each sound on the first frame that shows its event; struck sounds on their attack, whooshes peak on the move. Merge cues closer than about 6 frames.
- Density: about 6 to 12 subtle sounds per minute on graphics, none on bare cuts, never on a spoken word; a meme sound at most 1 to 3 per minute, in the pause after the punchline, never twice the same.
- Layer only the two or three biggest moments (riser into an impact on the reveal). Duck everything under the voice.`,
  look: `Type and look, rules:
- One coherent type hierarchy: one display face, one caption face, real bold weights. Colors that work with the real footage; light accents need dark text.
- Keep the creator's face as shot (never regrade the face), one consistent grade across the video.
- Pace of motion matches the content: calm and slower for reflective talks, snappier for hot takes; this creator prefers slower.
- Variants are named looks with a reason (clean business, editorial, cinematic, pop), not random font swaps.`,
};

/** The rules sent with a step's request: the general ones and that step's. */
export function rulesFor(step: string): string {
  return [GENERAL_RULES, STEP_RULES[step] ?? ""].filter(Boolean).join("\n\n");
}
