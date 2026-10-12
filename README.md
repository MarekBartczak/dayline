# Dayline

**Your day, a little clearer.** A small, local-first to-do list for the GNOME top bar.

See how many tasks are left **today** without opening an app. Click to plan a day, check something off, or catch a thought before it disappears.

<p align="center">
  <img src="docs/screenshots/today-dark.png" width="330" alt="Dayline's today view in the dark theme">
  <img src="docs/screenshots/today-light.png" width="330" alt="Dayline's today view in the light theme">
</p>

## What it does

- **Today counters** — green for tasks in progress, plus tasks still waiting today. Completed and other-day tasks are excluded.
- **Today** — today's plan, completed tasks, daily progress, and a separate overdue section.
- **Calendar** — a Monday-first month grid; choose any day and add tasks there. Dots indicate days with unfinished tasks.
- **Notes** — undated notes for ideas, reminders, and details to add to a project.
- **Private** — a fourth tab for encrypted notes, protected by a separate password and automatically locked when the panel closes or the screen locks.
- **Edit and reschedule** — click a task or note; the editor supports multiple lines and a date picker.
- **Separate entry window** — overlapping rectangles on a task or ordinary note open only that entry in a floating editor, with its own pin, close button and size toggle. The main list keeps its size; closing retains an unfinished draft for reopening in the same session.
- **Delete with undo** — restore the last deleted task or ordinary note while the extension remains enabled.
- **Pin to screen** — keep the panel visible while working in other apps. Copy elsewhere, return and paste without losing your editor.
- **Compact by default** — overlapping rectangles in the editor smoothly switch to a larger workspace, preserving text and pin state.
- **Light, dark, or system appearance**, with System accent, Ubuntu Orange, Violet, Blue, Green and Rose.
- **Window opacity** — adjustable from 20–100% in Settings; the entire popup fades uniformly, including its cards, text and controls. Separate entry windows use the same setting.
- **Offline storage**, atomic saves, previous-version backup, and explicit JSON import/export.

No account, server, network requests, tracking, or runtime npm dependencies. The interface is in **English**. Your own task and note text is kept exactly as you wrote it. GNOME **50** is the supported and tested version; other Shell versions are not declared compatible.

## Install

```bash
git clone https://github.com/MarekBartczak/dayline.git
cd dayline
bash scripts/install.sh
```

The installer disables Dayline and waits until it stops before changing installed files, then verifies that it becomes active again. Compiled schemas are built separately and replaced atomically, preserving existing memory mappings. **On Wayland, a first installation may require logging out and back in**; the installer schedules Dayline to enable on that login. To enable it manually:

```bash
gnome-extensions enable dayline@marekbartczak.github.io
```

Alternatively, build a distributable archive and install it with GNOME's tool:

```bash
bash scripts/package.sh
gnome-extensions install --force dist/dayline@marekbartczak.github.io.shell-extension.zip
```

GNOME caches loaded JavaScript modules. For updates, you can either start a new GNOME session or use the live-update command below after running the installer. The extension installer needs no administrator privileges. Dependencies: GNOME Shell 50, GJS, GTK4/libadwaita for preferences, `glib-compile-schemas` (normally supplied by GNOME), and system Python 3 with the `cryptography` package for the Private tab. On Ubuntu, install that system dependency first:

```bash
sudo apt-get install python3-cryptography
```

## Using Dayline

1. Click the checkmark and count in the top bar.
2. Type in the bottom field and press **Enter**, or click **+**.
3. Switch to **Calendar** to add a task for a different date.
4. Switch to **Notes** for entries without dates.
5. Switch to **Private** to create a password-protected vault or unlock your private notes.
6. Click an entry to edit it. The pencil beside the input opens a larger editor for a new entry. **Ctrl + Enter** saves; **Esc** leaves the editor.
7. Click the pin beside the gear to keep the panel on screen. Unpin restores ordinary click-outside dismissal; the close button hides a pinned panel.
8. In the editor, click the overlapping rectangles to expand or compact it.
9. On a task or ordinary note card, click the overlapping rectangles to open a separate editor. Pin that window while copying from other apps; Save updates only that entry.
10. Click the play button on an unfinished task to mark it **In progress**; pause moves it back to waiting. The checkbox completes it.
11. Open the gear menu for colors, window opacity, compact layout, and backups.

The two top-bar counters show today's in-progress and waiting tasks. They exclude completed, future, and overdue tasks. Overdue tasks retain their original dates until you complete or reschedule them. Changes are saved as soon as you add, save, complete, delete, or undo an entry. Editor text is saved only when you press Save.

