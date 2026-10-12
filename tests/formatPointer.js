// Native pointer regression: never replace mouse selection with set_selection.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {createNativeTestWindow} from './nativeWindow.js';
export const METRICS = {};
let pointer;
function assert(value, message) { if (!value) throw new Error(`Format pointer: ${message}`); }
function find(actor, name) {
    if (!actor.visible) return null;
    if (actor.accessible_name === name) return actor;
    for (const child of actor.get_children()) { const match = find(child, name); if (match) return match; }
    return null;
}
async function click(actor) {
    assert(actor?.mapped, 'Click target is mapped');
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + width / 2, y + height / 2);
    await Scripting.sleep(50);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(50);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(180);
}
async function select(entry, fragment, reverse = false) {
    // Await native resizing before deriving coordinates, then use one mouse.
    await Scripting.sleep(220);
    const value = entry.get_text();
    const offset = value.indexOf(fragment);
    assert(offset >= 0, 'The selected fragment exists');
    const start = Array.from(value.slice(0, offset)).length;
    const end = start + Array.from(fragment).length;
    const text = entry.clutter_text;
    const [x, y] = text.get_transformed_position();
    const [okStart, xStart, yStart, hStart] = text.position_to_coords(start);
    const [okEnd, xEnd, yEnd, hEnd] = text.position_to_coords(end);
    assert(okStart && okEnd, 'Selection has native coordinates');
    const first = [x + xStart + 1, y + yStart + hStart / 2];
    const last = [x + xEnd - 1, y + yEnd + hEnd / 2];
    const [press, release] = reverse ? [last, first] : [first, last];
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), ...press);
    await Scripting.sleep(40);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(40);
    // Intermediate motion makes selection behave like a real drag.
    for (let step = 1; step <= 4; step++) {
        pointer.notify_absolute_motion(GLib.get_monotonic_time(),
            press[0] + (release[0] - press[0]) * step / 4,
            press[1] + (release[1] - press[1]) * step / 4);
        await Scripting.sleep(20);
    }
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(80);
    assert(text.get_selection() === fragment, `Mouse selected ${JSON.stringify(fragment)}, got ${JSON.stringify(text.get_selection())}`);
    return {start, end};
}
export async function run() {
    Main.overview.hide();
    pointer = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), 640, 650);
    await Scripting.sleep(700);
    const uuid = 'dayline@marekbartczak.github.io';
    const app = Main.extensionManager.lookup(uuid).stateObj;
    const panel = app.panel;
    const native = await createNativeTestWindow();
    native.window.activate(global.get_current_time());
    await Scripting.sleep(250);
    app.desktopSettings.set_string('font-name', 'Noto Sans,  10');
    app.desktopSettings.set_string('color-scheme', 'prefer-dark');
    app.settings.set_string('appearance', 'system');
    app.settings.set_string('accent', 'green');
    app.settings.set_int('opacity', Number(GLib.getenv('DAYLINE_TEST_OPACITY') ?? '100'));
    const pinned = GLib.getenv('DAYLINE_TEST_PINNED') !== '0';
    const code = '    const value = 42;\n\treturn value;';
    const fixture = `😀 Before mouse selection after.\nSecond selected line.\nThird line for lists.\n\n${code}\n\nFooter`;
    app.add('tasks', fixture, app.today);
    panel.menu.open();
    panel.pinning.setPinned(pinned);
    const task = app.store.data.tasks[0];
    for (const reverse of [false, true]) {
        for (const action of ['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Code block']) {
            panel.openDetails('tasks', task);
            await Scripting.sleep(260);
            const fragment = ['Bold', 'Italic'].includes(action) ? 'mouse selection'
                : action === 'Code block' ? code : 'Second selected line.\nThird line for lists.';
            const selected = await select(panel.editor.text, fragment, reverse);
            const target = find(panel.menu.actor, action);
            await click(target);
            const text = panel.editor.text.get_text();
            const format = panel.editor.getFormat();
            const attributes = panel.editor.text.clutter_text.get_layout().get_attributes().to_string();
            if (action === 'Bold') assert(attributes.includes('weight bold'), 'Mouse-applied bold is present in the native layout');
            if (action === 'Italic') assert(attributes.includes('style italic'), 'Mouse-applied italic is present in the native layout');
            print(`PASS: ${action}, reverse selection=${reverse}`);
            if (['Bold', 'Italic'].includes(action)) {
                const type = action.toLowerCase();
                assert(text === fixture && format.some(range => range.type === type && range.start === selected.start && range.end === selected.end), `${action} must format exactly the mouse-selected words`);
                await click(target);
                assert(!panel.editor.getFormat().some(range => range.type === type), `${action} must toggle off on a second click`);
            } else if (action === 'Bulleted list') {
                assert(text.includes('• Second selected line.\n• Third line for lists.'), 'Bullets must affect both mouse-selected lines');
            } else if (action === 'Numbered list') {
                assert(text.includes('1. Second selected line.\n2. Third line for lists.'), 'Numbers must affect both mouse-selected lines');
            } else {
                assert(format.some(range => range.type === 'code' && Array.from(text).slice(range.start, range.end).join('') === code), 'Code must enclose exactly the selected indented code');
            }
            panel.returnToList(true);
        }
    }
    // Real usage keeps the same editor alive across multiple style changes.
    const paragraph = 'Dłuższe zadanie: jeżeli nie znamy źródła i przychodzi oferta, zachowujemy szczegóły integracji oraz przypisanie konta. '.repeat(6);
    const longFixture = `${paragraph}\n\n${fixture}\n\n${paragraph}`;
    app.add('tasks', longFixture, app.today, [{type: 'code', start: 0, end: paragraph.length}]);
    panel.openDetails('tasks', app.store.data.tasks[1]);
    await Scripting.sleep(280);
    const sameEditor = panel.editor;
    const longField = sameEditor.root.get_children().find(actor => actor.has_style_class_name?.('dayline-editor-field'));
    print(`Long code geometry: entryWidth=${sameEditor.text.width}, fieldWidth=${longField.width}`);
    assert(sameEditor.text.width <= longField.width, 'A long code line wraps inside the viewport width');
    const [, , bottom, lineHeight] = sameEditor.text.clutter_text.position_to_coords(-1);
    assert(sameEditor.text.clutter_text.height >= bottom + lineHeight,
        'The initial styled document allocation must include its last line');
    assert(sameEditor.text.clutter_text.height <= bottom + lineHeight + 60,
        'The document must not leave a large blank scroll area after its last line');
    for (const [action, fragment] of [['Bold', 'mouse selection'], ['Italic', 'mouse selection'],
        ['Bulleted list', 'Second selected line.\nThird line for lists.'],
        ['Numbered list', '• Second selected line.\n• Third line for lists.'],
        ['Code block', code]]) {
        const field = sameEditor.root.get_children().find(actor => actor.has_style_class_name?.('dayline-editor-field'));
        const value = sameEditor.text.get_text();
        const start = Array.from(value.slice(0, value.indexOf(fragment))).length;
        const [, , lineY] = sameEditor.text.clutter_text.position_to_coords(start);
        field.vadjustment.value = Math.max(0, lineY - 25);
        await Scripting.sleep(120);
        const selected = await select(sameEditor.text, fragment);
        await click(find(panel.menu.actor, action));
        const format = sameEditor.getFormat();
        const text = sameEditor.text.get_text();
        print(`PASS: ${action} in the scrolled styled document`);
        assert(panel.editor === sameEditor, 'Toolbar preserves the editor actor');
        if (['Bold', 'Italic'].includes(action)) assert(format.some(range => range.type === action.toLowerCase() && range.start === selected.start && range.end === selected.end), `${action} must format scrolled selected words`);
        else if (action === 'Bulleted list') assert(text.includes('• Second selected line.\n• Third line for lists.'), 'Scrolled bullets affect both selected lines');
        else if (action === 'Numbered list') assert(text.includes('1. Second selected line.\n2. Third line for lists.'), 'Scrolled numbers replace bullet prefixes');
        else assert(format.some(range => range.type === 'code' && Array.from(text).slice(range.start, range.end).join('') === code), 'Scrolled selected code is preserved');
    }
    native.close();
    await Main.extensionManager.disableExtension(uuid);
    print(`PASS: all formatting controls after forward/reverse mouse selection, repeated toggles, pinned=${pinned}`);
}
