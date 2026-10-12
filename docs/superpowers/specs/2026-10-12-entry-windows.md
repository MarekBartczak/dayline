# Individual entry windows

The user clarified three concrete requirements from screenshots: cards must not overlap the vertical scrollbar; opacity must uniformly affect the complete popup, including text and controls; an overlapping-rectangles action belongs on each entry in the list and opens only that entry in a separate popup-like editor.

Use a reserved scrollbar column and content gutter. Keep theme backgrounds opaque and apply the configured opacity once to the complete popup actor. Apply the same setting to individual entry windows.

Public tasks and ordinary notes gain a row action opening an independent Shell chrome window. It contains the complete existing editor, its own pin and close controls, bounded scrolling and optional enlargement. Opening an unpinned main menu entry closes that menu and leaves the separate editor visible. Existing pin state is inherited; the individual editor can change its own pin independently. Store unsaved public drafts in memory when the window closes and restore them when reopening the same entry. Save writes only the selected entry. Closing on outside interaction applies only when unpinned. Screen lock and extension disable always remove detached windows. Existing Private editing remains within the password-protected panel, respecting the automatic panel-close lock policy.

Verify actual Shell opacity, reserved scrollbar geometry, opening/editing/saving only one entry, independent pin and window cleanup, and retained drafts. Screenshots use synthetic examples. Follow disable → change → verify → enable for native installation.
