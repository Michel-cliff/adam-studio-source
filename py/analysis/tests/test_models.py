import hashlib
from pathlib import Path

import pytest

from adam_analysis import models
from adam_analysis.errors import AnalysisError


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Answer:
    def __init__(self, data):
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self, n):
        out, self.data = self.data[:n], self.data[n:]
        return out


@pytest.fixture
def served(monkeypatch):
    calls = []

    def serve(data):
        def urlopen(url, timeout=None):
            calls.append(url)
            return Answer(data)
        monkeypatch.setattr(models.urllib.request, "urlopen", urlopen)
    serve.calls = calls
    return serve


def test_a_changed_download_is_refused_and_left_nowhere(tmp_path, served):
    served(b"evil code")
    dst = tmp_path / "hubconf.py"
    with pytest.raises(AnalysisError, match="not the expected file"):
        models._fetch("https://x/hubconf.py", dst, sha(b"good code"))
    assert list(tmp_path.iterdir()) == []


def test_a_changed_file_in_the_cache_is_replaced_before_it_can_run(tmp_path, served):
    dst = tmp_path / "hubconf.py"
    dst.write_bytes(b"evil code")
    served(b"good code")
    assert models._fetch("https://x/hubconf.py", dst, sha(b"good code")).read_bytes() == b"good code"


def test_a_changed_file_in_the_cache_is_kept_from_running_when_the_download_fails_too(tmp_path, served):
    dst = tmp_path / "big-lama.pt"
    dst.write_bytes(b"evil model")
    served(b"also wrong")
    with pytest.raises(AnalysisError):
        models._fetch("https://x/big-lama.pt", dst, sha(b"good model"))


def test_a_good_file_is_not_downloaded_again(tmp_path, served):
    dst = tmp_path / "rvm.pth"
    dst.write_bytes(b"good")
    served(b"never used")
    models._fetch("https://x/rvm.pth", dst, sha(b"good"))
    assert served.calls == []


def test_every_rvm_file_comes_from_the_fixed_commit(tmp_path, served, monkeypatch):
    monkeypatch.setattr(models.torch.hub, "get_dir", lambda: str(tmp_path))
    monkeypatch.setattr(models, "_sha256", lambda p: sha(Path(p).read_bytes()))
    monkeypatch.setattr(models, "RVM_CODE", {"hubconf.py": sha(b"x"), "model/model.py": sha(b"x")})
    monkeypatch.setattr(models, "RVM_WEIGHTS", ("https://x/w.pth", "w.pth", sha(b"x")))
    served(b"x")
    code, weights = models.ensure_rvm()
    assert models.RVM_COMMIT in code.name and (code / "model" / "model.py").is_file() and weights.is_file()
    assert all(models.RVM_COMMIT in u for u in served.calls[:2])
    assert "master" not in "".join(served.calls)
