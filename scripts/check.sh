#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
TZ=Europe/Warsaw node --test tests/model.test.js tests/appearance.test.js
TZ=America/Los_Angeles node --test tests/model.test.js tests/appearance.test.js
gjs -m tests/storage.js
/usr/bin/python3 tests/private_vault.py
gjs -m tests/vault.js
python3 tests/install.py
for source in extension.js model.js store.js vault.js prefs.js liveUpdate.js ui/*.js tests/*.js; do
    node --check "$source"
done
glib-compile-schemas --strict --dry-run schemas
for script in scripts/*.sh; do
    bash -n "$script"
done
printf 'PASS: domain, storage, encrypted vault, installation, JS syntax, schema and shell syntax\n'
