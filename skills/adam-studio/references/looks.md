# Looks and the Inspiration folder

## The folder (`~/AdamStudioInspiration`, or `ADAM_INSPIRATION`)

Organised like a skill:

```
README.md
references/            general inspiration: photos/, videos/, frames/, media-manifest.json
looks/<look>/
  LOOK.md              the look's entry: what it is, the order to read things, how Adam Studio builds it
  references/          style-guide.md (the values), reference-map.md (what each reference shows, time windows),
                       revision-checklist.md, media-manifest.json, photos/ videos/ frames/
  skill/               the original skill the look comes from (read only)
Uploads/               files dropped in the studio
```

- The look applied to every project is chosen on the studio's home page; it is sent with every request and is in the
  first-pass brief. Read its `LOOK.md` and `references/style-guide.md`; open frames and videos from
  `reference-map.md` before choosing a treatment (motion comes from videos, never from a still).
- References teach a treatment. Their people, text, scenes and music never enter the creator's video unless
  `media-manifest.json` says the creator owns them.

## The style values that build a look

| Value | What it does |
|---|---|
| `fonts.title`, `fonts.caption` | family and file of each role (a look usually fixes three families at most) |
| `colors` | text, highlight, accent, ink |
| `grade` | the presenter: warmth, contrast, saturation, brightness (-1 to 1), vignette (0 to 1) |
| `inserts` | image inserts only: `bw` (soft neutral black and white), `grain` (new every frame), `bloom` (glow of highlights), 0 to 1 |
| `motion.speed` | below 1 slows every effect (this creator prefers about 0.8) |
| `caption` | size, stroke, shadow |

Editorial archival, for example: three families (grotesque, display serif, mono), paper, ink and one accent,
`inserts {bw: 1, grain: 0.5, bloom: 0.4}`, presenter graded clean with vignette about 0.25, motion 0.8.

Not in the renderer yet: a treatment for video b-roll in the story, gate weave, flicker, dust. Say so instead of
faking them with a global grade.
