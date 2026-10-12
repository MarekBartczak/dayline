// Reproducible README images: synthetic entries in an isolated GNOME session.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
const uuid = 'dayline@marekbartczak.github.io';
function range(text, fragment, type) {
    const start = Array.from(text.slice(0, text.indexOf(fragment))).length;
    return {type, start, end: start + Array.from(fragment).length};
}
async function capture(panel, name) {
    const directory = GLib.getenv('DAYLINE_SCREENSHOTS');
    if (!directory) throw new Error('Set DAYLINE_SCREENSHOTS to the output directory.');
    GLib.mkdir_with_parents(directory, 0o755);
    await Scripting.sleep(350);
    const [x, y] = panel.menu.actor.get_transformed_position();
    const [width, height] = panel.menu.actor.get_transformed_size();
    const start = Math.max(0, Math.floor(x) - 16);
    const top = name.startsWith('formatted-') ? Math.max(0, Math.ceil(y)) : 0;
    const stream = Gio.File.new_for_path(`${directory}/${name}.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    await new Shell.Screenshot().screenshot_area(start, top,
        Math.min(global.stage.width - start, Math.ceil(width) + 32),
        Math.min(global.stage.height - top, Math.ceil(y + height) + 16 - top), stream);
    stream.close(null);
}
export async function run() {
    Main.overview.hide();
    await Scripting.sleep(800);
    const app = Main.extensionManager.lookup(uuid).stateObj;
    const panel = app.panel;
    app.settings.set_string('appearance', 'dark');
    app.settings.set_string('accent', 'ubuntu');
    app.settings.set_int('opacity', 100);
    app.add('tasks', 'Review the API scopes', app.today);
    app.add('tasks', 'Call the client about the release', app.today);
    app.add('tasks', 'Send the weekly project update', app.today);
    app.start(app.store.data.tasks[0].id);
    app.toggle(app.store.data.tasks[2].id);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const next = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    app.add('tasks', 'Prepare the release demo', next);
    const code = "const scopes = [\n    'tasks:read',\n    'tasks:write',\n];";
    const formatted = `Release checklist\nConfirm the final API scopes.\n• Test with a fresh account\n• Send the release note\n\n${code}`;
    const format = [range(formatted, 'Release checklist', 'bold'), range(formatted, 'Confirm the final API scopes.', 'italic'), range(formatted, code, 'code')];
    app.add('notes', formatted, null, format);
    app.add('notes', 'Next sprint\nKeep the settings simple. Add keyboard shortcuts for the actions we use every day.', null,
        [{type: 'bold', start: 0, end: 11}]);
    panel.menu.open();
    await capture(panel, 'today-dark');
    for (const accent of ['violet', 'blue', 'green', 'rose', 'ubuntu']) {
        app.settings.set_string('accent', accent);
        await capture(panel, `theme-${accent}`);
    }
    app.settings.set_string('appearance', 'light');
    await capture(panel, 'today-light');
    app.settings.set_string('appearance', 'dark');
    panel.selectTab('calendar');
    panel.selectDate(next);
    await capture(panel, 'calendar-dark');
    panel.selectTab('notes');
    await capture(panel, 'notes-dark');
    panel.pinning.setPinned(true);
    panel.openDetails('notes', app.store.data.notes[0]);
    await capture(panel, 'formatted-expanded-dark');
    panel.setExpanded(false, false);
    await capture(panel, 'formatted-compact-dark');
    panel.setExpanded(true, false);
    app.settings.set_string('appearance', 'light');
    await capture(panel, 'formatted-expanded-light');
    panel.returnToList(true);
    app.settings.set_string('appearance', 'dark');
    await app.vault.create('Synthetic screenshot vault password');
    app.vault.lock();
    panel.selectTab('private');
    await capture(panel, 'private-locked');
    await Main.extensionManager.disableExtension(uuid);
    print('PASS: 13 native README screenshots captured with synthetic data');
}
