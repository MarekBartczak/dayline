import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {Store, readDocument, writeDocument, dataPath} from './store.js';

export default class DaylinePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(580, 640);
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Dayline', icon_name: 'view-calendar-symbolic'});
        window.add(page);
        const appearanceGroup = new Adw.PreferencesGroup({title: 'Twój spokojniejszy dzień', description: 'Zadania i notatki zawsze pod ręką, w górnym pasku GNOME.'});
        page.add(appearanceGroup);
        const values = ['system', 'light', 'dark'];
        const appearance = new Adw.ComboRow({title: 'Wygląd panelu', model: Gtk.StringList.new(['Zgodny z systemem', 'Jasny', 'Ciemny']), selected: Math.max(0, values.indexOf(settings.get_string('appearance')))});
        appearance.connect('notify::selected', () => settings.set_string('appearance', values[appearance.selected]));
        appearanceGroup.add(appearance);

        const backups = new Adw.PreferencesGroup({title: 'Dane i kopie zapasowe', description: 'Wszystko jest zapisane lokalnie. Kopia zawiera zadania i notatki.'});
        page.add(backups);
        const action = (title, subtitle, icon, callback) => {
            const row = new Adw.ActionRow({title, subtitle, activatable: true});
            row.add_prefix(new Gtk.Image({icon_name: icon}));
            row.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
            row.connect('activated', callback);
            backups.add(row);
        };
        const errorDialog = error => new Adw.AlertDialog({heading: 'Nie udało się wykonać operacji', body: error.message}).present(window);
        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        const json = new Gtk.FileFilter({name: 'Kopia Dayline (.json)'});
        json.add_pattern('*.json');
        filters.append(json);
        action('Eksportuj kopię', 'Zapisz wszystkie zadania i notatki do pliku JSON.', 'document-save-symbolic', () => {
            const store = new Store();
            if (store.error) { errorDialog(new Error(store.error)); return; }
            const dialog = new Gtk.FileDialog({title: 'Eksportuj kopię Dayline', initial_name: `dayline-${new Date().toISOString().slice(0, 10)}.json`, filters});
            dialog.save(window, null, (source, result) => {
                try { writeDocument(source.save_finish(result), store.data); }
                catch (error) { if (!error.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED)) errorDialog(error); }
            });
        });
        action('Importuj lub przywróć kopię', 'Zastąp listę kopią. Obecne dane zachowamy jako backup.', 'document-open-symbolic', () => {
            const picker = new Gtk.FileDialog({title: 'Importuj kopię Dayline', filters});
            picker.open(window, null, (source, result) => {
                let document;
                try { document = readDocument(source.open_finish(result)); }
                catch (error) { if (!error.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED)) errorDialog(error); return; }
                const confirm = new Adw.AlertDialog({heading: 'Przywrócić tę kopię?', body: `Kopia zawiera ${document.tasks.length} zadań i ${document.notes.length} notatek. Zastąpi obecną listę. Poprzedni plik zachowamy obok danych.`});
                confirm.add_response('cancel', 'Anuluj');
                confirm.add_response('restore', 'Przywróć kopię');
                confirm.set_response_appearance('restore', Adw.ResponseAppearance.DESTRUCTIVE);
                confirm.set_default_response('cancel');
                confirm.set_close_response('cancel');
                confirm.choose(window, null, (dialog, response) => {
                    if (dialog.choose_finish(response) !== 'restore') return;
                    try { new Store().restore(document); }
                    catch (error) { errorDialog(error); }
                });
            });
        });
        action('Otwórz katalog danych', dataPath(), 'folder-open-symbolic', () => {
            const directory = Gio.File.new_for_path(dataPath()).get_parent();
            GLib.mkdir_with_parents(directory.get_path(), 0o700);
            Gtk.FileLauncher.new(directory).launch(window, null, (source, result) => {
                try { source.launch_finish(result); } catch (error) { errorDialog(error); }
            });
        });
        const info = new Adw.PreferencesGroup({title: 'Małe narzędzie. Więcej miejsca w głowie.'});
        info.add(new Adw.ActionRow({title: 'Dayline 0.1.0', subtitle: 'Licznik obejmuje wyłącznie niezrobione zadania na dziś.\nZaległe zadania znajdziesz w osobnej sekcji.'}));
        page.add(info);
    }
}
