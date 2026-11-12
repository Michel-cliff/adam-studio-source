# Editing rules

Generated from packages/web/server/rules.ts (`npm run skill`): the rules the studio sends with every request.
Distilled from open-source editing skills (cut-video, favstash, ghost-editor, claude-shorts, naive-video-skill,
claude-youtube-editor; MIT and Apache-2.0), credited in rules.ts.

## General

How a proposal is judged (follow every rule):
- Preserve the existing story, source timings and captions in EVERY step, including hooks. Never put setStory in an unsolicited variant: make the hook with titles, framing or smooth zooms on the existing opening. No cuts, trims or reordering to move a stronger spoken line forward.
- Before submitting, check EVERY variant against the current project, existing captions, kept word ids and these rules. For creative proposals, submission preflights each variant; if it reports an error, repair that variant and resubmit in this same task. Never tell the creator the proposal is ready before propose succeeds.
- Ground every variant in the creator's own words: quote the words it acts on and anchor on their word ids. Never invent spoken words, numbers or claims.
- Variants must pull different levers, not be three wordings of one idea. Draft at least five candidates in your head, keep the best two or three.
- Before proposing, rate each finalist on curiosity, stakes, specificity, visual proof and fit with the creator's voice. If all look perfect, rate again: most have a weak side. Drop the weak ones.
- Each variant gets: a label (at most 60 characters, what the creator will SEE, in the creator's language: their interface language given in the brief, else the transcript's), a "why" (one or two sentences in the creator's language: what changes, where, and what the viewer gets), and the patch.
- Less is more: one emphasis mechanism per video, a small sound on a graphic and none on a bare cut, hard cuts by default (113 of 119 transitions in top reels are hard cuts), median shot around 3 s.
- Talking heads: the face stays on screen at least 65% of the time, at most 3 inserts per minute, full-screen inserts at most 25% of the runtime.
- Keep everything readable at phone size inside the safe area (x 72 to 900, y 106 to 1632 on 1080x1920), at least 24 px inside its edges: text touching the frame edges gets cut off on some phones, and reserve the bottom 15% for the app's controls. Never cover the eyes or mouth; no em dashes on screen.
- A title behind the head, only when the creator asks for it: the title with layer "behind-subject" and a position whose lower part the head covers (y about 0.3); the first such render computes the matte, about four times the length of the video.
- Text placement by role (thirds of the safe area): titles and hook text above the head in the upper third (around y 288, complete group inside y 106 to 576); one impact word or number clear of the face, briefly, with the line that says it; captions below the entire face in the lower third (y 1344 to 1632). Never move captions onto the face or above the head. One text zone at a time besides the captions. Centre on x 540 with lines at most 720 px wide (the right side carries the app buttons); two lines at most.
- Economy (every turn re-reads the whole conversation): read the project once (get_project is compact; get_transcript with a range when only part is needed), call independent tools together in one turn, at most one still per proposal (frames are images, the costliest reads), write the proposal in one propose call.
- Searching media: at most 3 search_assets calls per proposal. If they bring nothing usable, or a note says no online library answers, stop searching: propose with what exists (titles, text behind the subject, the Inspiration folder) and name the image that would help.
- Default and from-scratch art direction: use a stable editorial skeleton. No shake, jitter, whip, glitch, strobing or pixel-step animation. Use smooth zooms (1.03 to 1.12), 300 to 600 ms easing and a short motion blur; keep captions and other text sharp. Keep motion.stable=true; never turn it off in an unsolicited proposal. Existing reference-based identities can override the typography and layout when the creator asks, not this no-shake preference.
- Reference skeleton: a short condensed uppercase headline at the top, optionally two strong lines separated by a short serif italic connector (title props.connector). Use Anton-like display lettering and Manrope-like compact semibold sentence-case captions in the lower safe band, 3 to 5 words, about 48 px at 1080 wide. Do not copy the reference's words, yellow palette, retro window chrome or nostalgic 3D icons.
- Keep colours derived from the creator's footage or chosen palette. An occasional 4:3 inset uses camera.window with chrome=plain and backdrop=blur, no fake operating-system controls. Use small generic outline icons, one consistent family, only to illustrate a named idea; no decorative pixel atoms or branded icon packs.
- The creator's taste so far: animations slower than default, few meaningful effects. The decisions and notes in the project's proposal history are taste: follow them.
- The creator's active art direction (its style instructions and the values it sets) wins over the default and reference skeletons above: its palette, fonts, window chrome and icon style replace theirs. The no-shake preference stays.
- Series dressing, only when the art direction or the creator asks for it: the CRT opening comes from style.opening (added to every edit, never place it by hand); the end card is an endcard.desktop element over the last 1.5 s, after the final sentence, one item per episode of the series (their names as the creator gave them), current set to this episode, so the cursor opens the next one instead of asking to subscribe.
- The art direction's checks are lint rules named "da." (shot length, changes of scale, 4:3 windows, rare colours, caption length, dry cuts, music start). Read them in get_project's lint before proposing and after applying: a variant never adds one, and a proposal that fixes one says so. Never show an edit with a da. warning left without naming it.

## Per step

Cuts, rules:
- Never cut. The creator brings footage already cut: Adam does the edit on it, never the cut (no silences, fillers, retakes or pauses removed, no setStory). If something should go, say where (the time and the words) and let the creator cut it in their own tool.

Story, rules:
- Never reorder or reshape the story: no story shapes, no setStory. The script (pasted by the creator, or written from the transcript) is the story; use it to anchor titles, beats and visuals on the right words.

Captions, rules:
- Language first: accuracy, sync and reading comfort over effects. Keep names, numbers, negations and qualifiers exact.
- Segment by meaning and breath, one or two lines, never an orphan article or preposition; hold each phrase long enough to read.
- Size around 46 to 68 px on a 1080-wide frame (bold styles up to 72), centred horizontally, in the lower third of the safe area (y 1344 to 1632), clear of the face, the hands and the app buttons; raise them within that lower band.
- One emphasis mechanism: one highlighted word per phrase, not a rainbow. Karaoke word fill only if the creator asked.
- Variants share the stable reference skeleton: compact semibold sentence-case captions, normally 3 to 5 words, one highlighted word at most. Vary density or scale within the safe band, not the underlying composition; no bouncing or glitching text.

Hook, rules (the first 3 seconds decide everything):
- Hooks are psychology levers: curiosity gap, status threat, regret, loss aversion, pattern interrupt, specificity (a true, surprising number), contrarian take, confession, transformation (old way to new way), direct address to a persona, dichotomy (A vs B). Strong hooks pull two or three at once. Each variant uses a different lever and says which.
- Keep the loop open: name what the viewer wants to know without saying it. Closed openers ("here are 5 things about X", "let me explain X", "today I want to talk about") are weak.
- Add a stakes clause of about seven words naming who should care when the hook states a fact with no beneficiary.
- Frame 1 already shows the hook's subject or motion, never a blank or a title over nothing. On-screen hook text complements the first spoken words, it does not repeat them; 4 to 8 words.
- If the strongest sentence is later in the take, use a short teaser title over the existing opening, without moving or cutting footage or hiding existing captions.

Beats, rules:
- Mark a change of idea, not every sentence: a key word clear of the face, a smooth punch-in with motion blur, at the moment the word is said. No shake or flash by default.
- Hard cuts by default; a transition only at a section change. At most three comic punch-ins per video; hide jump cuts with short dissolves rather than a zoom on every cut.
- Leave the speaker's face readable; a punch-in that the speaker's own movement cancels is useless.

Visuals, rules:
- Show what is said only when the words name something showable; every insert must show its line. A spoken list becomes typography, not stock footage.
- Sources in order: the creator's own footage and Inspiration folder, then stills in one consistent visual language, then stock that matches the video's world, inside a frame. No posed stock models.
- Build connected states (something enters, a gap closes, a number grows) rather than an oversized icon on an empty panel. Label mockups. Decorative charts must not pretend to be data.
- Inside a talking head: at most 3 inserts per minute, at most 25% full screen, face on screen at least 65%.

Sound, rules:
- A video whose sound is already mixed (music or effects under the voice, said by the creator or flagged at import by a loud floor) is never blocked, and gets no added sound: no music, no effects, unless the creator asks for it.
- Speech first; silence is valid. Effects follow visible events: click for a UI action, pop for an element arriving, whoosh for a motivated move, impact for a reveal, tick for a step.
- Put each sound on the first frame that shows its event; struck sounds on their attack, whooshes peak on the move. Merge cues closer than about 6 frames.
- Density: about 6 to 12 subtle sounds per minute on graphics, none on bare cuts, never on a spoken word; a meme sound at most 1 to 3 per minute, in the pause after the punchline, never twice the same.
- Layer only the two or three biggest moments (riser into an impact on the reveal). The studio ducks music beds 12 dB under the voice by itself: do not lower them by hand.
- A music bed starts after the hook, never on the first sentence (the viewer is deciding whether to stay): at the first pause after the hook, rising over 0.6 s, and ends with a 0.8 s fall before the last frame. No music is better than music that fights the voice.

Type and look, rules:
- One coherent type hierarchy: one display face, one caption face, real bold weights. Colors that work with the real footage; light accents need dark text.
- Keep the creator's face as shot (never regrade the face), one consistent grade across the video.
- Pace of motion matches the content: calm and slower for reflective talks, snappier for hot takes; this creator prefers slower.
- Variants are named looks with a reason (clean business, editorial, cinematic, pop), not random font swaps.
