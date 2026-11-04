"""Legibility and placement of the captions, as the default art direction asks, from the frames under them.

For each caption, a few frames of the take at the moments it is on screen: the background under its box (widened by
8 px) gives its treatment (the least that keeps it readable, instead of a thick outline everywhere); the face (box, eye
line, mouth) and the hands in the lower third give its height (never over the eyes or the mouth, up when hands rise
into the band, down when the speaker is framed low); burnt zones are reported.

python -m adam_analysis legibility <spec.json> <out.json>
spec: {"width", "height", "band": [y0, y1], "takes": {asset: edit.mp4}, "items": [{"id", "box": [x0, y0, x1, y1], "samples": [{"take", "ms"}]}]}
out: {id: {"treatment": 0..3, "y": centre in px, "burnt": share}}
"""
import json
from pathlib import Path

import cv2
import numpy as np

DILATE = 8
MARGIN = 24  # breathing room inside the safe zone
SAFE_TOP = 269  # top of the safe zone on a 1920 high frame


def ladder(mean: float, std: float) -> int:
    """0 soft shadow (dark, calm), 1 stronger shadow (dark, busy), 2 outline 3 px (mid or light), 3 plate (light, busy)."""
    if mean < 0.25:
        return 0 if std < 0.10 else 1
    if mean >= 0.5 and std >= 0.10:
        return 3
    return 2


def measure(gray: np.ndarray, box: tuple[int, int, int, int]) -> tuple[float, float]:
    """Mean luminance and its spread (0..1) under the box widened by 8 px."""
    h, w = gray.shape[:2]
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = max(0, x0 - DILATE), max(0, y0 - DILATE), min(w, x1 + DILATE), min(h, y1 + DILATE)
    region = gray[y0:y1, x0:x1]
    if region.size == 0:
        return 0.0, 0.0
    return round(float(region.mean()), 4), round(float(region.std()), 4)


def burnt(gray: np.ndarray) -> float:
    """The share of clipped pixels (blown highlights)."""
    return float((gray >= 0.98).mean())


_cascades: dict[str, cv2.CascadeClassifier] = {}


def _cascade(name: str) -> cv2.CascadeClassifier:
    if name not in _cascades:
        _cascades[name] = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / name))
    return _cascades[name]


