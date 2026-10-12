# Native formatted tasks and notes

The user wants bold, italic, bulleted/numbered lists, and selection-to-code in the expanded editor. Formatting remains visible in compact views; formatting controls appear only when expanded. Code stays inside the same entry in a nested frame with a copy icon, preserving whitespace and indentation.

Use native Pango attributes on the existing editable Clutter.Text, plus non-modal code-frame overlays inside its scrolling document. Preserve one popup, pin, opacity, clipboard, selection, 50k task text and scrolling. Formatting is a validated optional `format` array alongside existing plain text: `{type: 'bold' | 'italic' | 'code', start, end}` uses Unicode character offsets. Public and encrypted private entries/drafts persist it; legacy plain entries require no conversion. Literal HTML or markup in pasted text remains literal. Code frames copy only their complete code content. Lists use editable textual prefixes.

Private annotations stay inside the encrypted vault; close/lock removes their actors and pending rendering callbacks. The portable formatting module validates ranges, remaps them during edits, and transforms selections. Unknown or invalid formatting is rejected before writes.

Update README in clear English and replace screenshots with synthetic current examples: dark/light today views, themes, calendar, notes, formatted compact/expanded editor and nested code/copy. No personal tasks or decrypted private content in published images. Install only on this desktop; the laptop remains deferred until the user tests.
