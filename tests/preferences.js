import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
const {default: Preferences} = await import('../prefs.js');
const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path();
const [, bytes] = Gio.File.new_for_path(`${path}/metadata.json`).load_contents(null);
const metadata = {...JSON.parse(new TextDecoder().decode(bytes)), path, dir: Gio.File.new_for_path(path)};
const app = new Adw.Application({application_id: 'io.github.marekbartczak.DaylineTest', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    const window = new Adw.PreferencesWindow({application: app});
    new Preferences(metadata).fillPreferencesWindow(window);
    window.present();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        if (!window.visible || window.default_width !== 580)
            throw new Error('Preferences did not render');
        print('PASS: GTK4/libadwaita preferences window');
        window.close();
        app.quit();
        return GLib.SOURCE_REMOVE;
    });
});
app.run([]);
