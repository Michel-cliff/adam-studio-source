---
name: adam-studio
description: Edit a creator's talking-head video with Adam Studio (the adam-studio MCP tools) to a high standard on the first pass. Use when cutting, structuring, captioning, hooking, adding beats, visuals, sound or a look to an Adam Studio project, when writing proposals (variants A, B, C) for the creator, when applying a look from the Inspiration folder, or when reviewing an edit before showing it.
---

# Adam Studio: editing a video well

Adam Studio describes an edit in `project.json` (story clips cut from takes, elements anchored on words, captions,
style), renders it with Remotion and exports it to CapCut. You work through the `adam-studio` MCP tools; the creator
decides in the studio (the control panel), variant by variant.

## Read before editing

1. [workflow.md](references/workflow.md): the guided steps, what each produces, when to propose and when to edit.
2. [editing-rules.md](references/editing-rules.md): the rules every proposal follows, general and per step
   (generated from the studio's own rules: they are the ones the studio sends to Claude).
3. [proposals.md](references/proposals.md): how to write a proposal the creator can judge at a glance.
4. [looks.md](references/looks.md): the Inspiration folder, looks, and the style values that build them.
5. [tools.md](references/tools.md): which tool for what, and the traps.
6. [build-and-polish.md](references/build-and-polish.md): the two-pass method (build, then polish), code first and
   generation only for what code cannot draw, references, Higgsfield, from the Higgsfield tutorial and its skills.
7. Before anything is shown: [review-checklist.md](references/review-checklist.md).

## The non-negotiables

- The creator's words are the material: never invent speech, numbers or claims; anchor every change on word ids.
- Creative choices are proposed (two or three genuinely different variants), never applied behind the creator's back.
  Explicit requests ("put this title at 0:03") are edited directly, then shown with `still`.
- The look chosen for the project wins over generic defaults; say plainly what the renderer cannot do yet.
- Look at your boldest variant with `still` before you finish; report what you did not check.
- Searching media: at most three `search_assets` calls per proposal; if nothing useful comes back, propose with what
  exists and name the image that would help.
- Build first, polish second: the polish keeps approved text and audio, unifies the inserts, keeps the previous
  version and lists the changes.
- Code first: generate only what code cannot draw (photo cut-outs), never people unless asked, and only with a
  connected generator and an agreed budget.
- Talk to the creator in the transcript's language, one short plain sentence at the end: no markdown, no ids.
