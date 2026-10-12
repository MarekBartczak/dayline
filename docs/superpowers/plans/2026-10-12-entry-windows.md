# Entry window implementation plan

Scope is approved by the user's explicit screenshot corrections. Model assignments indicate task complexity; execution uses the current model.

- [x] Model: gpt-5.4 — Update opacity preferences/helpers and apply opacity uniformly to complete popup actors; verify settings and native effective opacity.
- [x] Model: gpt-5.4 — Reserve vertical scrollbar space, verify card bounds against scrollbar bounds and inspect screenshot.
- [x] Model: GPT-5.5 — Add separate selected-entry editor with list action, independent pin, public draft retention, save and lifecycle cleanup; verify in isolated GNOME.
- [x] Model: gpt-5.4 — Review, check package/installer/UI and install atomically while keeping the native extension disabled. Fresh-runtime activation from that state is verified in isolated GNOME and documented for Looking Glass; the old cached module is not restarted.

Verification: full domain/storage/vault/installer checks, GTK settings, main Shell UI, Private lifecycle, independent entry windows with native application copy/paste and HiDPI geometry, and the exact installed-runtime update from disabled/active states all passed. Entry-window teardown has no disposed-actor or off-stage measurement errors. Detached editor guards and draft preservation were reviewed and tested.
