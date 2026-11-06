"""The matting and inpainting models, fetched at a fixed version and checked against their SHA-256 before they run.

Both are code as much as data (RobustVideoMatting is Python, LaMa a TorchScript graph), and they run on the creator's
machine: a changed file upstream, or in the cache, is refused and never executed. To move to a new version, change the
commit and the hashes here, and the folder name in packages/web/server/doctor.ts and packages/desktop/runtime.cjs.
"""
import hashlib
import os
import urllib.request
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from .errors import AnalysisError

RVM_COMMIT = "53d74c6826735f01f4406b5ca9075eee27bec094"
RVM_CODE_URL = f"https://raw.githubusercontent.com/PeterL1n/RobustVideoMatting/{RVM_COMMIT}/"
RVM_CODE = {
    "hubconf.py": "dd0ba81acb5fc4a2390a5d152df9d869a285b46ac47190fa0e7ffebc766469f2",
    "LICENSE": "8b1ba204bb69a0ade2bfcf65ef294a920f6bb361b317dba43c7ef29d96332b9b",
    "model/__init__.py": "b0897f863332e0ef783017ab2c24211c633dc10b904a92dde1342c02c714c7ba",
    "model/decoder.py": "f3a8c237ddd6756bf231106d03a00e45ead3c265ae57fb2661aa6bf1f9167af5",
    "model/deep_guided_filter.py": "b0576d4513b6238f77bce018219bd0bbc10c628948c296024cae09f64437fece",
    "model/fast_guided_filter.py": "7d984c58f691eb18d1ac62c00b325714dbf7f464b59ba947e56027a876474fe4",
    "model/lraspp.py": "c35712af044cecca8c216d4fa28611c44df88e8f4a40aad89f2618a14cf5ee17",
    "model/mobilenetv3.py": "6932676d3e0cc100a48d2d2b90a37e45973fce16cefc764b26ac52cd46bc748c",
    "model/model.py": "d8378170659fd21d114096120f9a0ad2fed0550c4d4664927d68f2def3ccd960",
    "model/resnet.py": "639822fcd9469daeb9bff3b9ce24eed9c1fe6e9547d1177d7aea61783268e85b",
}
RVM_WEIGHTS = ("https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3.pth", "rvm_mobilenetv3.pth",
               "3c7c1d92033f7c38d6577c481d13a195d7d80a159b960f4f3119ac7b534cf4f8")
LAMA_WEIGHTS = ("https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt", "big-lama.pt",
                "7ba7aa7ac37a4d41fdbbeba3a2af7ead18058552997e3a3cd1a3b2210c9e6b4c")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _fetch(url: str, dst: Path, sha256: str) -> Path:
    """dst if it is the expected file; otherwise downloaded, checked, and only then put in place."""
    if dst.is_file() and _sha256(dst) == sha256:
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    part = dst.with_name(f"{dst.name}.{os.getpid()}.part")
    try:
        try:
            with urllib.request.urlopen(url, timeout=60) as r, part.open("wb") as out:
                while block := r.read(1 << 20):
                    out.write(block)
        except OSError as e:
            raise AnalysisError(f"cannot download {dst.name} (the first run needs the network): {e}") from None
        if _sha256(part) != sha256:
            raise AnalysisError(f"{dst.name} is not the expected file: refused, nothing was run")
        os.replace(part, dst)
    finally:
        part.unlink(missing_ok=True)
    return dst


def ensure_rvm() -> tuple[Path, Path]:
    """The folder of the RobustVideoMatting code at its fixed commit, and its weights, both checked."""
    code = Path(torch.hub.get_dir()) / f"PeterL1n_RobustVideoMatting_{RVM_COMMIT}"
    for rel, sha256 in RVM_CODE.items():
        _fetch(RVM_CODE_URL + rel, code / rel, sha256)
    url, name, sha256 = RVM_WEIGHTS
    return code, _fetch(url, Path(torch.hub.get_dir()) / "checkpoints" / name, sha256)


def ensure_lama() -> Path:
    url, name, sha256 = LAMA_WEIGHTS
    return _fetch(url, Path(torch.hub.get_dir()) / "checkpoints" / name, sha256)


def load_rvm():
    code, weights = ensure_rvm()
    model = torch.hub.load(str(code), "mobilenetv3", source="local", trust_repo=True, pretrained=False)
    model.load_state_dict(torch.load(weights, map_location="cpu", weights_only=True))
    return model.eval()


def _chw(image: Image.Image) -> np.ndarray:
    a = np.array(image)
    a = np.transpose(a, (2, 0, 1)) if a.ndim == 3 else a[np.newaxis, ...]
    a = a.astype(np.float32) / 255
    _, h, w = a.shape
    # The network needs sides that are multiples of 8.
    return np.pad(a, ((0, 0), (0, -h % 8), (0, -w % 8)), mode="symmetric")


def lama_inpaint(image: Image.Image, mask: Image.Image) -> Image.Image:
    """Fills the white part of mask. Same steps as simple-lama-inpainting 0.1.2 (Apache 2.0), whose Pillow pin was the problem."""
    model = torch.jit.load(ensure_lama(), map_location="cpu").eval()
    img = torch.from_numpy(_chw(image)).unsqueeze(0)
    msk = (torch.from_numpy(_chw(mask)).unsqueeze(0) > 0) * 1
    with torch.inference_mode():
        out = model(img, msk)[0].permute(1, 2, 0).cpu().numpy()
    return Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8))
