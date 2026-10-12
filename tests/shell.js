// Run with scripts/test-shell.sh; GNOME Shell executes this module inside an
// isolated headless compositor with temporary XDG data. Never use personal data.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

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
    panel.composer.set_text('Zadzwonić do klienta w sprawie projektu');
    click(panel, 'Dodaj wpis');
    print('Dayline test: task added');
    assert(panel.counter.text === '1', 'Adding today task must update count');
    const task = app.store.data.tasks[0];
    click(panel, `Ukończ: ${task.text}`);
    assert(panel.counter.text === '0', 'Completion must update count');
    click(panel, `Przywróć: ${task.text}`);
    assert(panel.counter.text === '1', 'Reopen must update count');
    click(panel, `Edytuj: ${task.text}`);
    assert(panel.editor, 'Task editor must open');
    panel.editor.text.set_text('Omówić makiety nowej strony');
    click(panel, 'Zapisz zmiany');
    assert(app.store.data.tasks[0].text === 'Omówić makiety nowej strony', 'Editor must save changes');
    const today = app.today;
    const date = new Date(); date.setDate(date.getDate() + 1);
    const tomorrow = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    click(panel, 'Edytuj: Omówić makiety nowej strony');
    panel.editor.date.set_text(tomorrow);
    click(panel, 'Zapisz zmiany');
    assert(panel.counter.text === '0', 'Rescheduling out of today must update counter');
    click(panel, 'Kalendarz');
    panel.selectDate(tomorrow);
    click(panel, 'Edytuj: Omówić makiety nowej strony');
    panel.editor.date.set_text(today);
    click(panel, 'Zapisz zmiany');
    assert(panel.counter.text === '1', 'Rescheduling back to today must update counter');
    click(panel, 'Kalendarz');
    print('Dayline test: calendar opened');
    panel.selectDate(tomorrow);
    panel.composer.set_text('Dodać eksport raportu do taska');
    click(panel, 'Dodaj wpis');
    assert(app.store.data.tasks[1].date === tomorrow && panel.counter.text === '1', 'Calendar composer must use selected day');
    click(panel, 'Notatki');
    print('Dayline test: notes opened');
    panel.composer.set_text('W tym zadaniu musimy dorobić wyszukiwanie');
    click(panel, 'Dodaj wpis');
    assert(app.store.data.notes.length === 1, 'Notes must be undated');
    const note = app.store.data.notes[0];
    click(panel, `Edytuj: ${note.text}`);
    panel.editor.text.set_text('<b>Dosłowna notatka</b>\nDrugi wiersz');
    click(panel, 'Zapisz zmiany');
    assert(app.store.data.notes[0].text.includes('\n'), 'Multiline literal notes must survive editing');
    click(panel, 'Usuń notatkę');
    assert(app.store.data.notes.length === 0, 'Delete must remove note');
    click(panel, 'Cofnij usunięcie');
    assert(app.store.data.notes.length === 1, 'Undo must restore note');
    click(panel, 'Dzisiaj');
    panel.composer.set_text('Przygotować krótkie podsumowanie sprintu');
    click(panel, 'Dodaj wpis');
    panel.composer.set_text('Wysłać propozycję terminu spotkania');
    click(panel, 'Dodaj wpis');
    panel.composer.set_text('Przejrzeć zmiany w pull requeście');
    click(panel, 'Dodaj wpis');
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const previous = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    app.add('tasks', 'Odpowiedzieć na wiadomość od zespołu', previous);
    app.toggle(app.store.data.tasks[2].id);
    await Scripting.sleep(500);
    assert(panel.counter.text === '3', 'Overdue and completed tasks must not count');
    await capture('today-dark');
    click(panel, 'Kalendarz');
    panel.selectDate(today);
    await Scripting.sleep(300);
    await capture('calendar-dark');
    click(panel, 'Notatki');
    panel.composer.set_text('Pomysł: uprościć formularz i dodać podgląd przed zapisaniem.');
    click(panel, 'Dodaj wpis');
    await Scripting.sleep(300);
    await capture('notes-dark');
    app.settings.set_string('appearance', 'light');
    click(panel, 'Dzisiaj');
    await Scripting.sleep(300);
    await capture('today-light');
    const healthy = app.store.data;
    app.store.file.replace_contents('{broken', null, false, Gio.FileCreateFlags.PRIVATE, null);
    app.reload();
    assert(panel.counter.text === '!' && panel.message.visible, 'Corruption must show a recovery warning');
    app.store.restore(healthy);
    app.reload();
    assert(panel.counter.text === '3' && !panel.message.visible, 'Successful recovery must clear stale storage warning');
    panel.menu.close();
    await Main.extensionManager.disableExtension(uuid);
    assert(!Main.panel.statusArea[uuid] && !app.panel && !app.timer, 'Disable must remove panel and timer');
    await Main.extensionManager.enableExtension(uuid);
    assert(Main.panel.statusArea[uuid].counter.text === '3', 'Re-enable must restore persisted tasks');
    print('PASS: Dayline GNOME Shell UI, calendar, notes, CRUD, undo, themes, lifecycle');
}
