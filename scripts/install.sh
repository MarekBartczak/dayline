#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
uuid='dayline@marekbartczak.github.io'
target="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
mkdir -p "$target"
cp "$project_dir"/{extension.js,metadata.json,model.js,store.js,prefs.js,stylesheet.css,LICENSE} "$target/"
cp -R "$project_dir"/{ui,icons,schemas} "$target/"
glib-compile-schemas --strict "$target/schemas"
printf 'Installed Dayline in %s\n' "$target"
if [[ ${DAYLINE_SKIP_ENABLE:-0} == 1 ]]; then exit 0; fi
if gnome-extensions enable "$uuid"; then
    printf 'Dayline enabled. Look for the checkmark in your top bar.\n'
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
