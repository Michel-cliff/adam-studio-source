import numpy as np

from adam_analysis.accent import dominant_hue, oklch


def frame(bgr):
    return np.full((480, 270, 3), bgr, dtype=np.uint8)


def test_oklch_reads_a_known_colour():
    l, c, h = oklch(np.array([[[47, 107, 255]]], dtype=np.uint8))  # BGR orange-red
    assert 0.6 < float(l.mean()) < 0.75 and float(c.mean()) > 0.15 and 30 < float(h.mean()) < 45


def test_the_hue_of_the_set_wins_the_skin_is_masked():
    f = frame((200, 120, 40))           # a blue wall (BGR)
    f[150:330, 80:190] = (90, 120, 170)  # a face, skin tone
    hue = dominant_hue([f, f], [(80, 150, 110, 180), (80, 150, 110, 180)])
    assert hue is not None and 230 < hue < 270


def test_a_grey_rush_gives_no_hue():
    assert dominant_hue([frame((128, 128, 128))], [None]) is None
