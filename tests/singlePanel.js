import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {createNativeTestWindow, copyNativeWindowText, pasteIntoShellEntry} from './nativeWindow.js';

export const METRICS = {};
const uuid = 'dayline@marekbartczak.github.io';
function assert(value, message) { if (!value) throw new Error(`Single panel: ${message}`); }
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
    assert(rowX + row.width <= scrollX + panel.scroll.width - 12, 'Card must leave a scrollbar gutter');
    app.settings.set_int('opacity', 60);
    assert(panel.menu.actor.opacity === 153 && panel.root.opacity === 255 && row.get_paint_opacity() === 153, 'Whole popup inherits opacity exactly once');
    await capture(panel.menu.actor, 'uniform-opacity');
    app.settings.set_int('opacity', 100);
    panel.pinning.setPinned(true);
    const popup = panel.menu.actor;
    const chromeCount = Main.layoutManager._trackedActors.length;
    const listWidth = panel.root.width;
    click(popup, `Expand task: ${first.text}`);
    await Scripting.sleep(220);
    const selected = panel.editor;
    assert(selected && panel.menu.isOpen && panel.expanded && !panel.details && panel.menu.actor === popup, 'List transitions to selected entry in one popup');
    assert(Main.layoutManager._trackedActors.length === chromeCount && panel.root.width > listWidth, 'Expansion adds no separate Chrome actor');
    assert(!panel.summary.visible && !panel.tabsBox.visible && !panel.composerArea.visible, 'List controls are replaced by editor');
    assert(selected.text.get_text() === first.text && panel.pinning.pinned && Main.modalCount === 0, 'Selected text and pin are preserved');
    selected.text.set_text('Unfinished single-panel draft');
    selected.date.set_text('2026-12-18');
    const native = await createNativeTestWindow();
    await copyNativeWindowText(native);
    await pasteIntoShellEntry(selected.text);
    assert(panel.menu.isOpen && panel.editor === selected && selected.text.get_text().includes('External application text'), 'Pinned editor accepts copied native text without replacement');
    const context = St.ThemeContext.get_for_stage(global.stage);
    const scale = context.scale_factor;
    context.scale_factor = 2;
    panel.adjustSize();
    await Scripting.sleep(220);
    assert(panel.root.width > 1000 && panel.root.width <= Main.layoutManager.primaryMonitor.width, 'Expanded editor fits HiDPI screen');
    context.scale_factor = scale;
    panel.adjustSize();
    await Scripting.sleep(220);
    app.settings.set_int('opacity', 65);
    assert(popup.opacity === 166 && selected.text.get_paint_opacity() === 166, 'Editor uses uniform opacity');
    app.settings.set_int('opacity', 100);
    await capture(popup, 'single-panel-expanded');
    click(popup, 'Back to list');
    await Scripting.sleep(220);
    assert(!panel.editor && !panel.expanded && panel.root.width === listWidth && panel.pinning.pinned && panel.summary.visible && panel.tabsBox.visible, 'Back restores compact list with pin');
    click(popup, `Expand task: ${first.text}`);
    await Scripting.sleep(220);
    assert(panel.editor.text.get_text().includes('Unfinished single-panel draft') && panel.editor.date.get_text() === '2026-12-18', 'Reopening selected entry retains its draft');
    panel.editor.text.set_text('Updated only the selected task');
    click(popup, 'Save changes');
    await Scripting.sleep(220);
    assert(!panel.editor && !panel.entryDrafts.size && panel.root.width === listWidth && panel.menu.isOpen, 'Save restores same compact list and clears draft');
    assert(app.store.data.tasks.find(item => item.id === first.id).text === 'Updated only the selected task' && app.store.data.tasks.find(item => item.id === other.id).text === other.text, 'Only selected task changes');
    click(popup, `Expand task: ${other.text}`);
    await Scripting.sleep(220);
    panel.editor.text.set_text('Draft to discard');
    click(popup, 'Cancel');
    await Scripting.sleep(220);
    assert(!panel.editor && !panel.entryDrafts.size, 'Cancel discards draft and returns list');
    app.add('notes', 'Synthetic ordinary note', null);
    panel.selectTab('notes');
    const note = app.store.data.notes[0];
    click(popup, `Expand note: ${note.text}`);
    await Scripting.sleep(220);
    assert(panel.editor.kind === 'notes' && !panel.editor.date && panel.expanded, 'Note opens expanded undated editor in same panel');
    panel.editor.text.set_text('Note draft');
    click(popup, 'Back to list');
    await Scripting.sleep(220);
    assert(panel.tab === 'notes' && panel.entryDrafts.get(`notes/${note.id}`).text === 'Note draft', 'Back restores original notes tab and draft');
    click(popup, `Expand note: ${note.text}`);
    await Scripting.sleep(220);
    Main.screenShield._isLocked = true;
    try { Main.screenShield.emit('locked-changed'); } finally { Main.screenShield._isLocked = false; }
    assert(!panel.menu.isOpen && panel.editor.text.get_text() === 'Note draft', 'Screen lock hides popup while retaining public edit');
    panel.menu.open();
    await Scripting.sleep(220);
    const trackedPopup = panel.menu.actor;
    await Main.extensionManager.disableExtension(uuid);
    assert(!Main.uiGroup.get_children().includes(trackedPopup) && !Main.layoutManager._trackedActors.some(entry => entry.actor === trackedPopup) && Main.modalCount === 0, 'Disable cleans up the only popup and input');
    native.close();
    await Scripting.sleep(250);
    print('PASS: one popup transitions list/editor, preserves pin/drafts/selected save, restores compact size, uniform opacity, scrollbar, HiDPI and lifecycle');
}
