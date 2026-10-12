# One panel for the list and selected entry

The user corrected the separate-window design: the existing popup must transition from the compact list into the selected entry, expand smoothly, and return to the compact list. Never show the list and entry in two windows. Preserve the existing pin setting and uniform opacity throughout.

Reuse the existing inline editor and panel sizing. Clicking a row's overlapping rectangles opens that entry with expanded sizing. Text clicks retain the compact editor. Back/Escape retains an unfinished public entry draft in the session; Cancel discards it; Save updates only the selected entry. Returning to the list restores tabs, summary and composer for the previous date/tab. Existing private-note locking remains tied to panel close and screen lock.

Verify actual mouse controls, focus/copy/paste while pinned, animated width changes, Back/Save/Cancel, note/task drafts, calendar navigation, opacity, HiDPI bounds and cleanup in isolated GNOME sessions. Stop the installed extension before any installation, publish atomically, activate a fresh immutable runtime.

Verification: the pointer regression failed on 0.2.3 because it opened a second window. The revised flow passes actual mouse controls and keyboard calendar/Escape tests in pinned and unpinned modes. The single-panel, main UI, Private, domain/storage/vault/installer suites and live update from 0.1.0 with rollback all passed. Native screenshot inspection confirmed one expanded popup.
