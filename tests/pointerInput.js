import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import {createNativeTestWindow, copyNativeWindowText} from './nativeWindow.js';
import {shiftMonth} from '../model.js';
import {formatDate} from '../ui/widgets.js';

export const METRICS = {};
function assert(value, message) { if (!value) throw new Error(`Pointer input: ${message}`); }
function find(actor, name) {
    if (actor.accessible_name === name) return actor;
    for (const child of actor.get_children()) { const match = find(child, name); if (match) return match; }
    return null;
}
async function click(actor) {
    assert(actor, 'Control must exist');
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    await clickPoint(x + width / 2, y + height / 2);
}
async function clickPoint(x, y) {
    const pointer = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const time = GLib.get_monotonic_time();
    pointer.notify_absolute_motion(time, x, y);
    await Scripting.sleep(50);
    pointer.notify_button(time + 50000, 1, Clutter.ButtonState.PRESSED);
    pointer.notify_button(time + 60000, 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(200);
}
async function activateFocused(actor) {
    actor.grab_key_focus();
    const keyboard = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time = GLib.get_monotonic_time();
    keyboard.notify_keyval(time, Clutter.KEY_space, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time + 1, Clutter.KEY_space, Clutter.KeyState.RELEASED);
    await Scripting.sleep(200);
}

export async function run() {
    Main.overview.hide();
    await Scripting.sleep(800);
    const app = Main.extensionManager.lookup('dayline@marekbartczak.github.io').stateObj;
    const panel = app.panel;
    const native = await createNativeTestWindow();
    await copyNativeWindowText(native);
    app.add('tasks', 'Synthetic pointer test', app.today);
    const task = app.store.data.tasks[0];
    app.settings.set_int('opacity', 60);
    await click(panel);
    assert(panel.menu.isOpen, 'Real top-bar click must open the menu');
    print(`Pointer diagnostic: popup mute=${panel.menu.actor._muteInput}, opacity=${panel.menu.actor.opacity}`);
    await click(find(panel.menu.actor, 'Start task'));
    assert(app.store.data.tasks[0].inProgress, 'Real pointer click on Start must mark task in progress');
    await click(find(panel.menu.actor, `Complete: ${task.text}`));
    assert(app.store.data.tasks[0].done, 'Real pointer click on checkbox must complete task');
    await click(find(panel.menu.actor, `Open task in separate window: ${task.text}`));
    assert(panel.details, 'Real pointer click on row rectangles must open entry window');
    await click(find(panel.details.actor, 'Expand editor'));
    assert(panel.details.expanded, 'Unpinned entry controls must accept real pointer clicks');
    await click(find(panel.details.actor, 'Compact editor'));
    assert(!panel.details.expanded, 'Real pointer must collapse entry window');
    await click(panel.details.editor.date);
    assert(panel.details, 'Focusing the date field must keep the unpinned editor open');
    await click(find(panel.details.actor, 'Choose a date'));
    await click(find(panel.details.actor, 'Next month'));
    assert(panel.details, 'Month navigation must keep the unpinned editor open');
    await activateFocused(find(panel.details.actor, 'Next month'));
    assert(panel.details, 'Keyboard month navigation must keep the unpinned editor open');
    const selectedDate = shiftMonth(app.today, 2).slice(0, 7) + '-01';
    await activateFocused(find(panel.details.actor, formatDate(selectedDate)));
    assert(panel.details && panel.details.editor.date.get_text() === selectedDate, 'Choosing a day must keep the unpinned editor open');
    await click(find(panel.details.actor, 'Today'));
    await click(find(panel.details.actor, 'Pin entry window'));
    assert(panel.details.pinned, 'Real pointer must pin entry window');
    panel.details.editor.text.set_text('Saved by actual button click');
    await click(find(panel.details.actor, 'Save changes'));
    assert(!panel.details && app.store.data.tasks[0].text === 'Saved by actual button click', 'Real pointer Save must update selected entry');
    await click(panel);
    assert(panel.menu.isOpen, 'Real pointer must reopen main menu');
    await click(find(panel.menu.actor, 'Notes'));
    assert(panel.tab === 'notes', 'Real pointer must switch tabs');
    panel.menu.close();
    await Scripting.sleep(200);
    await click(panel);
    await click(find(panel.menu.actor, 'Today'));
    assert(panel.tab === 'today' && panel.menu.actor.opacity === 153, 'Reopened menu remains interactive at configured opacity');
    panel.menu.close(BoxPointer.PopupAnimation.FULL);
    panel.menu.open(BoxPointer.PopupAnimation.FULL);
    app.settings.set_int('opacity', 35);
    panel.menu.close(BoxPointer.PopupAnimation.FULL);
    panel.menu.open(BoxPointer.PopupAnimation.FULL);
    app.settings.set_int('opacity', 65);
    await Scripting.sleep(220);
    assert(panel.menu.actor.opacity === 166, 'Changing opacity during rapid close/reopen must keep the final target');
    await click(find(panel.menu.actor, 'Reopen: Saved by actual button click'));
    assert(!app.store.data.tasks[0].done, 'Rapid reopen and mid-animation settings must preserve real pointer clicks');
    await click(find(panel.menu.actor, 'Pin panel'));
    assert(panel.pinning.pinned, 'Real pointer must pin main menu');
    await click(find(panel.menu.actor, 'Start task'));
    assert(app.store.data.tasks[0].inProgress, 'Pinned main menu must still accept real pointer input');
    await click(find(panel.menu.actor, 'Unpin panel'));
    assert(!panel.pinning.pinned, 'Real pointer must unpin main menu');
    await click(find(panel.menu.actor, 'Open task in separate window: Saved by actual button click'));
    panel.details.editor.text.set_text('Outside-click draft');
    await clickPoint(20, 80);
    assert(!panel.details && panel.entryDrafts.get(`tasks/${task.id}`).text === 'Outside-click draft', 'A real outside click closes unpinned details and retains the draft');
    await Scripting.sleep(200);
    native.close();
    await Main.extensionManager.disableExtension('dayline@marekbartczak.github.io');
    await Scripting.sleep(200);
    print('PASS: actual pointer input opens popup, starts/completes tasks, opens/pins/expands/saves entry window and switches tabs after reopening');
}
