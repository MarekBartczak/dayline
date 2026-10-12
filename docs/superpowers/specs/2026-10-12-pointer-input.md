# Pointer input regression — 0.2.3

Two issues were hidden by tests which emitted button signals directly:

- Cancelling BoxPointer's opacity transition also cancelled its completion callback, leaving `_muteInput` true. All actual pointer clicks in the opened main popup were blocked. Change the existing transition's destination with `set_to()` so the framework completes normally and unmutes input. Leave closing transitions intact.
- Captured events in GNOME 50 returned null from `event.get_source()`. The detached editor classified its own button clicks as outside clicks and closed. Use `global.stage.get_event_actor(event)`, matching GNOME's PopupMenuManager.

Unpinned editors also close when stage keyboard focus leaves their actor, including a click in an already focused native application. Pinned editors retain their draft while focus moves elsewhere. Before rebuilding or hiding the date picker, move focus to the persistent date entry. A virtual-keyboard month-navigation regression reproduced a Clutter assertion in the isolated compositor without this focus transfer; navigation and day selection pass with it. The native test client is placed beside the floating editor so its controls are reachable.

The pointer regression generates actual virtual-seat motion, button presses and releases. It verifies top-bar opening, starting/completing/reopening tasks, separate-window opening/pinning/enlargement/saving, tab switching, main pin/unpin, opacity changes during animation, rapid close/reopen and outside-click draft retention. A native GTK application is present during the test. The original input-blocking implementation fails the pointer test; both fixes together pass. Main UI and domain/storage/vault/installer checks also pass.
