# Connections and API keys

Every key lives in `~/.adam-studio/.env` on your machine (never in the repo), one `NAME=value` per line.
Adam Studio reads it on each search: edit the file, no restart needed.

    PIXABAY_API_KEY=...
    FREESOUND_API_KEY=...

## Asset search (Library page, `search_assets`)

The Inspiration folder (`~/AdamStudioInspiration`) is searched first: it holds your own references (photos, videos,
frames, sounds, fonts, Lottie, notes), dropped there by hand. Online, two free libraries complete it:

- **Pixabay** (photos, videos): your key is on https://pixabay.com/api/docs/ once logged in; set `PIXABAY_API_KEY`.
- **Freesound** (CC0 sounds): https://freesound.org/apiv2/apply/ gives a client id and an API key; set
  `FREESOUND_API_KEY` to the key.

Imported files are copied into `<project>/assets/` and listed in `assets/CREDITS.md` with their license and author.

## What is not connected

Pexels, Openverse, Pinterest, TikTok and Instagram were removed: their keys need a developer app (or are not
delivered), and Openverse was too often down. Watching other creators' public content and trends is not possible
either (no official API, and scraping is ruled out). Drop the references you want studied in the Inspiration folder.
