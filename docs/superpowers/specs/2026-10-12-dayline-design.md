# Dayline

Approved by Marek on 2026-10-12: native GNOME top-panel to-do extension, public personal GitHub repository, project at `~/P_PROJ/dayline`.

## Behavior

The panel shows a checkmark and the number of unfinished tasks dated today, using the local timezone. Overdue tasks do not contribute to that number and remain visible in their own section. The count updates on edits, day changes, and resume from sleep.

The popup has three tabs: Dzisiaj, Kalendarz, Notatki. Dzisiaj presents today's open and completed tasks, daily progress, and overdue items. Kalendarz has a Monday-first month grid, dots on days with open tasks, month navigation, and the selected day's task list. Notatki stores plain multiline notes with no dates or completion status. The composer follows the active tab and selected day. Tasks can be completed, reopened, edited, rescheduled, and removed with undo. Notes can be edited and removed with undo.

Polish interface, spacious rounded popup, restrained violet accent, symbolic icons, keyboard-accessible controls, wrapping task text, bounded scrolling, light/dark GNOME theme support, and meaningful empty states. Text must be displayed literally, never as markup.

## Architecture and data

GJS ES modules, native St/Clutter popup widgets, no background service, no npm runtime dependencies. `model.js` holds portable immutable validation, date helpers, and data operations. `store.js` handles the GIO filesystem. `ui/` owns reusable popup widgets, calendar, editor, and panel. `extension.js` wires lifecycle, timers, panel, and data operations. GTK4/libadwaita preferences provide backup import/export and theme choice.

Data stays outside the repository in `$XDG_DATA_HOME/dayline/data.json`. Versioned document: `{version: 1, tasks: [{id, text, date, done, createdAt}], notes: [{id, text, createdAt}]}`. `date` is strict local `YYYY-MM-DD`. Writes are atomic and keep the previous valid document as a backup. Failed persistence does not change the displayed model. Malformed data is preserved and mutations blocked until repaired/restored; the UI explains the problem. Import validates the entire document and explicitly confirms replacement, retaining a backup. Export contains user data only.

## Validation and delivery

Node's built-in test runner checks dates including DST/leap days, today's count, overdue behavior, editing, CRUD, strict import validation, and literal notes. GJS integration tests exercise real atomic storage, backups, and corrupt input. An isolated GNOME Shell 50 session verifies enable/disable, popup rendering, all tabs, task completion, editing/rescheduling, and screenshot capture. Installer only replaces Dayline files, preserves personal data, and enables the extension when the session permits it. On Wayland a first install may need logout/login for discovery.

Deliver source, MIT license, reproducible install/package scripts, documentation, screenshots, CI for portable tests, and a public `MarekBartczak/dayline` repository. Repository must not contain user tasks, machine-specific credentials, or temporary test data.
