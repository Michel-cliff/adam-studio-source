"""The accent's hue, derived from the rush (default art direction): the hue that comes back most in the set, never
the skin. Only the hue is kept; lightness and chroma are fixed by the renderer, so the contrast holds at every hue.

python -m adam_analysis accent <spec.json> <out.json>
spec: {"takes": {asset: edit.mp4}, "every_ms": 2000, "max": 60}   out: {"hue": degrees | null}
"""
import json
from pathlib import Path

import cv2
import numpy as np

MIN_CHROMA = 0.04
BIN = 10


def oklch(bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Lightness, chroma and hue (degrees) of every pixel, from sRGB through OkLab."""
    rgb = bgr[..., ::-1].astype(np.float32) / 255.0
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]])
    lms = np.cbrt(lin @ m1.T)
    m2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]])
    lab = lms @ m2.T
    c = np.hypot(lab[..., 1], lab[..., 2])
    h = (np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) + 360) % 360
    return lab[..., 0], c, h


def _histogram(frames: list[np.ndarray], faces: list[tuple[int, int, int, int] | None]) -> tuple[np.ndarray, list[float]]:
    hist = np.zeros(360 // BIN)
    skin: list[float] = []
    for f, face in zip(frames, faces):
        _, c, h = oklch(f)
        keep = c >= MIN_CHROMA
        if face is not None:
            x, y, w, hh = face
            dx, dy = int(w * 0.2), int(hh * 0.2)
            region = (slice(max(0, y - dy), y + hh + dy), slice(max(0, x - dx), x + w + dx))
            face_h = h[region][c[region] >= MIN_CHROMA]
            if face_h.size:
                skin.append(float(np.median(face_h)))
            keep[region] = False
        hist += np.bincount((h[keep] // BIN).astype(int), weights=c[keep], minlength=hist.size)[: hist.size]
    return hist, skin


def top_hues(frames: list[np.ndarray], faces: list[tuple[int, int, int, int] | None], n: int = 3, min_gap: float = 30) -> list[float]:
    """The n hues that come back most in the set, at least 30 degrees apart (the guided path offers them)."""
    hist, _ = _histogram(frames, faces)
    out: list[float] = []
    for b in np.argsort(hist)[::-1]:
        if hist[b] <= 0 or len(out) == n:
            break
        h = float(b * BIN + BIN / 2)
        if all(abs(((h - o + 180) % 360) - 180) >= min_gap for o in out):
            out.append(h)
    return out


def dominant_hue(frames: list[np.ndarray], faces: list[tuple[int, int, int, int] | None]) -> float | None:
    """The mode of the hue histogram (10 degree bins, weighted by chroma over the area), skin and greys left out; when
    the second mode weighs over 80 % of the first, the one farthest from the skin. None when the rush has no colour."""
    hist = np.zeros(360 // BIN)
    skin = []
    for f, face in zip(frames, faces):
        _, c, h = oklch(f)
        keep = c >= MIN_CHROMA
        if face is not None:
            x, y, w, hh = face
            dx, dy = int(w * 0.2), int(hh * 0.2)
            region = (slice(max(0, y - dy), y + hh + dy), slice(max(0, x - dx), x + w + dx))
            face_h = h[region][c[region] >= MIN_CHROMA]
            if face_h.size:
                skin.append(float(np.median(face_h)))
            keep[region] = False
        hist += np.bincount((h[keep] // BIN).astype(int), weights=c[keep], minlength=hist.size)[: hist.size]
    if hist.sum() < 1e-3 * sum(f.shape[0] * f.shape[1] for f in frames):
        return None
    order = np.argsort(hist)[::-1]
    first, second = int(order[0]), int(order[1])
    pick = first
    if hist[second] > 0.8 * hist[first]:
        tone = float(np.median(skin)) if skin else 50.0  # skin tones sit around 50 degrees in OkLCh
        gap = lambda b: abs(((b * BIN + BIN / 2) - tone + 180) % 360 - 180)  # noqa: E731
        pick = max((first, second), key=gap)
    return float(pick * BIN + BIN / 2)


def run(spec_path: str, out_path: str) -> None:
    from .legibility import face_box

    spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    frames, faces = [], []
    for path in spec["takes"].values():
        cap = cv2.VideoCapture(path)
        total = cap.get(cv2.CAP_PROP_FRAME_COUNT) / max(1.0, cap.get(cv2.CAP_PROP_FPS)) * 1000
        t = 0.0
        while t < total and len(frames) < spec.get("max", 60):
            cap.set(cv2.CAP_PROP_POS_MSEC, t)
            ok, f = cap.read()
            if ok:
                small = cv2.resize(f, (270, 480))
                full = face_box(cv2.resize(f, (1080, 1920)))
                faces.append(tuple(v // 4 for v in full) if full else None)
                frames.append(small)
            t += spec.get("every_ms", 2000)
        cap.release()
    hue = dominant_hue(frames, faces) if frames else None
    hues = top_hues(frames, faces) if frames else []
    Path(out_path).write_text(json.dumps({"hue": hue, "hues": hues}), encoding="utf-8")
