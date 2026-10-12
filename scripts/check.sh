#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
TZ=Europe/Warsaw node --test tests/model.test.js
TZ=America/Los_Angeles node --test tests/model.test.js
gjs -m tests/storage.js
for source in extension.js model.js store.js prefs.js ui/*.js tests/*.js; do
    node --check "$source"
done
glib-compile-schemas --strict --dry-run schemas
for script in scripts/*.sh; do
    bash -n "$script"
done
printf 'PASS: domain, storage, JS syntax, schema and shell syntax\n'
