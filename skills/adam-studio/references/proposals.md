# Writing a proposal

A proposal is one decision for the creator: `propose` with `{id, step, anchor?, reason, variants}`.

- `id`: `ask.<step>.<something unique>` for an answer to the creator, `auto.<step>` from the first pass.
- `reason`: one sentence on why this decision matters for this video.
- `variants`: two or three, keys A, B, C. Each one:
  - `label`: at most 60 characters, what the creator will SEE ("Question in big serif over the first shot").
  - `why`: one or two sentences: what changes, where (quote the words), what the viewer gets.
  - `patch`: the change, in the shape of `apply_patch` (`get_reference` gives the schemas).
- Label, why and reason in the transcript's language.

## What makes a good set of variants

- Different levers, not three wordings of one idea: for a hook, a curiosity gap, a surprising number, a confession;
  for a look, editorial, cinematic, clean.
- Draft at least five candidates in your head; rate each on curiosity, stakes, specificity, visual proof and fit with
  the creator's voice; keep the best two or three. If all look perfect, rate again.
- Grounded: quote the creator's real sentences, anchor on their word ids.
- Readable at a glance: the creator decides from the label and the why, then watches the variant.
- When the creator sends a proposal back for more options, refill the same id with new variants: their note says what
  was missing.

## Example (shape only)

```json
{
  "id": "ask.hook.k3x9",
  "step": "hook",
  "reason": "The video opens on context; the strongest line comes at 0:12.",
  "variants": [
    { "key": "A", "label": "Open on « J'ai arrêté de poster pendant un mois »", "why": "Moves the sentence at 0:12 to the start; the context follows once the viewer is hooked.", "patch": { "setStory": [] } },
    { "key": "B", "label": "Big serif question over the first shot", "why": "The question viewers ask themselves, on screen 0 to 3 s, answered by the first sentence.", "patch": { "addElements": [] } }
  ]
}
```
