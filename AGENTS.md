# GNOME operations

The user requires **disable → change → verify → enable** for GNOME changes.

- Before changing installed extension files, disable the affected extension and verify that its lifecycle has finished. Do not kill or restart the user's compositor.
- Build and test changes in isolated temporary GNOME sessions. Never test a suspected compositor crash in the user's session.
- Verify UI controls with actual pointer events, including popup animations, pin/unpin and unpinned-window clicks. Run `tests/pointerInput.js` and `tests/longEditor.js` through `scripts/test-shell.sh`; direct signal emission does not exercise captured input routing.
- For formatting changes, run `tests/richFormatting.js`, `tests/formatDrafts.js` and `tests/privateShell.js`. Verify native selection/copy/paste, compact code-frame sizing, theme foreground and encrypted draft restoration. Register custom GTypes with runtime-specific names so successive immutable snapshots can coexist.
- Also run `tests/formatPointer.js` and `tests/formatHitArea.js`, pinned and unpinned. Drag selections with native pointer events, then move directly to the toolbar. Direct hit queries alone miss Mutter's cached pointer target after scrolling.
- Do not overwrite compiled schemas in place. GLib can retain memory mappings after an extension is disabled. Compile separately and publish files atomically; keep runtime snapshots immutable.
- Verify ACTIVE after enabling. On installation or activation failure, leave the affected extension disabled and explain the failure.
- Preserve task and vault data and other extensions' settings. Restore a global crash-recovery switch only after verifying the affected extension is disabled.
