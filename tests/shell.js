// Run with scripts/test-shell.sh; GNOME Shell executes this module inside an
// isolated headless compositor with temporary XDG data. Never use personal data.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {createNativeTestWindow, copyNativeWindowText, pasteIntoShellEntry} from './nativeWindow.js';

export const METRICS = {};
const uuid = 'dayline@marekbartczak.github.io';
function assert(condition, message) {
    if (!condition)
        throw new Error(`Dayline: ${message}`);
}
function find(actor, name) {
    if (actor.accessible_name === name)
        return actor;
    for (const child of actor.get_children()) {
        const result = find(child, name);
        if (result)
            return result;
    }
    return null;
}
function click(panel, name) {
    const actor = find(panel.menu.actor, name);
    assert(actor, `Missing accessible control: ${name}`);
    actor.emit('clicked', 1);
}
async function capture(name) {
    const directory = GLib.getenv('DAYLINE_SCREENSHOTS');
    if (!directory)
        return;
    GLib.mkdir_with_parents(directory, 0o755);
    const stream = Gio.File.new_for_path(`${directory}/${name}.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const panel = Main.panel.statusArea[uuid];
    const [x, y] = panel.menu.actor.get_transformed_position();
    const [width, height] = panel.menu.actor.get_transformed_size();
    const start = Math.max(0, Math.floor(x) - 16);
    await new Shell.Screenshot().screenshot_area(start, 0, Math.min(global.stage.width - start, Math.ceil(width) + 32), Math.min(global.stage.height, Math.ceil(y + height) + 16), stream);
    stream.close(null);
}

export async function run() {
    print('Dayline test: starting');
    Main.overview.hide();
    await Scripting.sleep(1000);
    const extension = Main.extensionManager.lookup(uuid);
    assert(extension?.stateObj, `Extension did not enable: ${JSON.stringify(extension?.errors)}`);
    const app = extension.stateObj;
    app.settings.set_string('appearance', 'dark');
    const panel = Main.panel.statusArea[uuid];
    assert(panel && panel.counter.text === '0', 'Initial panel count must be zero');
    panel.menu.open();
    print('Dayline test: popup opened');
    await Scripting.sleep(200);
    panel.composer.set_text('Call the client about the project');
    click(panel, 'Add entry');
    print('Dayline test: task added');
    assert(panel.counter.text === '1', 'Adding today task must update count');
    const task = app.store.data.tasks[0];
    click(panel, 'Start task');
    assert(panel.counter.text === '0' && panel.inProgressCounter.text === '▶ 1', 'In-progress task must move from waiting count to green count');
    click(panel, 'Move to waiting');
    assert(panel.counter.text === '1' && panel.inProgressCounter.text === '▶ 0', 'Waiting task must return to waiting count');
    click(panel, `Complete: ${task.text}`);
    assert(panel.counter.text === '0', 'Completion must update count');
    click(panel, `Reopen: ${task.text}`);
    assert(panel.counter.text === '1', 'Reopen must update count');
    click(panel, `Edit: ${task.text}`);
    assert(panel.editor, 'Task editor must open');
    assert(panel.root.width < 420, 'Default popup must be compact');
    const originalEditor = panel.editor;
    const originalDate = panel.editor.date.get_text();
    panel.editor.text.set_text('Draft to paste\nSecond line');
    panel.editor.text.clutter_text.set_selection(0, 5);
    assert(Main.modalCount > 0, 'Ordinary popup must hold its normal modal grab');
    click(panel, 'Pin panel');
    assert(panel.pinning.pinned && Main.modalCount === 0 && Main.panel.menuManager.activeMenu !== panel.menu, 'Pin must release modal grab');
    assert(panel.menu.isOpen && panel.editor === originalEditor, 'Pin must preserve open editor actor');
    assert(panel.editor.text.clutter_text.get_selection() === 'Draft', 'Pin must preserve text selection');
    const nativeWindow = await createNativeTestWindow();
    const window = nativeWindow.window;
    assert(window, 'An external application window must exist for focus test');
    window.activate(global.get_current_time());
    await Scripting.sleep(200);
    assert(panel.menu.isOpen && panel.editor.text.get_text() === 'Draft to paste\nSecond line', 'External app focus must not hide panel or lose draft');
    assert(panel.editor.date.get_text() === originalDate, 'Pin must preserve date');
    await copyNativeWindowText(nativeWindow);
    await pasteIntoShellEntry(panel.editor.text);
    assert(panel.editor.text.get_text().includes('External application text'), 'Pinned editor must accept text copied in a native application');
    await capture('editor-pinned');
    click(panel, 'Expand editor');
    await Scripting.sleep(300);
    assert(panel.expanded && panel.pinning.pinned && Main.modalCount === 0, 'Expanded editor must preserve pin state');
    assert(panel.root.width > 500 && !panel.summary.visible, 'Expanded editor must offer more space');
    assert(panel.editor === originalEditor && panel.editor.text.get_text().includes('External application text'), 'Expansion must preserve unsaved editor contents');
    const shortDraft = panel.editor.text.get_text();
    const longDraft = Array.from({length: 24}, (_, i) => `Step ${i + 1}: review the design and record implementation details.`).join('\n');
    panel.editor.text.set_text(longDraft);
    await Scripting.sleep(200);
    assert(panel.editor.text.get_text() === longDraft && panel.scroll.height < Main.layoutManager.primaryMonitor.height, 'Long task details must remain complete inside bounded scrolling');
    await capture('editor-expanded');
    const themeContext = St.ThemeContext.get_for_stage(global.stage);
    const originalScale = themeContext.scale_factor;
    themeContext.scale_factor = 2;
    panel.adjustSize();
    await Scripting.sleep(300);
    assert(panel.root.width > 1000 && panel.root.width <= Main.layoutManager.primaryMonitor.width, 'Expanded width must respect HiDPI actor pixels and screen bounds');
    await capture('editor-hidpi');
    panel.setExpanded(false, false);
    assert(panel.root.width === 382 * 2, 'Compact width must scale with HiDPI text and padding');
    themeContext.scale_factor = originalScale;
    panel.setExpanded(true, false);
    await Scripting.sleep(200);
    panel.editor.text.set_text(shortDraft);
    click(panel, 'Compact editor');
    await Scripting.sleep(300);
    assert(!panel.expanded && panel.root.width < 420 && panel.pinning.pinned, 'Compacting must preserve pin and restore size');
    click(panel, 'Unpin panel');
    assert(!panel.pinning.pinned && Main.modalCount > 0 && Main.panel.menuManager.activeMenu === panel.menu, 'Unpin must restore normal popup modal behavior');
    assert(panel.editor === originalEditor && panel.editor.text.get_text().includes('External application text'), 'Unpin must preserve unsaved pasted text');
    click(panel, 'Pin panel');
    click(panel, 'Close pinned panel');
    assert(!panel.menu.isOpen && Main.modalCount === 0, 'Explicit pinned close must release input');
    panel.menu.open();
    assert(panel.pinning.pinned && Main.modalCount === 0 && panel.editor === originalEditor, 'Pinned reopen must preserve draft and remain nonmodal');
    click(panel, 'Unpin panel');
    nativeWindow.close();
    panel.editor.text.set_text('Discuss the new website mockups');
    click(panel, 'Save changes');
    assert(app.store.data.tasks[0].text === 'Discuss the new website mockups', 'Editor must save changes');
    const today = app.today;
    const date = new Date(); date.setDate(date.getDate() + 1);
    const tomorrow = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    click(panel, 'Edit: Discuss the new website mockups');
    panel.editor.date.set_text(tomorrow);
    click(panel, 'Save changes');
    assert(panel.counter.text === '0', 'Rescheduling out of today must update counter');
    click(panel, 'Calendar');
    panel.selectDate(tomorrow);
    click(panel, 'Edit: Discuss the new website mockups');
    panel.editor.date.set_text(today);
    click(panel, 'Save changes');
    assert(panel.counter.text === '1', 'Rescheduling back to today must update counter');
    click(panel, 'Calendar');
    print('Dayline test: calendar opened');
    panel.selectDate(tomorrow);
    panel.composer.set_text('Add report export to the task');
    click(panel, 'Add entry');
    assert(app.store.data.tasks[1].date === tomorrow && panel.counter.text === '1', 'Calendar composer must use selected day');
    app.start(app.store.data.tasks[1].id);
    assert(panel.inProgressCounter.text === '▶ 0' && panel.counter.text === '1', 'Future in-progress tasks must not enter today counters');
    click(panel, 'Notes');
    print('Dayline test: notes opened');
    panel.composer.set_text('Add search to this project');
    click(panel, 'Add entry');
    assert(app.store.data.notes.length === 1, 'Notes must be undated');
    const note = app.store.data.notes[0];
    click(panel, `Edit: ${note.text}`);
    panel.editor.text.set_text('<b>Literal note</b>\nSecond line');
    click(panel, 'Save changes');
    assert(app.store.data.notes[0].text.includes('\n'), 'Multiline literal notes must survive editing');
    click(panel, 'Delete note');
    assert(app.store.data.notes.length === 0, 'Delete must remove note');
    click(panel, 'Undo deletion');
    assert(app.store.data.notes.length === 1, 'Undo must restore note');
    click(panel, 'Today');
    panel.composer.set_text('Prepare a short sprint summary');
    click(panel, 'Add entry');
    panel.composer.set_text('Send a proposed meeting date');
    click(panel, 'Add entry');
    panel.composer.set_text('Review the pull request');
    click(panel, 'Add entry');
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const previous = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    app.add('tasks', 'Reply to the team', previous);
    app.toggle(app.store.data.tasks[2].id);
    await Scripting.sleep(500);
    assert(panel.counter.text === '3', 'Overdue and completed tasks must not count');
    app.start(app.store.data.tasks[0].id);
    assert(panel.counter.text === '2' && panel.inProgressCounter.text === '▶ 1', 'Today counters must separate active and waiting tasks');
    await capture('today-dark');
    click(panel, 'Calendar');
    panel.selectDate(today);
    await Scripting.sleep(300);
    await capture('calendar-dark');
    click(panel, 'Notes');
    panel.composer.set_text('Idea: simplify the form and add a preview before saving.');
    click(panel, 'Add entry');
    await Scripting.sleep(300);
    await capture('notes-dark');
    app.settings.set_string('appearance', 'light');
    click(panel, 'Today');
    await Scripting.sleep(300);
    await capture('today-light');
    for (const accent of ['system', 'ubuntu', 'violet', 'blue', 'green', 'rose']) {
        app.settings.set_string('accent', accent);
        await Scripting.sleep(50);
        assert(panel.accentName, 'Each color theme must resolve to a palette');
    }
    app.settings.set_string('accent', 'ubuntu');
    app.settings.set_int('opacity', 60);
    assert(panel.menu.actor.get_style().includes(', 1)') && panel.menu.actor.opacity === 153 && panel.root.opacity === 255, 'Opacity must uniformly affect the full window once');
    app.settings.set_int('opacity', 100);
    const healthy = app.store.data;
    app.store.file.replace_contents('{broken', null, false, Gio.FileCreateFlags.PRIVATE, null);
    app.reload();
    assert(panel.counter.text === '!' && panel.message.visible, 'Corruption must show a recovery warning');
    app.store.restore(healthy);
    app.reload();
    assert(panel.counter.text === '2' && panel.inProgressCounter.text === '▶ 1' && !panel.message.visible, 'Successful recovery must restore status counts and clear stale warning');
    panel.menu.close();
    panel.menu.open();
    click(panel, 'Pin panel');
    const oldMenu = panel.menu;
    await Main.extensionManager.disableExtension(uuid);
    assert(!Main.panel.statusArea[uuid] && !app.panel && !app.timer, 'Disable must remove panel and timer');
    assert(Main.modalCount === 0 && !Main.panel.menuManager._menus.includes(oldMenu), 'Disable pinned panel must not leak grabs or menu registration');
    assert(!Main.uiGroup.get_children().includes(oldMenu.actor), 'Disable must remove popup from the stage before disposal');
    await Main.extensionManager.enableExtension(uuid);
    assert(Main.panel.statusArea[uuid].counter.text === '2' && Main.panel.statusArea[uuid].inProgressCounter.text === '▶ 1', 'Re-enable must restore persisted task statuses');
    await Scripting.sleep(300);
    print('PASS: Dayline GNOME Shell UI, status counts, pinning, external focus/paste, compact/expanded HiDPI editor, opacity/themes and lifecycle');
}
