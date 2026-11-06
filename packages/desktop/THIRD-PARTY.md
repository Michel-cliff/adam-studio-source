# Adam Studio: third-party components

Adam Studio itself is under the MIT licence (ADAM-STUDIO-LICENSE.txt). It ships with, or downloads on first use, the components below. Each one stays under its own licence.

## Shipped in the application

| Component | Licence | Source |
|---|---|---|
| FFmpeg and ffprobe (gyan.dev build) | GPL version 3 | https://github.com/FFmpeg/FFmpeg (exact commit in `ffmpeg/README.txt`), https://www.gyan.dev/ffmpeg/builds/ |
| yt-dlp (standalone executable) | GPL version 3 or later for the bundled executable, Unlicense for its source | https://github.com/yt-dlp/yt-dlp (`yt-dlp/`) |
| Deno | MIT | https://github.com/denoland/deno (`deno/`) |
| Remotion | Remotion License, see below | https://github.com/remotion-dev/remotion |
| VectCutAPI | Apache 2.0 | https://github.com/sun-guannan/VectCutAPI |
| pyJianYingDraft | Apache 2.0 | https://github.com/GuanYixuan/pyJianYingDraft |
| House fonts (Anton, DM Serif, Manrope and others) | SIL Open Font License | `fonts/` |
| Electron, Chromium and Node.js | MIT and the licences listed in the application folder | https://github.com/electron/electron |
| Node packages | Listed one by one in `third-party-packages.json` (MIT, ISC, BSD, Apache 2.0, MPL 2.0, CC-BY 4.0) | Each package's own page |
| Python packages | Listed in `python/Lib/site-packages/*.dist-info` | Each package's own page |

FFmpeg and the yt-dlp executable are separate programs that Adam Studio runs; they are not linked into it.

The source code of the FFmpeg and yt-dlp versions shipped with a release is attached to that release, as `AdamStudio-<version>-GPL-sources.zip`: https://github.com/Michel-cliff/adam-studio-releases/releases

Licence texts of the Node packages that do not carry their own file: `npm-notices.txt`.

## Downloaded on first use

| Component | Licence | Source |
|---|---|---|
| Whisper large-v3-turbo model (OpenAI), CTranslate2 conversion | MIT | https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo |
| RobustVideoMatting code and model, commit 53d74c6 | GPL version 3 | https://github.com/PeterL1n/RobustVideoMatting |
| LaMa model | Apache 2.0 | https://github.com/advimman/lama, https://github.com/enesmsahin/simple-lama-inpainting |

RobustVideoMatting and LaMa run during the analysis of an imported video, to separate the speaker from the background. Both are fetched at a fixed version and checked against their SHA-256 before they run. The inpainting steps follow simple-lama-inpainting 0.1.2 (Apache 2.0).

## Remotion

Remotion is free for individuals, for-profit organisations of up to 3 employees, non-profit organisations and evaluation. Larger companies need a Remotion Company License: https://www.remotion.dev/license. Anyone using Adam Studio in a larger company falls under that rule.
