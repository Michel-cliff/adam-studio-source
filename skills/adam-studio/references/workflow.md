# Workflow

## Start

- `list_projects`, then `get_project` (structure, duration, lint, the proposal history) and `get_transcript` (words
  with ids like `c03.w12`, times in ms, pauses). The proposal history holds every past decision and note: it is the
  creator's taste, follow it.
- A new project: `first_pass` writes the mechanical proposals (cuts of fillers, failed takes and dead air; captions)
  and returns a brief: the edit as sentences with word ids, frameworks, Insights, the Inspiration folder, the style,
  the look and every rule. Then write the creative proposals it asks for.

## The guided steps, in order

| Step | Produces | Typical patch |
|---|---|---|
| cuts | what stays | `setStory` (clips with inMs/outMs per take) |
| structure | the order and the arc | `setStructure` (framework, beats on word ids), `setStory` to reorder |
| captions | words on screen | `addCaptions`, caption fonts and colors through `setStyle` |
| hook | the first 3 seconds | a `title` at 0 ms, a tighter or reordered opening |
| beats | marks on each new idea | `text.behindSubject` with the key word, `camera.zoom` punch-ins, transitions |
| visuals | what the words name | `image`, `hud.panel`, `hud.stat`, `lottie`, from the Inspiration folder first |
| sound | effects that carry the cut | audio elements on reveals and graphics |
| look | the signature | `setStyle` fonts, colors, `grade`, `inserts`, `motion.speed` |

Steps open one after the other: a later step can be explored, but the creator chooses in order. `close_step` closes
a step that needs nothing. Never call `decide` or `run` on the creator's behalf unless they ask.

## Propose or edit

- Creative choice (which hook, which look, which framework): `propose` with variants.
- Explicit instruction: `apply_patch`, `update_item` or `set_value`, then `still` to show it. `undo` puts back the
  previous version; every write is validated and backed up.

## Finish

`still` on the boldest variant (or `still` with `variant: "<proposal>:B"`), fix what is wrong, then one short sentence
for the creator. Rendering the final video and the CapCut export are the creator's call (`run render`, `run capcut`).
