# Inline task images implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent domain/helper work; the controller integrates and verifies native UI. Steps use checkbox syntax.

**Goal:** Paste or choose images inside a task, between paragraphs, with full-width previews and enlargement.

**Architecture:** A native text entry stores object replacement characters with image metadata and Unicode offsets. Pango shape attributes reserve image blocks; overlay controls scroll with the text. A separate process validates originals and generates bounded PNG previews; ZIP backups contain public data and referenced originals.

**Tech stack:** GJS, St/Clutter, Pango, GTK4, GdkPixbuf, Python zipfile, Node domain tests, isolated GNOME pointer/keyboard tests.

## API contract

`images.js` exports `IMAGE_MARKER`, `validateImages(text, images)`, `remapImages(before, after, images, hint)`, and `insertImages(text, images, assets, start, end)`. Images have `{id, name, mime, width, height, size, offset}`; id is a SHA256 hex string, offset is a Unicode character index at U+FFFC. Insert returns `{text, images, cursor}` and creates separate image paragraphs. At most 20 attachments, 25 MiB per file, 64 million pixels and 32768 pixels per side.

## Task 1: Domain and migration — Model: GPT-6 (inherited session)

Files: `images.js`, `model.js`, `tests/images.test.js`, `tests/model.test.js`, `tests/storage.js`.

- [x] Write and run failing tests: insert into `beforeafter` at 6 produces `before\n\uFFFC\nafter`; Unicode offsets, selected replacement, multiple images, marker deletion, malformed metadata and unknown document versions fail validation.
- [x] Implement the API above; migrate canonical documents to version 3 while accepting versions 1 and 2. Permit image-only tasks, preserve metadata on edits/removal/Undo, and reject image fields on notes.
- [x] Run `node --test tests/model.test.js tests/images.test.js` and `gjs -m tests/storage.js`; inspect migration and original backup bytes.

## Task 2: Image worker, storage and backups — Model: GPT-6 (inherited session)

Files: `image_worker.py`, `imageStore.js`, `tests/image_worker.test.py`, `prefs.js`.

- [x] Write failing tests with generated PNG fixtures: original-copy/hash, bounded preview, unsupported data, dimensions/size limits, portable backup round-trip and ZIP traversal rejection.
- [x] Worker accepts structured JSON operations `import`, `export`, `restore`; copies originals into attachment id directories and creates PNG thumbnail/preview. GJS wrapper runs cancellable subprocesses and exposes `importFiles`, `importBytes`, `chooseFiles`, `path`, `exportBackup`, `importBackup`, `dispose`.
- [x] Use GTK4 file selection, clipboard binary MIME/file URI parsing, strict metadata, no plaintext Private attachments. Preserve existing JSON import and add ZIP backups.
- [x] Run worker tests and storage tests. Review public archive validation before integration.

## Task 3: Native inline editor and cards — Model: GPT-6 (controller)

Files: `ui/images.js`, `ui/editor.js`, `ui/formatting.js`, `ui/panel.js`, `extension.js`, `stylesheet.css`, `formatting.js`.

- [x] Add native test `tests/taskImages.js` with clipboard PNG at a middle caret; assert marker ordering, inline shape height, full-width image control, body clipping, Save/reopen, text paste, removal and preview/back preservation.
- [x] Extend formatting callbacks to decorate attributes, remap images with text edits and expose image insertion. Add native image icon and Ctrl+V interception; ordinary text continues through St.Entry. Image controls remain in the same scrolled document.
- [x] Render task cards with interleaved rich-text slices and full-width image buttons. Preview replaces the panel body, preserving the existing editor and pin; Escape/Back restores it.
- [x] Persist images through drafts, extension add/edit and immutable update. Cancel workers on disable. Skip image paragraphs in lists and prevent code conversion swallowing image blocks.
- [x] Run `DAYLINE_TEST_SCRIPT="$PWD/tests/taskImages.js" bash scripts/test-shell.sh`, then all AGENTS-required native regressions serially.

## Task 4: Release and local activation — Model: GPT-6 (controller/reviewer)

Files: package/install/check scripts, metadata, package.json, README and synthetic screenshots.

- [x] Package all new runtime modules and worker, version 0.4.0 (10). Run `bash scripts/check.sh`, package/install tests and native regressions; inspect screenshots for full-width image layout.
- [x] Independent spec and code review; resolve findings and rerun affected tests.
- [x] Update README with practical inline-image instructions, formats and portable backup behavior; screenshots contain synthetic data only.
- [x] Commit tested changes, integrate into the original repository and push the authorized public repository. Verify CI for the pushed SHA.
- [x] Inspect real active editor before disabling; preserve drafts. Disable, install immutable runtime, verify source/schema/data hashes, enable fresh code and verify ACTIVE. Do not deploy to the laptop.

## Verification evidence

Domain/model, worker/archive, asynchronous image store, GIO storage, encrypted vault, installer and syntax suites pass. Native task image tests pass pinned and unpinned, including actual GTK file selection and copied-file clipboard. All nine required native formatting/pointer/long-text/Private variants pass. Four image screenshots were captured with synthetic data and visually inspected. Independent domain/spec/quality reviews approved.

A preferences test initially set XDG paths after GI initialization and overwrote the real public data file. The old running extension retained its original tasks; the user executed a guarded memory recovery, which restored all eight tasks and secured the cached document and public drafts separately. The test now uses a child with environment set before startup and refuses writes unless actual Store/ImageStore paths resolve under its temporary root. AGENTS.md records this requirement. The old live extension remains unchanged until the safe updater completes disable → install → hash verification → fresh activation.

## Delivery

Published main commit `b7154cbddf50b4b48387cca2789d9c4a774456ac`; GitHub Checks run 38374310056 passed. The user executed the tested safe updater. Dayline 0.4.0 (10) is ACTIVE from immutable runtime `0.4.0-2a60bbd9d0c2`. All 27 runtime source/asset/schema files match the checkout and installed root. Public task bytes remained unchanged, all eight tasks survived, and the nonempty composer draft was backed up and restored. AI Usage remains ACTIVE. Laptop deployment was not performed.
