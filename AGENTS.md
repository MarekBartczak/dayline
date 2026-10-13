# GNOME operations

The user requires **disable → change → verify → enable** for GNOME changes.

- Before changing installed extension files, disable the affected extension and verify that its lifecycle has finished. Do not kill or restart the user's compositor.
- Build and test changes in isolated temporary GNOME sessions. Never test a suspected compositor crash in the user's session.
- Verify UI controls with actual pointer events, including popup animations, pin/unpin and unpinned-window clicks. Run `tests/pointerInput.js` and `tests/longEditor.js` through `scripts/test-shell.sh`; direct signal emission does not exercise captured input routing.
- For formatting changes, run `tests/richFormatting.js`, `tests/formatDrafts.js` and `tests/privateShell.js`. Verify native selection/copy/paste, compact code-frame sizing, theme foreground and encrypted draft restoration. Register custom GTypes with runtime-specific names so successive immutable snapshots can coexist.
- Also run `tests/formatPointer.js` and `tests/formatHitArea.js`, pinned and unpinned. Drag selections with native pointer events, then move directly to the toolbar. Direct hit queries alone miss Mutter's cached pointer target after scrolling.
- Run `tests/editorHitArea.js` pinned and unpinned for changes to editor input. Empty padding must focus the native text document and choose the nearest caret position; image/copy/scrollbar controls retain their own events.
- Do not overwrite compiled schemas in place. GLib can retain memory mappings after an extension is disabled. Compile separately and publish files atomically; keep runtime snapshots immutable.
- Verify ACTIVE after enabling. On installation or activation failure, leave the affected extension disabled and explain the failure.
- Preserve task and vault data and other extensions' settings. Restore a global crash-recovery switch only after verifying the affected extension is disabled.

# Test data isolation

- Set XDG_DATA_HOME, XDG_CONFIG_HOME and GSETTINGS_BACKEND before launching a test process. GLib caches these paths during GI initialization; changing them later does not isolate storage.
- Any test using default Store or ImageStore paths must assert the resolved data and attachment directories are inside its temporary root before its first write. Never exercise imports/restores against personal data.
- Run image clipboard/file-picker/preview regressions (`tests/taskImages.js`) pinned and unpinned. The virtual pointer must start outside the top bar before opening a modal panel programmatically.
