"""Installer recovery and immutable-runtime checks using temporary XDG data."""
import os
import mmap
import json
from pathlib import Path
import subprocess
import tempfile

project = Path(__file__).resolve().parent.parent
release = json.loads((project / 'metadata.json').read_text())['version-name']
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
    assert not any(path.name.startswith(f"{release}-") for path in snapshots.iterdir()), "failed installation must not publish incomplete immutable snapshot"
    subprocess.run(["bash", "scripts/install.sh"], cwd=project, env=env, check=True)
    pointer = (target / "current-runtime").read_text().strip()
    snapshot = Path(pointer)
    assert snapshot.is_dir()
    for name in ["extension.js", "ui/pinning.js", "ui/appearance.js", "schemas/gschemas.compiled", "icons/expand-symbolic.svg"]:
        assert (snapshot / name).is_file(), name
    before = (snapshot / "extension.js").read_bytes()
    # GLib memory maps compiled schemas in the compositor. Replacing the file
    # must leave the old inode and its mapping intact for existing readers.
    schema = target / "schemas/gschemas.compiled"
    old_schema = target / "schemas/org.gnome.shell.extensions.dayline.gschema.xml"
    old_schema.write_text('''<schemalist><schema id="org.gnome.shell.extensions.dayline" path="/org/gnome/shell/extensions/dayline/"><key name="appearance" type="s"><default>'system'</default></key></schema></schemalist>''')
    subprocess.run(['glib-compile-schemas', '--strict', str(schema.parent)], check=True)
    with schema.open('rb') as schema_file, mmap.mmap(schema_file.fileno(), 0, access=mmap.ACCESS_READ) as mapping:
        old_inode = schema.stat().st_ino
        old_bytes = mapping[:]
        subprocess.run(["bash", "scripts/install.sh"], cwd=project, env=env, check=True)
        assert schema.stat().st_ino != old_inode, "compiled schema must be replaced atomically instead of overwritten in place"
        assert mapping[:] == old_bytes, "an existing mapped schema must remain unchanged after installation"
    assert (target / "current-runtime").read_text().strip() == pointer
    assert (snapshot / "extension.js").read_bytes() == before
    assert sentinel.read_text() == "personal-data-sentinel"
    assert not any(path.name.startswith(".staging-") for path in snapshots.iterdir())
    # Exercise the real installer control flow with a simulated running Shell.
    # Every copy must happen after disable, and enable must be the last action.
    state = root / 'extension-state'
    trace = root / 'extension-actions'
    state.write_text('active')
    (fake_bin / 'gnome-extensions').write_text('''#!/bin/bash
set -e
case "$1" in
 info) case $(cat "$DAYLINE_TEST_STATE") in active|enabled) printf '  State: ACTIVE\n' ;; error) printf '  State: ERROR\n' ;; *) printf '  State: INACTIVE\n' ;; esac ;;
 disable) printf disabled > "$DAYLINE_TEST_STATE"; [[ ${DAYLINE_TEST_STOP_FAIL:-0} != 1 ]] || printf error > "$DAYLINE_TEST_STATE"; printf 'disable\n' >> "$DAYLINE_TEST_TRACE" ;;
 enable) printf enabled > "$DAYLINE_TEST_STATE"; [[ ${DAYLINE_TEST_ENABLE_FAIL:-0} != 1 ]] || printf error > "$DAYLINE_TEST_STATE"; printf 'enable\n' >> "$DAYLINE_TEST_TRACE" ;;
 *) exit 1 ;;
esac
''')
    (fake_bin / 'gnome-extensions').chmod(0o755)
    cp.write_text('''#!/bin/bash
[[ $(cat "$DAYLINE_TEST_STATE") == disabled ]] || exit 88
printf 'copy\n' >> "$DAYLINE_TEST_TRACE"
exec /bin/cp "$@"
''')
    controlled_env = {**env, 'DAYLINE_SKIP_ENABLE': '0', 'PATH': f"{fake_bin}:{os.environ['PATH']}",
                      'DAYLINE_TEST_STATE': str(state), 'DAYLINE_TEST_TRACE': str(trace)}
    subprocess.run(['bash', 'scripts/install.sh'], cwd=project, env=controlled_env, check=True)
    actions = trace.read_text().splitlines()
    assert actions[0] == 'disable' and actions[-1] == 'enable' and 'copy' in actions
    assert state.read_text() == 'enabled'
    previous_inode = schema.stat().st_ino
    trace.write_text('')
    failed_stop = subprocess.run(['bash', 'scripts/install.sh'], cwd=project,
        env={**controlled_env, 'DAYLINE_TEST_STOP_FAIL': '1'}, capture_output=True)
    assert failed_stop.returncode != 0 and schema.stat().st_ino == previous_inode
    assert trace.read_text().splitlines() == ['disable'], 'failed stop must prevent every installed-file copy'
    state.write_text('active')
    failed_start = subprocess.run(['bash', 'scripts/install.sh'], cwd=project,
        env={**controlled_env, 'DAYLINE_TEST_ENABLE_FAIL': '1'}, capture_output=True)
    assert failed_start.returncode != 0 and state.read_text() == 'disabled', 'failed activation must leave extension disabled'
print("PASS: interrupted install, immutable snapshots, mapped-schema preservation and disable/change/enable order")
