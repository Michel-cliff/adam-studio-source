# Adam Studio: working notes for Claude Code

Read this first; do not re-explore what is written here. Keep replies short, no em dashes in delivered text.

## Map

- `packages/model`: project format (zod), `resolve`, workflow (`decide`, `closeStep`, `switchVariant`, `withVariant`). Tests: `npx vitest run`.
- `packages/render`: Remotion composition and the `adam` CLI (render, review, still, capcut-prep).
- `packages/web`: the studio. `server/` (Node, `app.ts` routes, `autopilot.ts`, `doctor.ts`, `stats*.ts`, `rules.ts`),
  `app/` (React: `Studio.tsx` steps, `Home.tsx`, `Stats.tsx`, `Library.tsx`, `style.css`, `i18n.ts` FR strings).
- `packages/mcp`: the MCP server Claude/Codex edit projects through. `skills/adam-studio`: the skill (generated, see below).
- `py/analysis`, `py/capcut`: Python venvs (`.venv` inside each).
- Specs: `docs/superpowers/specs/`. DA rules: `docs/da/`.

## Commands

- Web tests: `cd packages/web && npm test` (unit only, one file at a time: run in parallel they time out and step on each other).
- Types: `npx tsc --noEmit -p .` in the package. Model schema JSON: `npm run export-schemas -w @adam-studio/model`
  (other schema files show as modified only by line endings: do not commit them).
- UI build: `cd packages/web && npm run build` (the server serves `dist/`; a page reload picks it up, no restart).
- Server: port 4317, started detached with node + tsx (`server/main.ts`). Restart it only for server code changes, and
  never while a job runs (check `GET /api/projects/<name>` jobs, `GET /api/projects/<name>/auto`).
- Skill: rules live in `packages/web/server/rules.ts`; `npm run skill` regenerates and installs the skill (a test fails on drift).
- Setup kit: `npm run setup` (also postinstall and first launch of `Adam Studio.cmd`).

## Checking UI changes cheaply

- Headless Chrome with CDP on 9223:
  `chrome --headless=new --remote-debugging-port=9223 --user-data-dir=%TEMP%/chrome-shot`
- `W=1440 H=900 node packages/web/scripts/shot.mjs <url> out.png 6000 "<js>"`: the js result prints to stdout.
  **Measure with js first** (`document.documentElement.scrollHeight` vs `innerHeight`, element widths, text present);
  read a screenshot only once, at the end, cropped to the part that changed.
- Fixed-size layout: a feature never grows the page or squashes a column. Check every step at 1440x900 and 1280x720.
- Test on a demo project, not on the creator's projects (WAMI): a second instance with its own settings
  (`createApp({ settingsFile })` on port 4399, `projectsRoot` in that ui.json) and `makeSynthetic` from
  `packages/render/tests/e2e/synthetic.ts`.

## Default art direction

- The spec is `docs/da/da-par-defaut.md` (v2): each section says what is in place and what is left. Taste lives in
  style.json and looks; what is derived from the rush is computed and cached; levels, safe zone and thresholds are
  engine constants, never exposed.
- Sound: voice chain at analysis (edit v2), ducking and breaths from `timeline.speech`, loudness and the export gate in
  `render/src/lib/loudness.ts` (a refused export is renamed `.refused.mp4`).
- Captions: treatment and height from `py/analysis/adam_analysis/legibility.py`, called at render, cached in
  `cache/legibility.json` (bump VERSION in `render/src/lib/legibility.ts` when the rules change).

## Language

- The interface is translated by `app/translate.ts` from the dictionary `app/i18n-fr.ts` (exact texts + patterns):
  a new English string needs its French there. Check with a French crawl of every page.
- What Adam writes (labels, titles, captions, analyses, first pass) follows `uiLang` in settings, set by the interface
  when the creator switches; a language named in their request wins.

## Pitfalls already met

- Edit files with the Edit tool. Python or sed replacements fail silently when the text does not match exactly; if a
  script is unavoidable, assert that each replacement matched.
- Windows: accents in file names break paths passed on a command line (`diskName` in `stats-import.ts`); `.cmd`
  files (npm, claude, codex) start only through a shell, and `spawn` throws EINVAL synchronously.
- Real AI calls cost the creator's subscription: unit tests inject fakes; one real end-to-end run at the end, on a demo project.
- Never commit footage, third-party assets, or keys (`~/.adam-studio/.env`). Do not touch CapCut drafts.

## Git

The repository is public (`Michel-cliff/adam-studio-source`) and `main` is protected: work on a branch, push it, open a
pull request, merge it (the maintainer may bypass the review for their own changes). Never push to `main` directly. End
commit messages with the Co-Authored-By line.

- The creator's art direction (`~/.adam-studio/`: `das/`, `da.json`, `stats.json`, their fonts and media) stays on their
  machine: never commit it. Only engine code that helps any art direction is pushed.
- Releases go to `Michel-cliff/adam-studio-releases` (see `docs/INSTALLATION-WINDOWS.md`), built from the maintainer's
  machine. Installers are not signed yet (no certificate). Keep `packages/desktop/out/make/squirrel.windows/x64`
  between versions: the delta is built from it.
- Never commit certificates, keys or tokens (`.gitignore` blocks the usual extensions, but check before every push).
