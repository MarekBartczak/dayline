#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
uuid='dayline@marekbartczak.github.io'
target="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
wait_for_state() {
    local expected="$1" info
    for ((attempt = 0; attempt < 100; attempt++)); do
        info="$(LC_ALL=C gnome-extensions info "$uuid" 2>/dev/null)" || return 1
        if [[ $expected == inactive ]]; then
            case "$info" in *'State: INACTIVE'*|*'State: INITIALIZED'*) return 0 ;; esac
        else
            case "$info" in *'State: ACTIVE'*) return 0 ;; esac
        fi
        case "$info" in *'State: ERROR'*|*'State: OUT OF DATE'*) return 1 ;; esac
        sleep 0.1
    done
    return 1
}
# Stop this extension before changing any installed files. A failed install
# leaves it disabled; unrelated extensions and their preferences are untouched.
if [[ ${DAYLINE_SKIP_ENABLE:-0} != 1 ]] && gnome-extensions info "$uuid" >/dev/null 2>&1; then
    gnome-extensions disable "$uuid"
    if ! wait_for_state inactive; then
        printf 'Dayline did not stop successfully; installed files were not changed.\n' >&2
        exit 1
    fi
fi
mkdir -p "$target/runtimes"
staging='' file_temp='' pointer_temp=''
cleanup() {
    [[ -z "$staging" ]] || rm -rf -- "$staging"
    [[ -z "$file_temp" ]] || rm -f -- "$file_temp"
    [[ -z "$pointer_temp" ]] || rm -f -- "$pointer_temp"
    return 0
}
trap cleanup EXIT
# Fresh URLs avoid GNOME's ES module cache during a live update. Reuse only
# identical snapshots; existing loaded snapshots are never changed in place.
snapshot_id="$(sha256sum "$project_dir"/*.js "$project_dir/private_vault.py" "$project_dir/image_worker.py" "$project_dir"/ui/*.js "$project_dir"/icons/*.svg "$project_dir"/schemas/*.xml "$project_dir/metadata.json" "$project_dir/stylesheet.css" | sha256sum | cut -c1-12)"
snapshot="$target/runtimes/0.4.1-$snapshot_id"
if [[ ! -d "$snapshot" ]]; then
    staging="$(mktemp -d "$target/runtimes/.staging-XXXXXX")"
    cp "$project_dir"/{extension.js,metadata.json,model.js,images.js,imageStore.js,image_worker.py,formatting.js,store.js,vault.js,private_vault.py,prefs.js,liveUpdate.js,stylesheet.css,LICENSE} "$staging/"
    cp -R "$project_dir"/{ui,icons} "$staging/"
    mkdir "$staging/schemas"
    cp "$project_dir"/schemas/*.xml "$staging/schemas/"
    glib-compile-schemas --strict "$staging/schemas"
    mv -T -- "$staging" "$snapshot"
    staging=''
fi
# Replace every file through rename. In particular, never truncate a compiled
# schema: GLib may still memory map its previous inode after disable().
while IFS= read -r -d '' source_file; do
    relative="${source_file#"$snapshot"/}"
    destination="$target/$relative"
    mkdir -p "$(dirname -- "$destination")"
    file_temp="$(mktemp "$(dirname -- "$destination")/.dayline-install-XXXXXX")"
    cp -- "$source_file" "$file_temp"
    mv -f -- "$file_temp" "$destination"
    file_temp=''
done < <(find "$snapshot" -type f -print0)
pointer_temp="$(mktemp "$target/.current-runtime-XXXXXX")"
printf '%s\n' "$snapshot" > "$pointer_temp"
mv -f -- "$pointer_temp" "$target/current-runtime"
pointer_temp=''
printf 'Installed Dayline in %s\n' "$target"
if [[ ${DAYLINE_SKIP_ENABLE:-0} == 1 ]]; then exit 0; fi
if gnome-extensions enable "$uuid"; then
    if ! wait_for_state active; then
        gnome-extensions disable "$uuid"
        printf 'Dayline did not reach ACTIVE; it remains disabled. Inspect GNOME extension errors before retrying.\n' >&2
        exit 1
    fi
    printf 'Dayline is ACTIVE. Loaded code updates need next login or the Looking Glass live-update command in README.\n'
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
