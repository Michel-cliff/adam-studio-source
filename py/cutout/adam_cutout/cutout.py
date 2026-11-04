"""Paper cut-outs for the edit: an image with its background removed (rembg, on this machine), cropped to the object."""
import numpy as np


def crop_to_alpha(rgba: np.ndarray, margin: int = 12, threshold: int = 16) -> np.ndarray:
    """The image cropped to what its alpha keeps, with a margin (for the white paper edge drawn round it)."""
    ys, xs = np.nonzero(rgba[:, :, 3] > threshold)
    if len(xs) == 0:
        raise ValueError("nothing left once the background is removed")
    h, w = rgba.shape[:2]
    y0, y1 = max(0, ys.min() - margin), min(h, ys.max() + 1 + margin)
    x0, x1 = max(0, xs.min() - margin), min(w, xs.max() + 1 + margin)
    return rgba[y0:y1, x0:x1]


def run(src: str, dst: str) -> None:
    import cv2
    from rembg import new_session, remove
    img = cv2.imread(src, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"not an image: {src}")
    rgba = remove(img, session=new_session("u2net"))
    cv2.imwrite(dst, crop_to_alpha(np.asarray(rgba)))
