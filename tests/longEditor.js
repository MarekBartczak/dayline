import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};
function assert(value, message) { if (!value) throw new Error(`Long editor: ${message}`); }
async function capture(actor, name) {
    const directory = GLib.getenv('DAYLINE_SCREENSHOTS');
    if (!directory) return;
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    const stream = Gio.File.new_for_path(`${directory}/${name}.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    await new Shell.Screenshot().screenshot_area(Math.floor(x), Math.floor(y), Math.ceil(width), Math.ceil(height), stream);
    stream.close(null);
}
async function wheel(actor, direction, count = 8) {
    const pointer = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + width / 2, y + height / 2);
    await Scripting.sleep(50);
    for (let i = 0; i < count; i++) {
        pointer.notify_discrete_scroll(GLib.get_monotonic_time(), direction, Clutter.ScrollSource.WHEEL);
        await Scripting.sleep(20);
    }
    await Scripting.sleep(250);
}
async function key(keyval, control = false) {
    const keyboard = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time = GLib.get_monotonic_time();
    if (control) keyboard.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time + 1, keyval, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time + 2, keyval, Clutter.KeyState.RELEASED);
    if (control) keyboard.notify_keyval(time + 3, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
    await Scripting.sleep(250);
}

export async function run() {
    Main.overview.hide();
    await Scripting.sleep(800);
    const uuid = 'dayline@marekbartczak.github.io';
    const app = Main.extensionManager.lookup(uuid).stateObj;
    const panel = app.panel;
    const content = Array.from({length: 24}, (_, i) => `Step ${i + 1}: review permissions and document the integration flow.`).join('\n') + '\nEND OF TASK';
    app.add('tasks', content, app.today);
    panel.menu.open();
    panel.pinning.setPinned(true);
    panel.showEditor('tasks', app.store.data.tasks[0]);
    for (const expanded of [false, true]) {
        panel.setExpanded(expanded, false);
        await Scripting.sleep(300);
        const field = panel.editor.root.get_children().find(actor => actor.has_style_class_name?.('dayline-editor-field'));
        const adjustment = field.vadjustment;
        print(`Long editor diagnostic: expanded=${expanded}, field=${field.height}, entry=${panel.editor.text.height}, text=${panel.editor.text.clutter_text.height}, upper=${adjustment.upper}, page=${adjustment.page_size}, value=${adjustment.value}`);
        assert(adjustment.upper > adjustment.page_size + 100, 'Inner field must have a scrollable document beyond its viewport');
        adjustment.value = 0;
        await Scripting.sleep(100);
        const outer = panel.scroll.vadjustment.value;
        await wheel(field, Clutter.ScrollDirection.DOWN);
        assert(adjustment.value > 0 && panel.scroll.vadjustment.value === outer, 'Mouse wheel must scroll inside the text field without moving the outer editor');
        await wheel(field, Clutter.ScrollDirection.DOWN, 80);
        assert(Math.abs(adjustment.value - (adjustment.upper - adjustment.page_size)) < 2, 'Last line must be reachable by actual scrolling');
        assert(panel.editor.text.get_text().endsWith('END OF TASK'), 'Scrolling must keep the complete content');
        await capture(panel.menu.actor, expanded ? 'expanded-text-end' : 'compact-text-end');
        await wheel(field, Clutter.ScrollDirection.UP, 80);
        assert(adjustment.value < 2, 'First line must be reachable by scrolling up');
    }
    const marker = 'END OF LONG TASK';
    const extended = 'Detailed integration step with expected behavior and permissions.\n'.repeat(1000).slice(0, 50000 - marker.length) + marker;
    panel.editor.text.set_text(extended);
    await Scripting.sleep(300);
    assert(panel.editor.text.get_text() === extended && extended.length === 50000, 'All 50,000 characters must remain editable');
    app.edit('tasks', panel.editor.item.id, panel.editor.text.get_text(), app.today);
    assert(app.store.data.tasks[0].text === extended, 'Complete 50,000-character task must survive saving');
    app.reload();
    assert(app.store.data.tasks[0].text === extended, 'All 50,000 characters must survive reloading from disk');
    panel.editor.text.set_text(extended.slice(0, 49500));
    await Scripting.sleep(300);
    panel.editor.text.grab_key_focus();
    await key(Clutter.KEY_End, true);
    const field = panel.editor.root.get_children().find(actor => actor.has_style_class_name?.('dayline-editor-field'));
    assert(field.vadjustment.value > 0, 'Ctrl+End must reveal the end of a long description');
    for (let i = 0; i < 5; i++) await key(Clutter.KEY_Return);
    const [newlineValid, , newlineY, newlineHeight] = panel.editor.text.clutter_text.position_to_coords(-1);
    assert(newlineValid && newlineY + newlineHeight <= field.vadjustment.value + field.vadjustment.page_size,
        'Newly inserted last line must be visible without requiring another keystroke');
    await key(Clutter.KEY_x);
    const [valid, , caretY, lineHeight] = panel.editor.text.clutter_text.position_to_coords(-1);
    assert(valid && caretY + lineHeight <= field.vadjustment.value + field.vadjustment.page_size,
        'Typing new lines at the end must keep the caret visible');
    assert(panel.editor.text.get_text().endsWith('\n\n\n\n\nx'), 'Actual keyboard input appends complete editable lines');
    await Main.extensionManager.disableExtension(uuid);
    await Scripting.sleep(200);
    print('PASS: compact/expanded inner mouse scrolling reaches both ends and long task content survives editing/saving');
}
