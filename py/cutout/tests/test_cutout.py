import numpy as np
import pytest

from adam_cutout.cutout import crop_to_alpha


def test_crop_to_alpha_keeps_the_object_and_a_margin():
    rgba = np.zeros((100, 200, 4), dtype=np.uint8)
    rgba[40:60, 50:90, :] = 255
    out = crop_to_alpha(rgba, margin=5)
    assert out.shape[:2] == (30, 50)
    assert out[:, :, 3].max() == 255


def test_crop_to_alpha_refuses_an_empty_cutout():
    with pytest.raises(ValueError, match="nothing"):
        crop_to_alpha(np.zeros((10, 10, 4), dtype=np.uint8))


@pytest.mark.slow
def test_cutout_removes_a_plain_background(tmp_path):
    import cv2
    from adam_cutout.cutout import run
    img = np.full((240, 320, 3), 235, dtype=np.uint8)
    cv2.circle(img, (160, 120), 60, (30, 60, 200), -1)
    src, dst = tmp_path / "in.png", tmp_path / "out.png"
    cv2.imwrite(str(src), img)
    run(str(src), str(dst))
    out = cv2.imread(str(dst), cv2.IMREAD_UNCHANGED)
    assert out.shape[2] == 4
    assert out[0, 0, 3] < 30 and out[out.shape[0] // 2, out.shape[1] // 2, 3] > 200
