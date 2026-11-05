import pytest

from media import ffmpeg
from adam_analysis.errors import AnalysisError
from adam_analysis.ingest import ingest_checks, noise_floor


# Like speech: a voice 60 % of the time, a quiet room in between (the floor is measured in those gaps).
SPEECH = "sine=frequency=220:duration=3,volume='if(lt(mod(t,1),0.6),0.3,0.003)':eval=frame"


def _clip(path, size="1080x1920", fps=30, audio=SPEECH):
    args = ["-f", "lavfi", "-i", f"color=c=gray:s={size}:r={fps}:d=3"]
    if audio:
        args += ["-f", "lavfi", "-i", audio]
    ffmpeg(*args, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", *(["-c:a", "aac", "-shortest"] if audio else []), str(path))
    return path


def test_a_clean_take_passes(tmp_path):
    assert ingest_checks(_clip(tmp_path / "ok.mp4")) == []


def test_low_resolution_and_frame_rate_are_warnings(tmp_path):
    warnings = ingest_checks(_clip(tmp_path / "small.mp4", size="540x960", fps=24))
    assert any("540" in w for w in warnings) and any("24" in w for w in warnings)


def test_no_sound_and_a_loud_room_are_refused(tmp_path):
    with pytest.raises(AnalysisError, match="no sound"):
        ingest_checks(_clip(tmp_path / "mute.mp4", audio=None))
    with pytest.raises(AnalysisError, match="background noise"):
        ingest_checks(_clip(tmp_path / "hiss.mp4", audio="anoisesrc=d=3:c=white:a=0.2"))


def test_the_noise_floor_ignores_digital_silence(tmp_path):
    clip = _clip(tmp_path / "gap.mp4", audio="anoisesrc=d=3:c=white:a=0.01,volume='if(lt(t,1.5),1,0)':eval=frame")
    assert -60 < noise_floor(clip) < -35


def test_noise_check_reuses_audio_only_measurement_until_source_changes(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from adam_analysis import ingest
    ingest._noise_floor_cached.cache_clear()
    source = tmp_path / "take.mp4"
    source.write_bytes(b"first recording")
    calls = []
    def fake_run(args, **kwargs):
        calls.append(args)
        return SimpleNamespace(stdout="RMS_level=-52\nRMS_level=-48\n")
    monkeypatch.setattr(ingest.subprocess, "run", fake_run)
    assert ingest.noise_floor(source, 10) == ingest.noise_floor(source, 10) == -52
    assert len(calls) == 1 and "-vn" in calls[0]
    source.write_bytes(b"a new recording with a different size")
    ingest.noise_floor(source, 10)
    assert len(calls) == 2
