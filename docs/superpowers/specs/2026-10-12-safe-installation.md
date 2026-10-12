# Safe GNOME installation — 0.2.1

The original installer copied generated `schemas/gschemas.compiled` over the installed file. GLib had memory mapped that inode in the active 0.1.0 extension. Copying changed the mapped bytes before compilation replaced the file. Opening Dayline then caused `Settings schema 'org.gnome.shell.extensions.dayline' does not contain a key named 'appearance'` and GNOME Shell aborted with signal 6.

GNOME crash recovery set `disable-user-extensions=true`, suppressing unrelated extensions including AI Usage. AI Usage was restored only after Dayline was explicitly disabled and verified absent from enabled extensions.

Installation now disables Dayline and waits for INACTIVE or INITIALIZED before writing installed files. It builds a complete immutable runtime from source XML, compiles schemas separately, and publishes every base file through a temporary file and rename. Existing mapped inodes remain unchanged. It waits for ACTIVE before reporting success, aborts before mutations if stopping fails, and leaves Dayline disabled if activation fails.

Regression evidence: a Python test holds an original one-key schema mapping across installation (fails with the previous installer, passes with the fix). Mocked GNOME lifecycle tests verify stop/copy/start ordering and stop/start failure behavior. An actual isolated compositor test installs over loaded 0.1.0, retains a live Gio.Settings reference, opens the cached original popup safely, then activates the fresh runtime while retaining stored tasks. The full domain/storage/vault/installer checks pass. The main UI rerun after the desktop relogin was blocked by an isolated GNOME test-helper window startup timeout; this is recorded separately from the passing actual installation/crash regression.
