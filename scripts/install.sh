#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
uuid='dayline@marekbartczak.github.io'
target="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
mkdir -p "$target"
cp "$project_dir"/{extension.js,metadata.json,model.js,store.js,vault.js,private_vault.py,prefs.js,liveUpdate.js,stylesheet.css,LICENSE} "$target/"
cp -R "$project_dir"/{ui,icons,schemas} "$target/"
glib-compile-schemas --strict "$target/schemas"
# Fresh URLs avoid GNOME's ES module cache during a live update. Reuse only
# identical snapshots; existing loaded snapshots are never changed in place.
snapshot_id="$(sha256sum "$project_dir"/*.js "$project_dir/private_vault.py" "$project_dir"/ui/*.js "$project_dir"/icons/*.svg "$project_dir"/schemas/*.xml "$project_dir/metadata.json" "$project_dir/stylesheet.css" | sha256sum | cut -c1-12)"
snapshot="$target/runtimes/0.2.0-$snapshot_id"
mkdir -p "$target/runtimes"
if [[ ! -d "$snapshot" ]]; then
    staging="$(mktemp -d "$target/runtimes/.staging-XXXXXX")"
    trap 'rm -rf -- "$staging"' EXIT
    cp "$target"/{extension.js,metadata.json,model.js,store.js,vault.js,private_vault.py,prefs.js,liveUpdate.js,stylesheet.css,LICENSE} "$staging/"
    cp -R "$target"/{ui,icons,schemas} "$staging/"
    mv -T -- "$staging" "$snapshot"
    trap - EXIT
fi
pointer_temp="$(mktemp "$target/.current-runtime-XXXXXX")"
printf '%s\n' "$snapshot" > "$pointer_temp"
mv -f -- "$pointer_temp" "$target/current-runtime"
printf 'Installed Dayline in %s\n' "$target"
if [[ ${DAYLINE_SKIP_ENABLE:-0} == 1 ]]; then exit 0; fi
if gnome-extensions enable "$uuid"; then
    printf 'Dayline is enabled. Loaded code updates need next login or the Looking Glass live-update command in README.\n'
else
    # First-time Wayland discovery happens on next login. Schedule only Dayline
    # for that login while preserving every other extension preference.
    gjs -c 'const Gio = imports.gi.Gio;
        const settings = new Gio.Settings({schema_id: "org.gnome.shell"});
        const uuid = "dayline@marekbartczak.github.io";
        const enabled = settings.get_strv("enabled-extensions");
        if (!enabled.includes(uuid)) settings.set_strv("enabled-extensions", [...enabled, uuid]);
        const disabled = settings.get_strv("disabled-extensions");
        if (disabled.includes(uuid)) settings.set_strv("disabled-extensions", disabled.filter(item => item !== uuid));
        Gio.Settings.sync();'
    printf 'Dayline will enable on your next GNOME login. On Wayland, log out and back in.\n'
fi
