#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$project_dir/dist"
gnome-extensions pack --force \
    --extra-source=model.js --extra-source=formatting.js --extra-source=store.js --extra-source=ui \
    --extra-source=liveUpdate.js \
    --extra-source=vault.js --extra-source=private_vault.py \
    --extra-source=icons --extra-source=LICENSE \
    --out-dir="$project_dir/dist" "$project_dir"
printf 'Package: %s/dist/dayline@marekbartczak.github.io.shell-extension.zip\n' "$project_dir"
