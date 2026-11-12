# Contributing

Thank you for helping. A few rules keep Adam Studio safe for the creators who run it.

## How

1. Fork, branch, open a pull request against `main`. One change per pull request, with its tests.
2. Run the tests of what you touched (`npx vitest run` in the package; the web package one file at a time)
   and the type check (`npx tsc --noEmit -p .`). Say in the pull request what you ran.
3. Keep your art direction, projects, footage, fonts and keys out of the commit.

## What gets extra care

A change to any of these is read line by line and may be refused for reasons that have nothing to do with its quality:

- `packages/desktop/` (what an installer contains and how updates are fetched)
- `package.json`, `package-lock.json` and `py/*/pyproject.toml` (a new dependency runs on every creator's machine)
- anything that downloads, opens a file, starts a program or answers on the network

Adding a dependency needs a reason in the pull request: what it does that cannot be done in a few lines, who
maintains it, and its licence. Do not add install scripts (`postinstall` and the like).

## What not to send

- Generated or minified code, binaries, installers, models, footage or third-party assets.
- Changes to the update feed, the release scripts or the signing settings, unless you opened an issue first.

## Releases

Only the maintainer builds and publishes releases. Opening a pull request never publishes anything.