def face_box(bgr: np.ndarray) -> tuple[int, int, int, int] | None:
    """Largest face, including a tilted head. Rotate detection only, never the video."""
    small = cv2.equalizeHist(cv2.cvtColor(cv2.resize(bgr, (bgr.shape[1] // 2, bgr.shape[0] // 2)), cv2.COLOR_BGR2GRAY))
    height, width = small.shape
    candidates = []
    for angle in (0, -15, 15):
        matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1)
        image = small if angle == 0 else cv2.warpAffine(small, matrix, (width, height))
        faces = _cascade("haarcascade_frontalface_default.xml").detectMultiScale(image, 1.05, 4, minSize=(60, 60))
        inverse = cv2.invertAffineTransform(matrix)
        for x, y, w, h in faces:
            corners = np.array([[[x, y], [x + w, y], [x, y + h], [x + w, y + h]]], dtype=np.float32)
            points = cv2.transform(corners, inverse)[0]
            x0, y0 = np.maximum(points.min(axis=0), 0)
            x1, y1 = np.minimum(points.max(axis=0), (width, height))
            candidates.append((int(x0 * 2), int(y0 * 2), int((x1 - x0) * 2), int((y1 - y0) * 2)))
        # An unrotated close-up is reliable; small detections can be a hand or poster,
        # so check for a larger tilted face before choosing one of those.
        if angle == 0 and candidates and max(c[2] for c in candidates) >= bgr.shape[1] * 0.30:
            break
    return max(candidates, key=lambda f: f[2] * f[3]) if candidates else None


def eyes_mouth(face: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """The no-text band of a face: from its eye line to below its mouth (face proportions of the detector's box)."""
    x, y, w, h = face
    return x, y + int(h * 0.25), w, int(h * 0.57)


def hands_low(bgr: np.ndarray, face: tuple[int, int, int, int] | None, band: tuple[int, int]) -> float:
    """The share of the caption band covered by skin, the skin learned from the face (so any skin tone works)."""
    if face is None:
        return 0.0
    ycc = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb).astype(np.float32)
    x, y, w, h = face
    core = ycc[y + h // 4: y + 3 * h // 4, x + w // 4: x + 3 * w // 4].reshape(-1, 3)
    if core.size == 0:
        return 0.0
    mu, sd = core[:, 1:].mean(axis=0), np.maximum(core[:, 1:].std(axis=0), 4.0)
    region = ycc[band[0]:band[1], :, 1:]
    skin = (np.abs(region - mu) <= 2.5 * sd).all(axis=2)
    # The face itself, when framed low, is not a hand.
    fy0, fy1 = max(band[0], y) - band[0], min(band[1], y + h) - band[0]
    if fy1 > fy0:
        skin[fy0:fy1, max(0, x):x + w] = False
    return float(skin.mean())


def place(y: int, half: int, face: tuple[int, int, int, int] | None, hands: float, band: tuple[int, int], safe_top: int = SAFE_TOP, keep_band: bool = False) -> int:
    """The caption's centre, always inside the band with its breathing room at the bottom.

    The eyes and the mouth come first: of the three spots (where it is, the top of the band, the bottom), only those
    clear of the eyes-to-mouth band count; hands rising into the band (over 15 % of it) send it to the highest of those.
    When no spot is clear (a close-up framed low fills the band), the caption goes just above the head, still inside
    the safe zone; when there is no room there either, the spot of the band that overlaps the face least.
    """
    top, bottom = band[0] + half, band[1] - MARGIN - half
    here = max(top, min(bottom, y))
    spots = [here, top, bottom] if hands <= 0.15 else [top, here, bottom]
    if face is None:
        return spots[0]
    _, fy, _, fh = eyes_mouth(face)
    overlap = lambda c: max(0, min(c + half, fy + fh) - max(c - half, fy))  # noqa: E731
    clear = [c for c in spots if overlap(c) == 0]
    if clear:
        return clear[0]
    above = face[1] - MARGIN - half
    # On a tie, the lowest spot: rather over the chin than over the eyes.
    return above if not keep_band and above - half >= safe_top + MARGIN else min(spots, key=lambda c: (overlap(c), -c))


def _frame(cap: cv2.VideoCapture, ms: float) -> np.ndarray | None:
    cap.set(cv2.CAP_PROP_POS_MSEC, ms)
    ok, frame = cap.read()
    return frame if ok else None


def run(spec_path: str, out_path: str) -> None:
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    band = tuple(spec["band"])
    caps = {take: cv2.VideoCapture(path) for take, path in spec["takes"].items()}
    # A frame where the face is missed borrows the last one found in the same take: a speaker does not jump.
    last_face: dict[str, tuple[int, int, int, int]] = {}
    out: dict[str, dict] = {}
    for item in spec["items"]:
        x0, y0, x1, y1 = item["box"]
        y, half = (y0 + y1) // 2, (y1 - y0) // 2
        worst, ys, burns = 0, [], []
        for s in item["samples"]:
            cap = caps.get(s["take"])
            frame = _frame(cap, s["ms"]) if cap is not None else None
            if frame is None:
                continue
            frame = cv2.resize(frame, (spec["width"], spec["height"]))
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
            face = face_box(frame) or last_face.get(s["take"])
            if face is not None:
                last_face[s["take"]] = face
            ys.append(y if spec.get("manualPlacement", False) else place(y, half, face, hands_low(frame, face, band), band, spec.get("safeTop", SAFE_TOP), spec.get("keepBand", False)))
            worst = max(worst, ladder(*measure(gray, (x0, ys[-1] - half, x1, ys[-1] + half))))
            burns.append(burnt(gray))
        # One height for the whole caption (the most constrained of its frames), one treatment (the strongest needed).
        out[item["id"]] = {"treatment": worst, "y": max(ys, key=lambda v: abs(v - y)) if ys else y,
                           "burnt": round(max(burns), 3) if burns else 0.0}
    # Captions sent above the head share one height, the highest (clear on every frame): a few pixels of difference
    # between faces found on different frames would make them jitter from one caption to the next.
    above = [v["y"] for v in out.values() if v["y"] < band[0]]
    for v in out.values():
        if above and v["y"] < band[0]:
            v["y"] = min(above)
    # The face of each shot, in its middle: the edge blur of the default art direction is shaped around it.
    shots: dict[str, list[int] | None] = {}
    for shot in spec.get("shots", []):
        cap = caps.get(shot["take"])
        frame = _frame(cap, shot["ms"]) if cap is not None else None
        face = face_box(cv2.resize(frame, (spec["width"], spec["height"]))) if frame is not None else None
        shots[shot["id"]] = list(face) if face else None
    if spec.get("shots") is not None:
        out["_shots"] = shots
    for cap in caps.values():
        cap.release()
    Path(out_path).write_text(json.dumps(out), encoding="utf-8")
