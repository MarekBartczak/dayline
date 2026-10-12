import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import System from 'system';

GLib.setenv('GIO_USE_VFS', 'local', true);
Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
const {default: Preferences} = await import('../prefs.js');
const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const [, bytes] = Gio.File.new_for_path(`${path}/metadata.json`).load_contents(null);
// Compile the source schema in isolation so the test cannot use an old build.
const schemaDirectory = GLib.dir_make_tmp('dayline-preferences-XXXXXX');
GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
GLib.setenv('XDG_DATA_HOME', `${schemaDirectory}/data`, true);
GLib.mkdir_with_parents(`${schemaDirectory}/schemas`, 0o700);
const [, , compileError, compileStatus] = GLib.spawn_sync(null,
    ['glib-compile-schemas', '--strict', '--targetdir', `${schemaDirectory}/schemas`, `${path}/schemas`],
    null, GLib.SpawnFlags.SEARCH_PATH, null);
if (compileStatus !== 0)
    throw new Error(new TextDecoder().decode(compileError));
const metadata = {...JSON.parse(new TextDecoder().decode(bytes)), path, dir: Gio.File.new_for_path(schemaDirectory)};
let failed = false;
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
function descendants(widget) {
    const widgets = [widget];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        widgets.push(...descendants(child));
    return widgets;
}
function removeTemporaryTree(file) {
    if (file.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) === Gio.FileType.DIRECTORY) {
        const children = file.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        for (let info = children.next_file(null); info; info = children.next_file(null))
            removeTemporaryTree(file.get_child(info.get_name()));
        children.close(null);
    }
    file.delete(null);
}
const app = new Adw.Application({application_id: 'io.github.marekbartczak.DaylineTest', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    const window = new Adw.PreferencesWindow({application: app});
    const preferences = new Preferences(metadata);
    const settings = preferences.getSettings();
    preferences.fillPreferencesWindow(window);
    window.present();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        try {
            assert(window.visible && window.default_width === 580, 'Preferences did not render');
            const widgets = descendants(window);
            const row = title => widgets.find(widget => widget instanceof Adw.PreferencesRow && widget.title === title);
            const group = title => widgets.find(widget => widget instanceof Adw.PreferencesGroup && widget.title === title);
            assert(group('Appearance'), 'Appearance group must be in English');
            assert(group('Data and backups'), 'Backup group must be in English');
            for (const title of ['Export backup', 'Import or restore backup', 'Open data folder', 'Dayline 0.2.0'])
                assert(row(title), `Missing English preferences label: ${title}`);

            const appearance = row('Panel appearance');
            assert(appearance instanceof Adw.ComboRow, 'Appearance must offer a combo control');
            assert(['Follow system', 'Light', 'Dark'].every((label, index) => appearance.model.get_string(index) === label), 'Appearance choices must be in English');
            appearance.selected = 2;
            assert(settings.get_string('appearance') === 'dark', 'Appearance selection must save');

            const accent = row('Accent color');
            assert(accent instanceof Adw.ComboRow, 'Accent must offer a combo control');
            assert(settings.get_string('accent') === 'ubuntu' && accent.selected === 1, 'Ubuntu Orange must be the default accent');
            const accents = ['system', 'ubuntu', 'violet', 'blue', 'green', 'rose'];
            const labels = ['System accent', 'Ubuntu Orange', 'Violet', 'Blue', 'Green', 'Rose'];
            for (const [index, value] of accents.entries()) {
                assert(accent.model.get_string(index) === labels[index], `Wrong accent label: ${value}`);
                accent.selected = index;
                assert(settings.get_string('accent') === value, `Accent selection must save: ${value}`);
            }

            const opacity = row('Background opacity');
            assert(opacity instanceof Adw.SpinRow, 'Opacity must offer a spin control');
            assert(opacity.adjustment.lower === 20 && opacity.adjustment.upper === 100, 'Opacity must be bounded to 20–100 percent');
            assert(settings.get_int('opacity') === 100 && opacity.value === 100, 'Background must default to full opacity');
            opacity.value = 20;
            assert(settings.get_int('opacity') === 20, 'Opacity control must save');
            settings.set_int('opacity', 65);
            assert(opacity.value === 65, 'Opacity must follow external settings updates');
            opacity.value = 100;
            assert(settings.get_int('opacity') === 100, 'Maximum opacity must save');

            const compact = row('Compact layout');
            assert(compact instanceof Adw.SwitchRow, 'Compact layout must offer a switch');
            assert(settings.get_boolean('compact') && compact.active, 'Compact layout must default to enabled');
            compact.active = false;
            assert(!settings.get_boolean('compact'), 'Compact layout control must save');
            settings.set_boolean('compact', true);
            assert(compact.active, 'Compact layout must follow external settings updates');

            const dataFile = Gio.File.new_for_path(row('Open data folder').subtitle);
            assert(dataFile.get_path().startsWith(`${schemaDirectory}/data/`), 'Backup test data must be isolated');
            GLib.mkdir_with_parents(dataFile.get_parent().get_path(), 0o700);
            dataFile.replace_contents('{broken', null, false, Gio.FileCreateFlags.PRIVATE, null);
            row('Export backup').emit('activated');
            const errorDialog = window.get_visible_dialog();
            assert(errorDialog instanceof Adw.AlertDialog && errorDialog.heading === 'Unable to complete the operation', 'Failed export must show an English error');
            assert(errorDialog.has_response('close') && errorDialog.get_response_label('close') === 'Close', 'Error dialog must have an explicit Close button');
            assert(errorDialog.default_response === 'close' && errorDialog.close_response === 'close', 'Error dialog must close with its Close response');
            const [, preservedBytes] = dataFile.load_contents(null);
            assert(new TextDecoder().decode(preservedBytes) === '{broken', 'Failed export must preserve the original data');
            errorDialog.close();
            print('PASS: English GTK4 preferences, accent choices and appearance setting persistence');
        } catch (error) {
            failed = true;
            printerr(`FAIL: ${error.message}`);
        } finally {
            window.close();
            app.quit();
        }
        return GLib.SOURCE_REMOVE;
    });
});
try {
    app.run([]);
} finally {
    removeTemporaryTree(Gio.File.new_for_path(schemaDirectory));
}
if (failed)
    System.exit(1);
