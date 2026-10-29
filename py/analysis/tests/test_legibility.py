import numpy as np

from adam_analysis.legibility import burnt, hands_low, ladder, measure, place

W, H = 1080, 1920
BAND = (950, 1248)


def gray(value: float) -> np.ndarray:
    return np.full((H, W), value, dtype=np.float32)


def test_the_treatment_is_the_least_that_keeps_the_text_readable():
    assert ladder(0.10, 0.05) == 0   # dark and calm: a soft shadow is enough
    assert ladder(0.10, 0.20) == 1   # dark but busy: a stronger shadow
    assert ladder(0.40, 0.05) == 2   # mid or light: a 3 px outline
    assert ladder(0.40, 0.20) == 2   # mid and busy: still an outline
    assert ladder(0.70, 0.20) == 3   # light and busy (outdoors in daylight): a plate


def test_the_background_is_measured_under_the_text_box_widened_by_8_px():
    img = gray(0.1)
    img[1000:1100, 200:880] = 0.9
    mean, std = measure(img, (200, 1000, 880, 1100))
    assert 0.7 < mean < 0.9 and std > 0.1
    assert measure(gray(0.3), (200, 1000, 880, 1100)) == (0.3, 0.0)


def test_burnt_zones_are_the_share_of_clipped_pixels():
    img = gray(0.5)
    img[:480, :] = 1.0
    assert abs(burnt(img) - 0.25) < 0.01


def test_hands_are_skin_like_pixels_in_the_lower_third_learned_from_the_face():
    img = np.zeros((H, W, 3), dtype=np.uint8)
    skin = (90, 120, 170)  # BGR, a mid skin tone
    img[300:700, 340:740] = skin               # the face
    face = (340, 300, 400, 400)
    assert hands_low(img, face, BAND) < 0.02
    img[1000:1240, 200:880] = skin             # hands raised into the caption band
    assert hands_low(img, face, BAND) > 0.3


def test_captions_move_inside_the_band_away_from_the_mouth_and_the_hands():
    half = 70
    # Nothing in the way: the caption stays where it is.
    assert place(1120, half, None, 0.0, BAND) == 1120
    # The speaker framed low, the mouth at 1100: the caption goes to the bottom of the band.
    face = (340, 650, 400, 480)  # x, y, w, h: eye line around 770, mouth around 1010
    y = place(1120, half, face, 0.0, BAND)
    assert y - half > face[1] + face[3] * 0.82 and y + half <= BAND[1] - 24
    # Hands in the band: the caption goes up to its top.
    assert place(1120, half, None, 0.4, BAND) == BAND[0] + half


def test_the_face_wins_over_the_hands_and_a_full_band_sends_the_caption_above_the_head():
    half = 65
    # A close-up framed low (measured on a real take): the face fills the band, hands and mic below it.
    face = (398, 768, 472, 472)  # eyes-to-mouth band: 886 to 1155
    y = place(1152, half, face, 0.24, BAND)
    # Moving up for the hands would sit on the eyes, the bottom of the band on the mouth: neither. The face fills the
    # band, so the caption goes above the head (top of the face box at 768), still inside the safe zone (from 269).
    assert y == 768 - 24 - half
    # No room above either (a face up to the top of the safe zone): the least overlap, the bottom of the band.
    # (and on a tie, the lowest spot: rather the chin than the eyes).
    assert place(1152, half, (398, 300, 472, 1400), 0.24, BAND) == BAND[1] - 24 - half
    # Framed high, the band free under the mouth: the hands send the caption up, to a free spot.
    high = (398, 300, 472, 472)  # eyes-to-mouth band: 418 to 687
    assert place(1152, half, high, 0.24, BAND) == BAND[0] + half
