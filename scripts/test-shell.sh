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
    "${DAYLINE_TEST_SCRIPT:-$project_dir/tests/shell.js}"
