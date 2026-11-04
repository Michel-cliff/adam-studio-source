"""edit.mp4: the take as the renderer reads it, its voice cleaned once; proxy.mp4: half size for previews."""
import re
import subprocess
from pathlib import Path

from ..errors import AnalysisError
from ..ingest import FIRST_SECONDS, noise_floor

VERSION = 2  # 2: the voice chain of the default art direction
PROXY_VERSION = 3  # Preview encoding only; render inputs retain their original quality.
LONG_SIDE = 1920


def edit_size(w: int, h: int) -> tuple[int, int]:
    """Source aspect kept, longer side 1920, even sizes."""
    if w >= h:
        return LONG_SIDE, round(h * LONG_SIDE / w / 2) * 2
    return round(w * LONG_SIDE / h / 2) * 2, LONG_SIDE


def ffmpeg(args: list[str], what: str) -> None:
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise AnalysisError(f"{what} failed: {r.stderr.strip()[-400:]}")


def voice_filter(floor: float) -> str:
    """The voice chain of the default art direction, applied once to the take.

    A low-cut at 80 Hz (12 dB per octave: handling and table rumble); noise reduction only when the room is loud
    (floor above -50 dBFS), capped at 8 dB, since stronger reduction is heard more than the noise it removes; a light
    de-esser (sibilants around 5 to 8 kHz); compression 3:1 from -18 dB, 10 ms attack, 100 ms release. The final level
    is set on the finished video (-14 LUFS), not here.
    """
    chain = ["highpass=f=80:poles=2"]
    if floor > -50:
        chain.append(f"afftdn=nr=8:nf={round(max(-80.0, min(-20.0, floor)))}")
    chain += ["deesser=i=0.4:m=0.5:f=0.5", "acompressor=threshold=-18dB:ratio=3:attack=10:release=100"]
    return ",".join(chain)


def encode(fps: int, audio_kbps: int) -> list[str]:
    return ["-r", str(fps), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-g", str(fps), "-bf", "0",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", f"{audio_kbps}k"]


def make_edit(src: Path, dst: Path, fps: int) -> None:
    from ..probe import probe

    info = probe(src)
    w, h = edit_size(info["width"], info["height"])
    # ffmpeg applies the rotation flag itself; no -shortest, so the video keeps its last partial frame.
    # The voice is mono at 48 kHz: a phone's stereo voice is correlated noise, not space.
    voice = ["-af", voice_filter(noise_floor(src, FIRST_SECONDS)), "-ac", "1", "-ar", "48000"] if info["hasAudio"] else []
    ffmpeg(["-i", str(src), "-vf", f"scale={w}:{h}:flags=lanczos", *voice, *encode(fps, 192), str(dst)], f"edit.mp4 from {src}")


def make_proxy(edit: Path, dst: Path, fps: int) -> None:
    ffmpeg(["-i", str(edit), "-vf", "scale=trunc(iw/4)*2:trunc(ih/4)*2", *encode(fps, 128), "-preset", "veryfast", "-crf", "23", str(dst)], "proxy.mp4")
