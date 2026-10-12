import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import {createNativeTestWindow, copyNativeWindowText, pasteIntoShellEntry} from './nativeWindow.js';
import {shiftMonth} from '../model.js';
import {formatDate} from '../ui/widgets.js';

export const METRICS = {};
function assert(value, message) { if (!value) throw new Error(`Pointer input: ${message}`); }
function find(actor, name) {
    if (!actor.visible) return null;
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
async function escapeFrom(actor) {
    actor.grab_key_focus();
    const keyboard = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time = GLib.get_monotonic_time();
    keyboard.notify_keyval(time, Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time + 1, Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
    await Scripting.sleep(220);
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
    await click(find(panel.menu.actor, 'Pin panel'));
    const popup = panel.menu.actor;
    const chromeCount = Main.layoutManager._trackedActors.length;
    await click(find(panel.menu.actor, `Expand task: ${task.text}`));
    assert(panel.menu.isOpen && panel.menu.actor === popup && panel.editor && panel.expanded && !panel.details,
        'The pinned list must become the expanded selected editor in the same popup');
    assert(Main.layoutManager._trackedActors.length === chromeCount && panel.root.width > 500,
        'Selected details expand the same popup without adding Chrome windows');
    assert(panel.pinning.pinned && !panel.summary.visible && !panel.tabsBox.visible, 'Editor replaces list and retains pin');
    await click(find(popup, 'Compact editor'));
    assert(!panel.expanded, 'Real pointer must collapse editor');
    await click(panel.editor.date);
    assert(panel.editor, 'Date focus must keep the editor open');
    await click(find(popup, 'Choose a date'));
    await click(find(popup, 'Next month'));
    assert(panel.editor, 'Mouse month navigation must keep editor open');
    await activateFocused(find(popup, 'Next month'));
    assert(panel.editor, 'Keyboard month navigation must keep editor open');
    const selectedDate = shiftMonth(app.today, 2).slice(0, 7) + '-01';
    await activateFocused(find(popup, formatDate(selectedDate)));
    assert(panel.editor.date.get_text() === selectedDate, 'Keyboard day selection must update date');
    await click(find(popup, 'Today'));
    assert(panel.editor.date.get_text() === app.today, 'Today shortcut must restore the selected task date');
    panel.editor.text.set_text('Return draft');
    await click(find(popup, 'Back to list'));
    assert(!panel.editor && !panel.expanded && panel.summary.visible && panel.root.width < 420 && panel.pinning.pinned,
        'Back restores compact list and pin');
    await click(find(popup, `Expand task: ${task.text}`));
    assert(panel.editor.text.get_text() === 'Return draft', 'Expanded entry restores the selected draft');
    await copyNativeWindowText(native);
    await pasteIntoShellEntry(panel.editor.text);
    assert(panel.menu.isOpen && panel.pinning.pinned && panel.editor.text.get_text().includes('External application text'),
        'Pinned single panel survives native focus and accepts pasted text');
    await escapeFrom(panel.editor.date);
    assert(panel.menu.isOpen && !panel.editor && !panel.expanded, 'Escape from the pinned date field must restore the list');
    await click(find(popup, `Expand task: ${task.text}`));
    panel.editor.text.set_text('Saved by actual button click');
    await click(find(popup, 'Save changes'));
    assert(!panel.editor && panel.menu.isOpen && panel.root.width < 420 && app.store.data.tasks[0].text === 'Saved by actual button click',
        'Save updates selected entry and returns same popup to compact list');
    await click(find(popup, 'Unpin panel'));
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
    await click(find(panel.menu.actor, 'Expand task: Saved by actual button click'));
    panel.editor.text.set_text('Outside-click draft');
    await clickPoint(20, 80);
    assert(!panel.menu.isOpen && panel.editor.text.get_text() === 'Outside-click draft', 'Outside click closes unpinned popup and retains editor');
    await click(panel);
    assert(panel.menu.isOpen && panel.expanded && panel.editor.text.get_text() === 'Outside-click draft', 'Reopening restores same expanded editor');
    await escapeFrom(panel.editor.date);
    assert(panel.menu.isOpen && !panel.editor && !panel.expanded, 'Escape from the unpinned date field returns to the list without closing popup');
    await click(find(popup, 'Expand task: Saved by actual button click'));
    assert(panel.editor.text.get_text() === 'Outside-click draft', 'Escape retains selected-entry draft');
    await click(find(popup, 'Cancel'));
    assert(!panel.editor && !panel.entryDrafts.size && panel.root.width < 420, 'Cancel discards selected draft and restores list');
    await Scripting.sleep(200);
    native.close();
    await Main.extensionManager.disableExtension('dayline@marekbartczak.github.io');
    await Scripting.sleep(200);
    print('PASS: actual pointer input opens popup, starts/completes tasks, transitions one pinned panel between list and selected entry and switches tabs after reopening');
}
