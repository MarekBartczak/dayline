import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
function assert(value, message) { if (!value) throw new Error(`Rich formatting: ${message}`); }
function find(actor, name) {
    if (!actor.visible) return null;
    if (actor.accessible_name === name) return actor;
    for (const child of actor.get_children()) { const result = find(child, name); if (result) return result; }
    return null;
}
async function click(actor) {
    assert(actor, 'Control exists');
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    const pointer = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + width / 2, y + height / 2);
    await Scripting.sleep(50);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(250);
}
function select(entry, fragment) {
    const value = entry.get_text();
    const index = value.indexOf(fragment);
    assert(index >= 0, `Selected text exists: ${fragment}`);
    const start = Array.from(value.slice(0, index)).length;
    entry.grab_key_focus();
    entry.clutter_text.set_selection(start, start + Array.from(fragment).length);
}
const clipboard = () => new Promise(resolve => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clipboard, value) => resolve(value)));
async function paste() {
    const keyboard = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time = GLib.get_monotonic_time();
    keyboard.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time + 1, Clutter.KEY_v, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time + 2, Clutter.KEY_v, Clutter.KeyState.RELEASED);
    keyboard.notify_keyval(time + 3, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
    await Scripting.sleep(300);
}
async function key(symbol) {
    const keyboard = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time = GLib.get_monotonic_time();
    keyboard.notify_keyval(time, symbol, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time + 1, symbol, Clutter.KeyState.RELEASED);
    await Scripting.sleep(250);
}
export async function run() {
    Main.overview.hide();
    await Scripting.sleep(700);
    const app = Main.extensionManager.lookup('dayline@marekbartczak.github.io').stateObj;
    const originalCode = '    const total = items.length;\n\treturn total;';
    app.add('tasks', `😀 Release checklist\nCheck permissions\nShip the integration\n\n${originalCode}\n\nReady for review`, app.today);
    const panel = app.panel;
    panel.menu.open();
    panel.pinning.setPinned(true);
    panel.openDetails('tasks', app.store.data.tasks[0]);
    await Scripting.sleep(250);
    assert(find(panel.menu.actor, 'Bold'), 'Expanded editor must expose formatting controls');
    assert(panel.editor.getFormat && panel.editor.text instanceof St.Entry, 'Formatting retains the native text entry');
    select(panel.editor.text, 'Release checklist');
    await click(find(panel.menu.actor, 'Bold'));
    assert(panel.editor.getFormat().some(range => range.type === 'bold') && panel.editor.text.clutter_text.get_layout().get_attributes().to_string().includes('weight bold'), 'Selected text renders bold without source markers');
    select(panel.editor.text, 'Check permissions');
    await click(find(panel.menu.actor, 'Italic'));
    assert(panel.editor.text.clutter_text.get_layout().get_attributes().to_string().includes('style italic'), 'Selected text renders italic');
    select(panel.editor.text, 'Check permissions\nShip the integration');
    await click(find(panel.menu.actor, 'Bulleted list'));
    assert(panel.editor.text.get_text().includes('• Check permissions\n• Ship the integration'), 'Lists affect selected lines');
    select(panel.editor.text, '• Check permissions\n• Ship the integration');
    await click(find(panel.menu.actor, 'Numbered list'));
    assert(panel.editor.text.get_text().includes('1. Check permissions\n2. Ship the integration'), 'Numbered lists replace bullet prefixes');
    select(panel.editor.text, originalCode);
    await click(find(panel.menu.actor, 'Code block'));
    assert(panel.editor.getFormat().some(range => range.type === 'code') && find(panel.menu.actor, 'Copy code'), 'Selected code creates a nested copyable frame');
    await click(find(panel.menu.actor, 'Copy code'));
    assert(await clipboard() === originalCode, 'Copy keeps complete code indentation and tabs');
    const pastedCode = 'function build(items) {\n\tconst total = items.length;\n\treturn total;\n}\n';
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, pastedCode);
    select(panel.editor.text, originalCode);
    await paste();
    assert(panel.editor.text.get_text().includes(pastedCode), 'Native paste retains nested code whitespace');
    await click(find(panel.menu.actor, 'Copy code'));
    assert(await clipboard() === pastedCode, 'Copy uses the whole updated pasted code block');
    await click(find(panel.menu.actor, 'Compact editor'));
    assert(!find(panel.menu.actor, 'Bold') && find(panel.menu.actor, 'Copy code') && panel.editor.text.clutter_text.get_layout().get_attributes().to_string().includes('weight bold'), 'Compact view retains formatting/code while hiding formatting controls');
    const field = panel.editor.root.get_children().find(actor => actor.has_style_class_name?.('dayline-editor-field'));
    assert(panel.editor.text.width <= field.width && field.width <= panel.body.width, 'Code decoration shrinks with the compact document without clipping');
    const color = panel.editor.text.get_theme_node().get_foreground_color();
    const expectedColor = '#' + [color.red, color.green, color.blue].map(value => (value * 257).toString(16).padStart(4, '0')).join('');
    assert(panel.editor.text.clutter_text.get_layout().get_attributes().to_string().includes(`foreground ${expectedColor}`), 'Rich text retains the theme foreground');
    await click(find(panel.menu.actor, 'Expand editor'));
    const codeRange = panel.editor.getFormat().find(range => range.type === 'code');
    const frame = find(panel.menu.actor, 'Code frame');
    const [, glyphY] = panel.editor.text.clutter_text.get_transformed_position();
    const [, , codeY] = panel.editor.text.clutter_text.position_to_coords(codeRange.start);
    const [, frameY] = frame.get_transformed_position();
    assert(Math.abs(frameY - (glyphY + codeY - 5)) < 2, 'Expanded code frame follows the actual nested text allocation');
    await click(find(panel.menu.actor, 'Save changes'));
    const saved = app.store.data.tasks[0];
    assert(saved.format.some(range => range.type === 'code') && saved.text.includes(pastedCode), 'Save persists formatting alongside exact code text');
    panel.openDetails('tasks', saved);
    await Scripting.sleep(300);
    assert(panel.editor.getFormat().some(range => range.type === 'bold') && find(panel.menu.actor, 'Copy code'), 'Reopening restores formatting and code frame');
    panel.returnToList(true);
    app.add('notes', 'aa', null, [{type: 'code', start: 0, end: 1}]);
    panel.openDetails('notes', app.store.data.notes[0]);
    await Scripting.sleep(250);
    panel.editor.text.clutter_text.set_selection(0, 0);
    await key(Clutter.KEY_Delete);
    assert(panel.editor.text.get_text() === 'a' && panel.editor.getFormat().length === 0, 'Deleting the first repeated character removes its code range');
    panel.returnToList(true);
    app.add('notes', 'aa', null, [{type: 'bold', start: 0, end: 1}]);
    panel.openDetails('notes', app.store.data.notes[1]);
    await Scripting.sleep(250);
    panel.editor.text.clutter_text.set_selection(0, 0);
    await key(Clutter.KEY_a);
    const shifted = panel.editor.getFormat()[0];
    assert(panel.editor.text.get_text() === 'aaa' && shifted.start === 1 && shifted.end === 2, 'Insertion before repeated text shifts the exact styled occurrence');
    await Main.extensionManager.disableExtension('dayline@marekbartczak.github.io');
    print('PASS: native selection formatting, lists, code frames, actual copy/paste, compact visibility and persistence');
}
