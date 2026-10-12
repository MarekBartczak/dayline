# Rich formatting implementation plan

**Goal:** Add visible native formatting in both sizes, expanded-only controls, nested copyable code, and current documentation/screenshots.

**Architecture:** Keep the existing Entry/ScrollView and use Pango attributes plus code-frame overlays. Store plain text and validated optional character-range annotations. A portable helper owns transformations; the native controller owns selection, attributes and code frames.

**Tech stack:** GJS, St, Clutter, Pango; portable JavaScript; existing Python encrypted vault.

### Task 1: Portable formatting and public persistence — Model: gpt-6.1-sol

- [x] Implement `formatting.js` with strict range validation, edit remapping, style toggles, line-list transforms and code-block transforms. Write meaningful pure tests first and run them red/green.
- [x] Extend `model.js` to accept only validated optional `format` annotations, preserve whitespace for formatted text, and retain ordinary legacy CRUD/import behavior. Test persistence and invalid annotations.

### Task 2: Encrypted formatting persistence — Model: gpt-6.1-sol

- [x] Extend `private_vault.py` validation for optional formatting on notes/drafts; keep format fields encrypted. Extend `ui/privateNotes.js` to pass/save/restore format, preserving existing close/lock behavior. Test encrypted round trips and malformed metadata.

### Task 3: Native rendering and input — Model: inherited parent

- [x] Add a native failing regression for the missing formatting controls and selection actions.
- [x] Implement `ui/formatting.js` using the portable helpers, native attributes and code overlays. Integrate with `ui/editor.js`, public draft/save callbacks and row previews.
- [x] Verify actual button/pointer/keyboard input, native paste/indentation, copy-full-code, compact/expanded controls, long text, private locking and cleanup.

### Task 4: Documentation and release — Model: inherited parent

- [x] Capture and inspect synthetic native screenshots, rewrite README around final behavior, and update installer/packaging/version.
- [x] Review all changes; run required native/domain/crypto/install checks. Install only while disabled, verify the immutable runtime and provide the fresh-runtime activation command.

**Release:** Push the verified change to the public repository and confirm GitHub Checks before reporting completion.
