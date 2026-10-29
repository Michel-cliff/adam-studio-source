from media import color_video, ffmpeg

from adam_analysis.check import check_edit, check_proxy
from adam_analysis.probe import probe
from adam_analysis.steps.edit import edit_size, make_edit, make_proxy


def test_edit_size_keeps_the_aspect_with_a_1920_long_side():
    assert edit_size(2160, 3840) == (1080, 1920)
    assert edit_size(3840, 2160) == (1920, 1080)
    assert edit_size(1440, 1080) == (1920, 1440)


def test_edit_follows_the_contract(tmp_path):
    src = color_video(tmp_path / "src.mp4", "540x960", 3)
    make_edit(src, tmp_path / "edit.mp4", 30)
    info = probe(tmp_path / "edit.mp4")
    assert (info["width"], info["height"], info["fps"]) == (1080, 1920, 30)
    assert check_edit(tmp_path / "edit.mp4", 3000, 30, True) == []
    make_proxy(tmp_path / "edit.mp4", tmp_path / "proxy.mp4", 30)
    assert (probe(tmp_path / "proxy.mp4")["width"], probe(tmp_path / "proxy.mp4")["height"]) == (540, 960)
    assert check_proxy(tmp_path / "proxy.mp4", 30) == []


def test_a_rotated_phone_video_is_edited_upright(tmp_path):
    src = color_video(tmp_path / "landscape.mp4", "960x540", 1)
    phone = tmp_path / "phone.mp4"
    ffmpeg("-display_rotation:v:0", "-90", "-i", str(src), "-c", "copy", str(phone))
    make_edit(phone, tmp_path / "edit.mp4", 30)
    info = probe(tmp_path / "edit.mp4")
    assert (info["width"], info["height"], info["rotation"]) == (1080, 1920, 0)


def test_a_silent_source_gives_a_silent_edit(tmp_path):
    make_edit(color_video(tmp_path / "s.mp4", "540x960", 1, audio=False), tmp_path / "edit.mp4", 30)
    assert probe(tmp_path / "edit.mp4")["hasAudio"] is False


def _level(path, af=""):
    import subprocess
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", f"{af}astats=measure_perchannel=none:measure_overall=RMS_level", "-f", "null", "-"],
                       capture_output=True, text=True)
    import re
    return float(re.search(r"RMS level dB: (-?[\d.]+)", r.stderr).group(1))


def test_the_voice_chain_reduces_noise_only_when_the_room_is_loud():
    from adam_analysis.steps.edit import voice_filter
    quiet, loud = voice_filter(-62.0), voice_filter(-42.0)
    assert "afftdn" not in quiet and "highpass=f=80:poles=2" in quiet and "acompressor=threshold=-18dB:ratio=3:attack=10:release=100" in quiet
    assert "afftdn=nr=8:nf=-42" in loud


def test_the_edit_voice_is_mono_48k_without_the_low_rumble(tmp_path):
    import json, subprocess
    src = tmp_path / "rumble.mp4"
    ffmpeg("-f", "lavfi", "-i", "color=c=gray:s=540x960:r=30:d=3", "-f", "lavfi", "-i", "sine=frequency=40:duration=3",
           "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", str(src))
    make_edit(src, tmp_path / "edit.mp4", 30)
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=channels,sample_rate", "-of", "json", str(tmp_path / "edit.mp4")],
                                  capture_output=True, text=True).stdout)["streams"][0]
    assert (s["channels"], s["sample_rate"]) == (1, "48000")
    assert _level(tmp_path / "edit.mp4") < _level(src) - 12
