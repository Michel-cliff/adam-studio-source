"""transcript.json: words with timings, in the spoken language (faster-whisper large-v3-turbo on CPU)."""
import hashlib
import subprocess
from pathlib import Path

import numpy as np

from ..errors import AnalysisError

VERSION = 1
MODEL = "mobiuslabsgmbh/faster-whisper-large-v3-turbo"
MODEL_REVISION = "0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf"
MODEL_FILES = {
    "config.json": "b0253ea6c0d3bea6b1e19e91a02acfd3b53f4467362efcb5a3e6b16c9b3a9b7e",
    "preprocessor_config.json": "7ccc62c6f2765af1f3b46c00c9b5894426835a05021c8b9c01eecb6dfb542711",
    "tokenizer.json": "297b13372ac43916285644fb9687add3cc62ee2a1adb60da3dc25cc94c1871fd",
    "vocabulary.json": "c69260f2ab26d659b7c398f9a2b2b48ed0df16c3b47d7326782fd9cba71690c1",
    "model.bin": "e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da",
}
SILENT_RMS = 10 ** (-50 / 20)
NO_SPEECH = 0.6
_model = None


def model():
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel
            from huggingface_hub import snapshot_download
            from huggingface_hub.errors import LocalEntryNotFoundError

            options = dict(repo_id=MODEL, revision=MODEL_REVISION, allow_patterns=list(MODEL_FILES), token=False)
            try:
                folder = Path(snapshot_download(**options, local_files_only=True))
            except LocalEntryNotFoundError:
                folder = Path(snapshot_download(**options))
            if any(not (folder / name).is_file() for name in MODEL_FILES):
                folder = Path(snapshot_download(**options))
            for name, expected in MODEL_FILES.items():
                with (folder / name).open("rb") as stream:
                    if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                        raise AnalysisError(f"invalid Whisper model file: {name}")
            if (folder / "vocabulary.txt").exists():
                raise AnalysisError("unexpected vocabulary.txt in the Whisper model cache")
            _model = WhisperModel(str(folder), device="cpu", compute_type="int8", local_files_only=True)
        except Exception as e:  # first use downloads about 1.6 GB
            raise AnalysisError(f"cannot load Whisper {MODEL} (the first run downloads it, network needed): {e}") from None
    return _model


def audio_samples(edit: Path) -> np.ndarray:
    """16 kHz mono float samples decoded by ffmpeg (faster-whisper 1.2.1's own decoder breaks with PyAV 19)."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(edit), "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True)
    if r.returncode != 0:
        raise AnalysisError(f"cannot decode the audio of {edit}: {r.stderr.decode(errors='replace')[-300:]}")
    return np.frombuffer(r.stdout, dtype="<i2").astype(np.float32) / 32768.0


def transcribe(edit: Path, lang: str | None, has_audio: bool) -> dict:
    if not has_audio:
        return {"lang": lang, "langProbability": None, "words": []}
    audio = audio_samples(edit)
    # Whisper invents words on silence: a near-silent take (below -50 dBFS RMS) has no words.
    if audio.size == 0 or float(np.sqrt(np.mean(audio ** 2))) < SILENT_RMS:
        return {"lang": lang, "langProbability": None, "words": []}
    segments, info = model().transcribe(audio, language=lang, word_timestamps=True, beam_size=5, vad_filter=False,
                                        condition_on_previous_text=False)
    words = []
    for s in segments:
        if s.no_speech_prob > NO_SPEECH:  # a segment Whisper itself rates as non-speech
            continue
        for w in s.words or []:
            text = w.word.strip()
            if not text:
                continue
            start = round(w.start * 1000)
            words.append({"text": text, "startMs": start, "endMs": max(start, round(w.end * 1000)), "p": round(w.probability, 3)})
    return {"lang": info.language, "langProbability": round(info.language_probability, 3), "words": words}
