import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {Store, readDocument, dataPath} from './store.js';
import {ImageStore} from './imageStore.js';

export default class DaylinePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(580, 640);
        const images = new ImageStore();
        const cancellable = new Gio.Cancellable();
        let closed = false;
        window.connect('close-request', () => {
            closed = true;
            cancellable.cancel();
            images.dispose();
            return false;
        });
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Dayline', icon_name: 'view-calendar-symbolic'});
        window.add(page);
        const appearanceGroup = new Adw.PreferencesGroup({title: 'Appearance', description: 'Tasks and notes always close at hand, in the GNOME top bar.'});
        page.add(appearanceGroup);
        const values = ['system', 'light', 'dark'];
        const appearance = new Adw.ComboRow({title: 'Panel appearance', model: Gtk.StringList.new(['Follow system', 'Light', 'Dark']), selected: Math.max(0, values.indexOf(settings.get_string('appearance')))});
        appearance.connect('notify::selected', () => settings.set_string('appearance', values[appearance.selected]));
        appearanceGroup.add(appearance);

        const accents = ['system', 'ubuntu', 'violet', 'blue', 'green', 'rose'];
        const accent = new Adw.ComboRow({title: 'Accent color', model: Gtk.StringList.new(['System accent', 'Ubuntu Orange', 'Violet', 'Blue', 'Green', 'Rose']), selected: Math.max(0, accents.indexOf(settings.get_string('accent')))});
        accent.connect('notify::selected', () => settings.set_string('accent', accents[accent.selected]));
        appearanceGroup.add(accent);

        const opacity = new Adw.SpinRow({title: 'Window opacity', subtitle: '20–100%. Fade the entire popup, including text and controls.', adjustment: new Gtk.Adjustment({lower: 20, upper: 100, step_increment: 5, page_increment: 10}), digits: 0});
        settings.bind('opacity', opacity, 'value', Gio.SettingsBindFlags.DEFAULT);
        appearanceGroup.add(opacity);

        const compact = new Adw.SwitchRow({title: 'Compact layout', subtitle: 'Use a smaller panel with tighter spacing.'});
        settings.bind('compact', compact, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearanceGroup.add(compact);

        const backups = new Adw.PreferencesGroup({title: 'Data and backups', description: 'Everything is saved locally. Backups contain your tasks, attached images and public notes.'});
        page.add(backups);
        const action = (title, subtitle, icon, callback) => {
            const row = new Adw.ActionRow({title, subtitle, activatable: true});
            row.add_prefix(new Gtk.Image({icon_name: icon}));
            row.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
            row.connect('activated', callback);
            backups.add(row);
        };
        const errorDialog = error => {
            if (closed) return;
            const dialog = new Adw.AlertDialog({heading: 'Unable to complete the operation', body: error.message});
            dialog.add_response('close', 'Close');
            dialog.set_default_response('close');
            dialog.set_close_response('close');
            dialog.present(window);
        };
        const zip = new Gtk.FileFilter({name: 'Dayline backup (.zip)'});
        zip.add_pattern('*.zip');
        const json = new Gtk.FileFilter({name: 'Legacy Dayline backup (.json)'});
        json.add_pattern('*.json');
        const exportFilters = new Gio.ListStore({item_type: Gtk.FileFilter});
        exportFilters.append(zip);
        const importFilters = new Gio.ListStore({item_type: Gtk.FileFilter});
        importFilters.append(zip);
        importFilters.append(json);
        action('Export backup', 'Save tasks, attached images and public notes to a ZIP file.', 'document-save-symbolic', () => {
            if (closed) return;
            const store = new Store();
            if (store.error) { errorDialog(new Error(store.error)); return; }
            const dialog = new Gtk.FileDialog({title: 'Export Dayline backup', initial_name: `dayline-${new Date().toISOString().slice(0, 10)}.zip`, filters: exportFilters});
            dialog.save(window, cancellable, async (source, result) => {
                try {
                    const file = source.save_finish(result);
                    if (closed) return;
                    const path = file.get_path();
                    if (!path) throw new Error('Choose a local file for the backup.');
                    await images.exportBackup(path, store.data);
                }
                catch (error) { if (!error.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED)) errorDialog(error); }
            });
        });
        action('Import or restore backup', 'Replace your list with a backup. Your current data will be preserved.', 'document-open-symbolic', () => {
            if (closed) return;
            const picker = new Gtk.FileDialog({title: 'Import Dayline backup', filters: importFilters});
            picker.open(window, cancellable, async (source, result) => {
                let document;
                try {
                    const file = source.open_finish(result);
                    if (closed) return;
                    const path = file.get_path();
                    if (!path) throw new Error('Choose a local backup file.');
                    document = path.toLowerCase().endsWith('.json') ? readDocument(file) : await images.importBackup(path);
                    if (closed) return;
                }
                catch (error) { if (!error.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED)) errorDialog(error); return; }
                const confirm = new Adw.AlertDialog({heading: 'Restore this backup?', body: `This backup contains ${document.tasks.length} tasks and ${document.notes.length} notes. It will replace your current list. Your previous file will be preserved in the data folder.`});
                confirm.add_response('cancel', 'Cancel');
                confirm.add_response('restore', 'Restore backup');
                confirm.set_response_appearance('restore', Adw.ResponseAppearance.DESTRUCTIVE);
                confirm.set_default_response('cancel');
                confirm.set_close_response('cancel');
                confirm.choose(window, cancellable, (dialog, response) => {
                    try {
                        if (dialog.choose_finish(response) !== 'restore' || closed) return;
                        new Store().restore(document);
                    }
                    catch (error) { errorDialog(error); }
                });
            });
        });
        action('Open data folder', dataPath(), 'folder-open-symbolic', () => {
            if (closed) return;
            const directory = Gio.File.new_for_path(dataPath()).get_parent();
            GLib.mkdir_with_parents(directory.get_path(), 0o700);
            Gtk.FileLauncher.new(directory).launch(window, cancellable, (source, result) => {
                try { source.launch_finish(result); } catch (error) { errorDialog(error); }
            });
        });
        const info = new Adw.PreferencesGroup({title: 'A small tool. A clearer mind.'});
        info.add(new Adw.ActionRow({title: 'Dayline 0.4.0', subtitle: 'The counter includes only unfinished tasks for today.\nOverdue tasks appear in their own section.'}));
        page.add(info);
    }
}
