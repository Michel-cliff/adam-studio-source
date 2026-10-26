# The adam-studio tools

| Tool | Use it to | Note |
|---|---|---|
| `list_projects` | find the project | names are folder names |
| `get_project` | read the edit, its lint and the proposal history | first call, always |
| `get_transcript` | words with ids and times, pauses | one take or a range keeps it short |
| `get_reference` | schemas: project, style, timeline, frameworks, `kinds`, `kind:<name>` | before writing an unfamiliar patch |
| `first_pass` | mechanical proposals and the brief of a new project | then write the creative proposals |
| `propose` | add a proposal (or refill one sent back) | see proposals.md |
| `apply_patch` / `update_item` / `set_value` | explicit edits | validated, backed up; `undo` reverts |
| `close_step` | close a step that needs nothing | opens the next |
| `still` | look at frames of the edit or of a variant (`p1:B`) | before finishing, on the boldest variant |
| `search_assets` | the Inspiration folder first, then Pixabay (images, videos) and Freesound (sounds) with `online` | at most 3 per proposal; a note says when a library is down |
| `look_at` | see a file or URL: video frames, an image, a waveform, a font sample | study references this way |
| `import_asset` | copy or download a file into the project, with credits | fonts are copied, then used through `setStyle` |
| `list_series` / `apply_series` / `save_series` | shared formats across episodes | re-applying replaces |
| `run` | analyze, render, review, capcut | the creator's call |
| `create_project` / `add_rushes` | new project or more takes, from absolute paths | runs the analysis |
| `decide` | record the creator's choice | only when the creator asks |

Element kinds (`get_reference kinds`): `title`, `text.behindSubject` (needs the subject matte), `image`, `hud.panel`,
`hud.stat`, `lottie`, `camera.zoom` (punch-in), `camera.window` (the take shrinks like a window to a 4:3 box on a flat
colour, with an outline and a title bar; the captions follow under it). Transitions: `flash`, `whip`, `zoom`. Times
are milliseconds; word ids are `<take>.w<n>`.

Entrances and exits (`intro` / `outro` of `image`): `fade`, `pop`, `pixel` (big blocks that resolve, 250 ms), `step`
(stop-motion pop for pixel icons, 4 frames at 12 fps), `popOut` (an icon springing out past its size, 400 ms), `window` (opens wide then tall, 250 ms), `glitch`. Screen effects
of the style (`fx`): `grain` (footage grain, 0 to 1), `scanlines` {`window` level during a 4:3 window, `burst` when a
zoom or window lands or a `window` insert opens, `burstFrames`}, `zoomBlur` (px of blur on a zoom's move).

Traps:
- A punch-in the speaker's own movement cancels does nothing: check with `still`.
- A sentence moved to the start must still make sense alone: no "as I said", no pronoun without its noun.
- When returning from an insert, never show a stray frame of another take.