<p align="center">
  <img src="docs/screenshots/calendar-dark.png" width="330" alt="Dayline calendar with task indicators">
  <img src="docs/screenshots/notes-dark.png" width="330" alt="Undated notes in Dayline">
</p>

## Update without logging out

Save your edits before running `bash scripts/install.sh`; installation stops and restarts Dayline. Open GNOME Looking Glass with **Alt + F2**, type `lg`, and paste this into **Evaluator**:

```js
const u = 'dayline@marekbartczak.github.io';
const updater = await import(GLib.filename_to_uri(GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', u, 'liveUpdate.js']), null));
await updater.activateUpdate(Main.extensionManager.lookup(u))
```

Press Enter, then Esc. The update loads an immutable runtime snapshot with fresh module URLs, and can directly activate a previously disabled Dayline. Runtime switching preserves stored entries and any available composer/closed-window drafts. An open inline or separate editor blocks the switch; save or close it first. No unsafe-mode setting is needed.

## Your data

Default location: `~/.local/share/dayline/data.json`, or `$XDG_DATA_HOME/dayline/data.json`. This directory is **outside the source repository**. Reinstalling or disabling the extension preserves your entries.

Each save keeps the previous valid document in `data.json.bak`. Import validates the whole backup and asks before replacing your list. If a file cannot be read, Dayline preserves it and blocks edits; restore a valid JSON backup through preferences. A corrupt original is retained as `data.json.corrupt` during recovery.

Backups use a versioned JSON document containing `tasks` and `notes`. Version 2 adds `inProgress`; original version 1 data/backups migrate automatically, preserving text, IDs, dates and completion status. The previous file is backed up byte for byte on the next save. Limits: 10,000 entries, 2,000 characters per task, 10,000 per note, and 32 MiB serialized UTF-8. Oversized writes are rejected before the current file or its backup is changed. Dayline is intended for one local desktop; it does not implement cross-device synchronization.

Private notes live separately in `~/.local/share/dayline/private-notes.vault`, or `$XDG_DATA_HOME/dayline/private-notes.vault`. The vault uses AES-256-GCM authenticated encryption and derives its key from your password with scrypt (`N=131072`, `r=8`, `p=1`). This password is independent of your system login. **There is no password recovery**: keep the password if you want to retain access to the notes. Closing the panel or locking the screen locks the vault; switching pin mode preserves the unlocked vault until the panel actually closes. Ordinary JSON exports and imports contain only tasks and ordinary notes; they exclude Private notes. To back up the vault, copy the encrypted `private-notes.vault` file separately and retain its password.

## Development

```bash
bash scripts/check.sh       # Domain, storage, encrypted vault, installer and syntax/schema checks
bash scripts/test-shell.sh  # Actual isolated GNOME Shell 50 UI/lifecycle test
DAYLINE_TEST_SCRIPT="$PWD/tests/privateShell.js" bash scripts/test-shell.sh # Private tab lifecycle
DAYLINE_TEST_SCRIPT="$PWD/tests/entryWindows.js" bash scripts/test-shell.sh # Separate windows, opacity and gutters
DAYLINE_TEST_SCRIPT="$PWD/tests/pointerInput.js" bash scripts/test-shell.sh # Real pointer controls and animation races
```

The first command needs Node.js 22+, GJS and system Python 3 with `cryptography`. The Shell test also needs `gnome-shell-test-tool` from GNOME 50. It uses temporary XDG data, settings, and runtime directories, and synthetic examples. It does not touch your Dayline list or desktop extension settings.

```bash
DAYLINE_SCREENSHOTS="$PWD/docs/screenshots" bash scripts/test-shell.sh
```

`model.js` is portable domain logic; `store.js` owns GIO storage; `vault.js` and `private_vault.py` handle encrypted Private storage; `ui/` contains native Shell widgets; `extension.js` owns lifecycle; `prefs.js` is the GTK4/libadwaita preferences window. `liveUpdate.js` switches to a fresh runtime without touching personal data. See `docs/superpowers/` for the approved design and implementation plan.

## Uninstall

```bash
gnome-extensions disable dayline@marekbartczak.github.io
gnome-extensions uninstall dayline@marekbartczak.github.io
```

Your tasks, notes and encrypted vault remain in the data directory. Remove that directory yourself only if you want to erase them.

MIT licensed. Made by [Marek Bartczak](https://github.com/MarekBartczak).
