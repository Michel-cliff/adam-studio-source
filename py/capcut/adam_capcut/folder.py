"""The CapCut project folder, with the safety rules carried over from the lab."""
import json
import os
import re
import shutil
import time
import uuid
from pathlib import Path

from .errors import ExportError

MARKER = ".adam_studio_export"
# Written by CapCut when it opens a project (absent from the template): the creator may have edited it there.
CAPCUT_OPENED = ("draft_content.json", "draft_cover.jpg", "Timelines")


def default_projects_root() -> Path:
    return Path(os.path.expandvars(r"%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft"))


def prepare_project_dir(root: Path, name: str, template: Path, replace: bool = False) -> Path:
    """A fresh CapCut project folder from the template. Only folders this exporter created are replaced, never
    while CapCut has them open, and not after CapCut opened them unless `replace` (edits made there are lost)."""
    dest = Path(root) / name
    if dest.exists():
        if not (dest / MARKER).exists():
            raise ExportError(f'CapCut project "{name}" exists and was not created by Adam Studio: refusing to overwrite it. Pick another --name.')
        if (dest / ".locked").exists():
            raise ExportError(f'CapCut project "{name}" is open in CapCut: close it there, then export again.')
        if not replace and any((dest / f).exists() for f in CAPCUT_OPENED):
            raise ExportError(f'CapCut project "{name}" has been opened in CapCut since the last export: edits made there '
                              "would be lost. Pass --replace to overwrite it, or pick another --name.")
        shutil.rmtree(dest)
    shutil.copytree(template, dest)
    # Marked right away, so an export that fails halfway can be redone over it.
    (dest / MARKER).touch()
    (dest / "media").mkdir(exist_ok=True)
    return dest


def _blank_ids(path: Path) -> None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    changed = False
    for key in ("platform", "last_modified_platform"):
        block = data.get(key)
        if isinstance(block, dict):
            for field in ("device_id", "hard_disk_id", "mac_address"):
                if block.get(field):
                    block[field] = ""
                    changed = True
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def neutralize(dest: Path, title: str) -> None:
    """The template was made on another computer: its folder, name, dates and machine identifiers must not follow every
    export. The project gets its own, with its own id so two exports never pass for the same project."""
    now = time.time()
    meta_file = dest / "draft_meta_info.json"
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    meta.update(draft_fold_path=str(dest), draft_root_path=str(dest.parent), draft_name=title, draft_id=str(uuid.uuid4()).upper(),
                tm_draft_create=int(now * 1_000_000), tm_draft_modified=int(now * 1_000_000))
    meta_file.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    for name in ("draft_info.json", "draft_info.json.bak", "template.tmp", "template-2.tmp"):
        _blank_ids(dest / name)
    settings = dest / "draft_settings"
    if settings.is_file():
        text = re.sub(r"(?m)^(draft_create_time|draft_last_edit_time)=.*$", lambda m: f"{m[1]}={int(now)}", settings.read_text(encoding="utf-8"))
        settings.write_text(re.sub(r"(?m)^real_edit_(keys|seconds)=.*$", lambda m: f"real_edit_{m[1]}=0", text), encoding="utf-8")
