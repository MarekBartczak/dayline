import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {createNativeTestWindow, copyNativeWindowText, pasteIntoShellEntry} from './nativeWindow.js';

export const METRICS = {};
const uuid = 'dayline@marekbartczak.github.io';
function assert(value, message) { if (!value) throw new Error(`Entry windows: ${message}`); }
function find(actor, name) {
    if (actor.accessible_name === name) return actor;
    for (const child of actor.get_children()) { const result = find(child, name); if (result) return result; }
    return null;
}
function click(actor, name) {
    const button = find(actor, name);
    assert(button, `Missing ${name}`);
    button.emit('clicked', 1);
}
async function capture(actor, name) {
    const directory = GLib.getenv('DAYLINE_SCREENSHOTS');
    if (!directory) return;
    await Scripting.sleep(200);
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    const start = Math.max(0, Math.floor(x) - 16), top = Math.max(0, Math.floor(y) - 16);
    const stream = Gio.File.new_for_path(`${directory}/${name}.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    await new Shell.Screenshot().screenshot_area(start, top, Math.min(global.stage.width - start, Math.ceil(width) + 32), Math.min(global.stage.height - top, Math.ceil(height) + 32), stream);
    stream.close(null);
}

export async function run() {
    Main.overview.hide();
    await Scripting.sleep(800);
    const app = Main.extensionManager.lookup(uuid).stateObj;
    const panel = app.panel;
    app.settings.set_string('appearance', 'dark');
    for (let i = 0; i < 12; i++) app.add('tasks', i ? `Synthetic task ${i + 1}` : 'Review the API scope\nDocument default permissions and the onboarding flow.', app.today);
    panel.menu.open();
    await Scripting.sleep(250);
    const first = app.store.data.tasks[0];
    const other = app.store.data.tasks[1];
    assert(panel.scroll.vadjustment.upper > panel.scroll.height, 'List must actually need a scrollbar');
    const row = panel.body.get_children().find(actor => find(actor, `Edit: ${first.text}`));
    const [rowX] = row.get_transformed_position();
    const [scrollX] = panel.scroll.get_transformed_position();
    assert(rowX + row.width <= scrollX + panel.scroll.width - 12, 'Card must leave a separate scrollbar gutter');
    app.settings.set_int('opacity', 60);
    assert(panel.menu.actor.opacity === 153 && panel.root.opacity === 255, 'Apply opacity exactly once to the entire popup');
    assert(panel.menu.actor.get_style().includes(', 1)'), 'Background remains opaque before whole-window compositing');
    assert(row.get_paint_opacity() === 153, 'Cards must inherit the same opacity as the frame');
    const text = find(row, `Edit: ${first.text}`);
    assert(text.get_paint_opacity() === 153, 'Text and controls must inherit full-window opacity');
    await capture(panel.menu.actor, 'uniform-opacity');
    panel.menu.close();
    panel.menu.open();
    await Scripting.sleep(220);
    assert(panel.menu.actor.opacity === 153, 'Reopening must keep configured whole-window opacity after animation');
    app.settings.set_int('opacity', 100);
    await capture(panel.menu.actor, 'scrollbar-gutter');
    const listWidth = panel.root.width;
    click(panel.menu.actor, `Open task in separate window: ${first.text}`);
    const detail = panel.details;
    assert(detail && !panel.menu.isOpen && !panel.editor, 'Row action opens independent selected-entry window');
    await Scripting.sleep(250);
    assert(panel.root.width === listWidth && detail.actor.get_parent(), 'Main list remains compact and separate editor is on stage');
    assert(detail.editor.text.get_text() === first.text, 'Separate editor contains complete selected task');
    detail.editor.text.set_text('Unfinished separate-window draft');
    detail.editor.date.set_text('2026-12-18');
    click(detail.actor, 'Pin entry window');
    assert(detail.pinned && Main.modalCount === 0, 'Separate editor has its own pin with no modal grab');
    const native = await createNativeTestWindow();
    native.window.activate(global.get_current_time());
    await Scripting.sleep(180);
    assert(panel.details === detail && detail.editor.text.get_text().includes('Unfinished'), 'Pinned separate editor survives external focus');
    const focus = global.stage.get_key_focus();
    assert(!focus || !detail.actor.contains(focus), 'External focus releases Shell keyboard focus for copying');
    await copyNativeWindowText(native);
    await pasteIntoShellEntry(detail.editor.text);
    assert(detail.editor.text.get_text().includes('External application text') && panel.details === detail, 'Pinned entry window accepts text copied in a native application');
    click(detail.actor, 'Expand editor');
    await Scripting.sleep(220);
    assert(detail.expanded && detail.actor.width > 700 && panel.root.width === listWidth, 'Only the selected entry window expands');
    const context = St.ThemeContext.get_for_stage(global.stage);
    const scale = context.scale_factor;
    context.scale_factor = 2;
    await Scripting.sleep(220);
    assert(detail.actor.width > 1000 && detail.actor.width <= Main.layoutManager.primaryMonitor.width, 'Separate editor scales and stays within a HiDPI monitor');
    context.scale_factor = scale;
    await Scripting.sleep(220);
    app.settings.set_int('opacity', 65);
    assert(detail.actor.opacity === 166 && detail.editor.text.get_paint_opacity() === 166, 'Independent window uses uniform configured opacity');
    app.settings.set_int('opacity', 100);
    await capture(detail.actor, 'task-window-expanded');
    click(detail.actor, 'Close entry window');
    assert(!panel.details && !Main.uiGroup.get_children().includes(detail.actor), 'Closing removes independent actor');
    panel.menu.open();
    await Scripting.sleep(100);
    click(panel.menu.actor, `Open task in separate window: ${first.text}`);
    assert(panel.details.editor.text.get_text().includes('Unfinished separate-window draft') && panel.details.editor.text.get_text().includes('External application text') && panel.details.editor.date.get_text() === '2026-12-18', 'Reopen retains unsaved selected-entry draft');
    panel.details.editor.text.set_text('Updated only the selected task');
    click(panel.details.actor, 'Save changes');
    assert(!panel.details && !panel.entryDrafts.size, 'Save closes editor and clears saved draft');
    assert(app.store.data.tasks.find(item => item.id === first.id).text === 'Updated only the selected task', 'Save updates selected task');
    assert(app.store.data.tasks.find(item => item.id === other.id).text === other.text && app.store.data.tasks.length === 12, 'Save leaves other entries unchanged');
    panel.menu.open();
    click(panel.menu.actor, `Open task in separate window: ${other.text}`);
    const unpinned = panel.details;
    unpinned.editor.text.set_text('Unpinned draft retained after outside click');
    await copyNativeWindowText(native);
    assert(!panel.details && panel.entryDrafts.get(`tasks/${other.id}`).text.includes('Unpinned draft'), 'Outside interaction closes an unpinned window and retains its draft');
    app.add('notes', 'Synthetic ordinary note', null);
    panel.menu.open();
    panel.selectTab('notes');
    const note = app.store.data.notes[0];
    click(panel.menu.actor, `Open note in separate window: ${note.text}`);
    assert(panel.details.kind === 'notes' && !panel.details.editor.date, 'Ordinary note opens independent undated editor');
    click(panel.details.actor, 'Pin entry window');
    Main.screenShield._isLocked = true;
    try { Main.screenShield.emit('locked-changed'); } finally { Main.screenShield._isLocked = false; }
    assert(!panel.details, 'Screen lock removes independent pinned window');
    panel.menu.open();
    const updated = app.store.data.tasks.find(item => item.id === first.id);
    panel.selectTab('calendar');
    panel.selectDate(updated.date);
    click(panel.menu.actor, `Open task in separate window: ${updated.text}`);
    const detachedActor = panel.details.actor;
    await Main.extensionManager.disableExtension(uuid);
    assert(!Main.uiGroup.get_children().includes(detachedActor) && !Main.layoutManager._trackedActors.some(entry => entry.actor === detachedActor), 'Disable removes independent Chrome actor and tracking');
    native.close();
    await Scripting.sleep(250);
    print('PASS: reserved scrollbar, uniform window opacity, row detail windows, independent pin/expand, draft preservation, selected-entry save and cleanup');
}
