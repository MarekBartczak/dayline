// Standalone GTK client used only by the isolated GNOME Shell test compositor.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';

GLib.set_prgname('Gnome-shell-perf-helper');
Gdk.set_allowed_backends('wayland');
const app = new Gtk.Application({
    application_id: 'org.dayline.NativeTestWindow',
    flags: Gio.ApplicationFlags.NON_UNIQUE,
});
app.connect('activate', () => {
    const window = new Gtk.ApplicationWindow({
        application: app,
        title: ARGV[0] ?? 'Dayline native test window',
        default_width: 500,
        default_height: 300,
    });
    const entry = new Gtk.Entry({text: 'External application text'});
    window.set_child(entry);
    window.present();
    entry.grab_focus();
    entry.select_region(0, -1);
});
app.run([]);
