"""Installer recovery and immutable-runtime checks using temporary XDG data."""
import os
from pathlib import Path
import subprocess
import tempfile

project = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="dayline-install-test-") as temporary:
    root = Path(temporary)
    data = root / "data" / "dayline"
    data.mkdir(parents=True)
    sentinel = data / "data.json"
    sentinel.write_text("personal-data-sentinel")
    env = {**os.environ, "XDG_DATA_HOME": str(root / "data"), "DAYLINE_SKIP_ENABLE": "1"}
    fake_bin = root / "bin"
    fake_bin.mkdir()
    cp = fake_bin / "cp"
    cp.write_text('#!/bin/bash\ncount=$(cat "$DAYLINE_COPY_COUNT" 2>/dev/null || echo 0)\ncount=$((count + 1))\nprintf "%s" "$count" > "$DAYLINE_COPY_COUNT"\nif [[ "$count" == 3 ]]; then exit 1; fi\nexec /bin/cp "$@"\n')
    cp.chmod(0o755)
    interrupted = subprocess.run(["bash", "scripts/install.sh"], cwd=project,
        env={**env, "PATH": f"{fake_bin}:{os.environ['PATH']}", "DAYLINE_COPY_COUNT": str(root / "count")}, capture_output=True)
    assert interrupted.returncode != 0, "copy failure must be reported"
    target = root / "data/gnome-shell/extensions/dayline@marekbartczak.github.io"
    snapshots = target / "runtimes"
    assert not any(path.name.startswith("0.2.0-") for path in snapshots.iterdir()), "failed installation must not publish incomplete immutable snapshot"
    subprocess.run(["bash", "scripts/install.sh"], cwd=project, env=env, check=True)
    pointer = (target / "current-runtime").read_text().strip()
    snapshot = Path(pointer)
    assert snapshot.is_dir()
    for name in ["extension.js", "ui/pinning.js", "ui/appearance.js", "schemas/gschemas.compiled", "icons/expand-symbolic.svg"]:
        assert (snapshot / name).is_file(), name
    before = (snapshot / "extension.js").read_bytes()
    subprocess.run(["bash", "scripts/install.sh"], cwd=project, env=env, check=True)
    assert (target / "current-runtime").read_text().strip() == pointer
    assert (snapshot / "extension.js").read_bytes() == before
    assert sentinel.read_text() == "personal-data-sentinel"
    assert not any(path.name.startswith(".staging-") for path in snapshots.iterdir())
print("PASS: interrupted installation recovery, immutable snapshots and personal-data preservation")
