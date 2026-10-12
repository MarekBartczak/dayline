#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
bash "$project_dir/scripts/package.sh"
cd "$project_dir"
runtime_dir="$(mktemp -d -t dayline-runtime-XXXXXX)"
trap 'rm -rf --one-file-system -- "$runtime_dir" 2>/dev/null || true' EXIT
XDG_RUNTIME_DIR="$runtime_dir" XDG_CONFIG_HOME="$runtime_dir/config" \
XDG_DATA_HOME="$runtime_dir/data" XDG_CACHE_HOME="$runtime_dir/cache" \
GIO_USE_VFS=local GSETTINGS_BACKEND=keyfile \
SHELL_BACKGROUND_IMAGE="$project_dir/tests/background.svg" \
timeout 60s dbus-run-session -- gnome-shell-test-tool --headless \
    --extension "${DAYLINE_TEST_EXTENSION:-$project_dir/dist/dayline@marekbartczak.github.io.shell-extension.zip}" \
    "${DAYLINE_TEST_SCRIPT:-$project_dir/tests/shell.js}" 2>&1 | tee "$runtime_dir/shell.log"
# Automation can finish successfully despite an extension destroy-handler error.
# Check before compositor shutdown: GNOME 50's own IBus teardown can dispatch
# callbacks to disposed candidate-popup actors in its shutdown main loop.
awk '/Shutting down GNOME Shell/ {exit} {print}' "$runtime_dir/shell.log" > "$runtime_dir/active.log"
if grep -Eq 'JS ERROR|Script failed|already disposed|Gjs-CRITICAL' "$runtime_dir/active.log"; then
    printf 'FAIL: native GNOME session reported a JavaScript or disposed-object error\n' >&2
    exit 1
fi
