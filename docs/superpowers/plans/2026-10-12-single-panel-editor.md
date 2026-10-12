# Single panel editor implementation plan

**Goal:** The compact list becomes an expanded selected-entry editor in the same popup.

**Architecture:** Reuse `DaylinePanel.showEditor`, `setExpanded` and its existing pin controller. Remove floating entry-window construction and keep public drafts in the existing session map.

**Tech stack:** GJS, GNOME Shell 50, St/Clutter native widgets.

- [x] Add a real-pointer regression asserting the same popup remains open, no extra Chrome actor appears, the selected editor expands, pin persists, and Back restores the list. Run against 0.2.3 and confirm failure.
- [x] Update `ui/panel.js` and `ui/editor.js`: expanded row entry, persistent draft return path, compact list restoration with a width animation. Remove unused floating editor and lifecycle hooks; retain live-update compatibility guards for older running instances.
- [x] Adapt native UI and update tests to the single-panel flow, preserving meaningful input, copying, opacity, draft and lifecycle coverage.
- [x] Run `scripts/check.sh` plus pointer, single-panel, main and private GNOME suites. Review changes, install while stopped, publish and check CI.
