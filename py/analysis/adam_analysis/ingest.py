"""The checks on a take before any work (default art direction): refusing early costs thirty seconds, the same fault
found at run 1 costs a whole run.

Warnings (the work goes on): resolution under 1080 on the short side, frame rate under 25 or variable, a codec that
needs transcoding, a noise floor above -35 dBFS (a noisy room, or sound already mixed in: the take is kept and
Adam adds no sound unless the creator asks). Refused: no sound track.
"""
import json
import re
import subprocess
from pathlib import Path
from functools import lru_cache

from .errors import AnalysisError

FIRST_SECONDS = 10


def noise_floor(path: Path, seconds: float | None = None) -> float:
    """The noise floor in dBFS: the 10th percentile of the level of every 50 ms that is not digital silence (the
    quiet between words, where the room and the mic are heard); -120 when there is no sound at all."""
    st = Path(path).stat()
    return _noise_floor_cached(str(path), st.st_mtime_ns, st.st_size, seconds)


@lru_cache(maxsize=16)
def _noise_floor_cached(path: str, mtime_ns: int, size: int, seconds: float | None) -> float:
    # Audio only: decoding full-resolution video into a null sink adds no measurement.
    # The source stamp prevents a replaced recording from reusing its old measurement.
    args = ["ffmpeg", "-hide_banner", "-nostats", *(["-t", str(seconds)] if seconds else []), "-i", str(path), "-vn", "-sn", "-dn", "-af",
            "asetnsamples=n=2400:p=0,astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=RMS_level,"
            "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-", "-f", "null", "-"]
    r = subprocess.run(args, capture_output=True, text=True)
    levels = sorted(float(v) for v in re.findall(r"RMS_level=(-?[\d.]+)", r.stdout) if float(v) > -90)
    return levels[int(len(levels) * 0.1)] if levels else -120.0


def _streams(path: Path) -> list[dict]:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate",
                        "-of", "json", str(path)], capture_output=True, text=True)
    return json.loads(r.stdout or "{}").get("streams", [])


def _rate(s: str) -> float:
    num, _, den = s.partition("/")
    return float(num) / float(den or 1) if float(den or 1) else 0.0


def ingest_checks(path: Path) -> list[str]:
    """The warnings for this take; raises AnalysisError when it is refused."""
    streams = _streams(path)
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise AnalysisError(f"{path.name}: no picture in this file")
    if not any(s.get("codec_type") == "audio" for s in streams):
        raise AnalysisError(f"{path.name}: no sound track, Adam edits on the voice")
    warnings: list[str] = []
    short = min(int(video.get("width", 0)), int(video.get("height", 0)))
    if short < 1080:
        warnings.append(f"{path.name}: {short} px on the short side (1080 recommended): the picture will be soft")
    fps, avg = _rate(video.get("r_frame_rate", "0/1")), _rate(video.get("avg_frame_rate", "0/1"))
    if avg < 25:
        warnings.append(f"{path.name}: {avg:.0f} frames per second (25 at least recommended)")
    elif fps and abs(fps - avg) > 1:
        warnings.append(f"{path.name}: variable frame rate ({avg:.1f} on average): movement may stutter")
    if video.get("codec_name") not in ("h264", "hevc") or "10" in str(video.get("pix_fmt", "")):
        warnings.append(f"{path.name}: {video.get('codec_name')} {video.get('pix_fmt')}, transcoded to H.264 (a little longer)")
    floor = noise_floor(path, FIRST_SECONDS)
    if floor > -35:
        warnings.append(f"{path.name}: sound at {floor:.0f} dBFS between words (a noisy room, or music already mixed in): the take is kept, and Adam adds no sound unless you ask")
    elif floor > -45:
        warnings.append(f"{path.name}: background noise at {floor:.0f} dBFS, the sound will stay average")
    return warnings
