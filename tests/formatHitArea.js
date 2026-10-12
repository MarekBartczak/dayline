// A scrolled document must not intercept the formatting toolbar's pointer area.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
function assert(value, message) { if (!value) throw new Error(`Format hit area: ${message}`); }
function find(actor, name) {
    if (!actor.visible) return null;
    if (actor.accessible_name === name) return actor;
    for (const child of actor.get_children()) { const result = find(child, name); if (result) return result; }
    return null;
}
export async function run() {
    Main.overview.hide();
    const pointer = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), 640, 650);
    await Scripting.sleep(700);
    const uuid = 'dayline@marekbartczak.github.io';
    const app = Main.extensionManager.lookup(uuid).stateObj;
    const panel = app.panel;
    let pressedActor = null;
    panel.menu.actor.connect('captured-event', (_actor, event) => {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) pressedActor = global.stage.get_event_actor(event);
        return Clutter.EVENT_PROPAGATE;
    });
    const marker = 'mouse selected words';
    const content = Array.from({length: 50}, (_, i) => i === 25 ? marker : `Step ${i + 1}: review the integration and record the result.`).join('\n');
    app.add('tasks', content, app.today);
    panel.menu.open();
    panel.pinning.setPinned(GLib.getenv('DAYLINE_TEST_PINNED') !== '0');
    panel.openDetails('tasks', app.store.data.tasks[0]);
    await Scripting.sleep(300);
    const entry = panel.editor.text;
    const field = panel.editor.root.get_children().find(actor => actor.has_style_class_name?.('dayline-editor-field'));
    const text = entry.clutter_text;
    const start = content.indexOf(marker), end = start + marker.length;
    const [, , markerY] = text.position_to_coords(start);
    field.vadjustment.value = markerY - 30;
    await Scripting.sleep(200);
    const [x, y] = text.get_transformed_position();
    const [, firstX, firstY, firstH] = text.position_to_coords(start);
    const [, lastX, lastY, lastH] = text.position_to_coords(end);
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + firstX + 1, y + firstY + firstH / 2);
    await Scripting.sleep(40);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(40);
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + lastX - 1, y + lastY + lastH / 2);
    await Scripting.sleep(80);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(120);
    assert(text.get_selection() === marker, 'The scrolled words are selected with the mouse');
    const pin = find(panel.menu.actor, panel.pinning.pinned ? 'Unpin panel' : 'Pin panel');
    const [pinX, pinY] = pin.get_transformed_position();
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), pinX + pin.width / 2, pinY + pin.height / 2);
    await Scripting.sleep(60);
    assert(pin.hover, 'Scrolled text must not retain the pointer over the panel header pin button');
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + lastX - 1, y + lastY + lastH / 2);
    await Scripting.sleep(60);
    for (const name of ['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Code block']) {
        const button = find(panel.menu.actor, name);
        const [bx, by] = button.get_transformed_position();
        const [bw, bh] = button.get_transformed_size();
        const px = bx + bw / 2, py = by + bh / 2;
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), px, py);
        await Scripting.sleep(60);
        const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, px, py);
        print(`Toolbar hit ${name}: ${picked?.toString().split(' (')[0]}, field clip=${field.clip_to_allocation}, scroll=${field.vadjustment.value}`);
        assert(button.hover, `${name} must get native pointer hover after selecting scrolled text`);
        assert(picked === button || button.contains(picked), `${name} must receive the pointer after scrolling, instead of ${picked?.constructor.name}`);
    }
    const bold = find(panel.menu.actor, 'Bold');
    const [bx, by] = bold.get_transformed_position();
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), bx + bold.width / 2, by + bold.height / 2);
    await Scripting.sleep(60);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(40);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(180);
    assert(pressedActor === bold || bold.contains(pressedActor), 'The actual button press must reach Bold');
    assert(panel.editor.getFormat().some(range => range.type === 'bold' && range.start === start && range.end === end), 'Actual click formats the selected scrolled words');
    await Main.extensionManager.disableExtension(uuid);
    print('PASS: scrolled text cannot cover any formatting button pointer area');
}
