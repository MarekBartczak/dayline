# Images attached to tasks

Status: approved — inline images at the cursor, confirmed by the user on 13 October 2026.

## User experience

- Attach images to tasks through an image icon in either editor size, or Ctrl+V. Paste accepts clipboard image data and copied local image files. Ordinary text paste keeps its current behavior.
- Insert each image at the cursor as its own paragraph between text paragraphs, displayed as a full-width block. Show the blocks in the task list and both editor sizes; do not use a strip of small thumbnails.
- Preserve aspect ratio. A preview fills the available width with a bounded height; tall images are cropped for this preview. Clicking shows the complete image in a larger view, with a way back to the same task and its unsaved text.
- The enlarged preview uses the existing Dayline panel. Keep pin, opacity, and the task draft intact. Constrain its size to the current monitor. Allow opening the original in the system image viewer for full-resolution viewing.
- Allow multiple images, removing an individual attachment, and image-only tasks. Keep task dates, status and the top-bar counters unchanged.
- Apply this feature to tasks. Private notes remain encrypted and do not write image data to ordinary attachment storage.

## Storage and import

- Copy selected files into Dayline's local data directory, so moving or removing the source file does not break a task. Keep originals and generate bounded previews separately.
- Store validated attachment references alongside task text and formatting. Read existing task files without losing text, dates, status or formatting.
- Use an external helper for file selection, image validation and preview generation. Avoid decoding arbitrary original files synchronously in the compositor. Support PNG, JPEG, WebP, GIF and BMP, using a still preview for animated images.
- Limit each source image to 25 MiB, 64 million pixels and 32,768 pixels per side, with at most 20 images per task. Report unsupported, oversized or unreadable files in the panel; keep the task and its previous attachments intact.
- Cancel pending work or ignore late results when the target editor is destroyed. Preserve attachments in task drafts, Save, Back/reopen, task deletion/Undo, and extension updates.
- Provide portable backups that include the referenced image files. Continue accepting existing JSON backups. Keep files needed by the current data and its previous backup when removing references.
- Use document version 3 for attachment references, accepting existing versions 1 and 2. Export a ZIP containing the public document and referenced images; encrypted Private storage stays separate, as it does today.

## Approach

Keep the native text document and formatting ranges. Object replacement characters reserve image paragraphs through Pango shape attributes; positioned image controls share the document scrolling coordinates. Persist validated image metadata and Unicode insertion offsets. Read-only task cards render the same interleaved text and images. External workers validate and normalize images before the compositor displays them.

## Verification and delivery

Test real Ctrl+V with image data and copied files, native file selection, ordinary text paste, full-width layout, bounded panel height, preview/back, pin, opacity, drafts, persistence, backups and invalid files in isolated GNOME sessions. Re-run existing text-formatting, pointer, Private and long-editor regressions. Use synthetic images in new README screenshots.

Install on this desktop using disable → change → verify → enable, with an immutable runtime. Publish the tested code and README to the user's public repository. Laptop deployment remains deferred.
