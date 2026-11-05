# Text placement rules for vertical short videos (9:16)

Rules for placing every piece of on-screen text (hook titles, captions, key words, numbers, calls to action) in a
vertical short video for Reels, TikTok and Shorts. Coordinates are for a 1080 x 1920 frame; scale them for other
sizes. Source: ReelCuts, "Text placement matters more than you think. Use the safe zone" (YouTube Shorts, 26 s),
combined with the safe area and the bands Adam Studio uses.

## 1. Why placement matters

- If viewers cannot read the text, they scroll. Placement is part of the hook, not decoration.
- The platforms draw their own interface over the video: the account name and the post caption at the bottom, the
  like, comment, share and save buttons down the right side, the header at the top. Text under that interface is
  hidden.
- Screens differ: text that touches the edges of the frame gets cut off on some phones.

## 2. The safe zone

- Keep every group of text whole inside its band below: its full height counts, not only its anchor.
- The last 15 % of the frame (below y 1632) belong to the platform's caption, account name and progress bar: never place text there.
- The right margin (180 px) is wider than the left one (72 px): the right side carries the app buttons.
- No text box may touch the edge of its band: keep at least 24 px of breathing room inside it.

## 3. Where each kind of text goes

The bands are those of the code (`THIRD_BANDS` in `packages/model/src/text-placement.ts`) and of `da-par-defaut.md`, which decide if this page ever differs from them.

| Zone | y range (1080 x 1920) | Use it for |
|---|---|---|
| Upper band | 106 to 576, centre aimed at 288 | Titles: the hook text of the first seconds, the topic of the video, a section title, above the head |
| Centre | 600 to 950 | Impact: one key word, one number, one short punchline, shown big |
| Lower band | 1344 to 1632, centre aimed at 1459 | Captions (the spoken words), under the face |
| Very bottom | below 1632 | Never: the app's own caption covers it |

- Captions stay under the face in the lower band. Raise them inside the band when the hands or an object sit there.
- The centre is for impact, and only for a moment: a word or number that lands with the line that says it, then
  leaves. Never keep a text block in the centre for long.
- One text zone at a time besides the captions: a title in the upper band and an impact word in the centre do not
  share the screen.

## 4. Horizontal position and width

- Centre text on the frame (x 540) by default, with a line width of at most 720 px, so it stays clear of the right-side
  buttons.
- Left-aligned text starts at x 120 at the earliest.
- Two lines at most per text block. Break lines by meaning, never leaving an article or preposition alone at the end.

## 5. The face comes first

- Text in front never covers the eyes or the mouth. When the speaker is framed high, the title gets smaller to fit above the head.
- A title behind the head is the one exception, and only when the creator asks for it: the head passes in front of it, so the
  face stays whole. It keeps the position it was given, and the first render computes the matte.

## 6. Size and readability

- Captions: about 46 to 68 px on a 1080-wide frame, up to 72 px for bold styles.
- Titles and hook text: bigger than the captions (about 72 to 110 px), 4 to 8 words.
- Impact words and numbers: the biggest text on screen, one to three words.
- Contrast that survives any background: white or light text with a dark outline or soft shadow, or dark text on a
  light plate. Test on the brightest frame of the video.
- Hold each phrase long enough to read it aloud once.

## 7. Keep it clean

- Clean, centred, inside the safe zone: the summary of every rule above.
- One emphasis mechanism per video (for example one highlighted word per caption), not a rainbow of colours and
  effects.
- No em dashes on screen.

## 8. Checklist before export

1. Pause on three frames (start, middle, end) and check that no text touches the edges of the frame.
2. Picture the app interface over the video: nothing under the bottom band or the right-side buttons.
3. Titles in the upper band, impact in the centre, captions in the lower band.
4. Eyes and mouth visible on every frame with text.
5. Every text readable on a phone held at arm's length.
