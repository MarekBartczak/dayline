import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Store} from './store.js';
import {localDate, addTask, addNote, updateTask, updateNote, removeItem, restoreItem} from './model.js';
import {DaylinePanel} from './ui/panel.js';

export default class DaylineExtension extends Extension {
    enable() {
        this.store = new Store();
        this.settings = this.getSettings();
        this.desktopSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this.today = localDate();
        this.deleted = null;
        this.panel = new DaylinePanel(this);
        Main.panel.addToStatusArea(this.uuid, this.panel, 0, 'right');
        this.settingsSignal = this.settings.connect('changed::appearance', () => this.panel.updateTheme());
        this.themeSignal = this.desktopSettings.connect('changed::color-scheme', () => this.panel.updateTheme());
        // A minute-based check also covers clock/timezone changes and sleep/resume.
        this.timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            if (localDate() !== this.today) {
                this.today = localDate();
                this.panel.refresh();
            }
            return GLib.SOURCE_CONTINUE;
        });
        this.resumeSignal = global.display.connect('notify::focus-window', () => {
            if (localDate() !== this.today) {
                this.today = localDate();
                this.panel.refresh();
            }
        });
        // Monitor the directory because replace_contents atomically changes inode.
        const parent = this.store.file.get_parent();
        if (GLib.mkdir_with_parents(parent.get_path(), 0o700) === 0) {
            this.monitor = parent.monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this.monitorSignal = this.monitor.connect('changed', (_monitor, file) => {
                if (file.equal(this.store.file)) this.reload();
            });
        }
    }

    reload() {
        this.store.reload();
        this.today = localDate();
        this.panel?.refresh();
    }

    commit(transform) {
        // Reload immediately before writes to honor edits made in preferences.
        this.store.reload();
        this.store.save(transform(this.store.data));
        this.panel.refresh();
        if (!this.deleted) this.panel.message.hide();
    }

    add(kind, text, date) {
        const item = {id: GLib.uuid_string_random(), text, createdAt: new Date().toISOString()};
        this.commit(data => kind === 'notes' ? addNote(data, item) : addTask(data, {...item, date}));
    }

    edit(kind, id, text, date) {
        this.commit(data => kind === 'notes' ? updateNote(data, id, {text}) : updateTask(data, id, {text, date}));
    }

    toggle(id) {
        try {
            this.commit(data => {
                const item = data.tasks.find(task => task.id === id);
                if (!item) throw new Error('Ten wpis już nie istnieje.');
                return updateTask(data, id, {done: !item.done});
            });
        } catch (error) { this.panel.showMessage(error.message); }
    }

    remove(kind, id) {
        try {
            let removed;
            this.commit(data => {
                removed = data[kind].find(item => item.id === id);
                if (!removed) throw new Error('Ten wpis już nie istnieje.');
                return removeItem(data, kind, id);
            });
            this.deleted = {kind, item: removed};
            this.panel.showMessage(kind === 'notes' ? 'Notatka usunięta.' : 'Zadanie usunięte.', true);
        } catch (error) { this.panel.showMessage(error.message); }
    }

    undoDelete() {
        if (!this.deleted) return;
        try {
            const {kind, item} = this.deleted;
            this.commit(data => restoreItem(data, kind, item));
            this.deleted = null;
            this.panel.message.hide();
        } catch (error) { this.panel.showMessage(error.message); }
    }

    disable() {
        if (this.timer) GLib.Source.remove(this.timer);
        this.timer = 0;
        if (this.resumeSignal) global.display.disconnect(this.resumeSignal);
        this.resumeSignal = 0;
        if (this.settingsSignal) this.settings.disconnect(this.settingsSignal);
        if (this.themeSignal) this.desktopSettings.disconnect(this.themeSignal);
        this.settingsSignal = this.themeSignal = 0;
        if (this.monitor) {
            this.monitor.disconnect(this.monitorSignal);
            this.monitor.cancel();
            this.monitor = null;
        }
        this.panel?.destroy();
        this.panel = null;
        this.settings = this.desktopSettings = this.store = this.deleted = null;
    }
}
