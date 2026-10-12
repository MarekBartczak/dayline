import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {todaySummary, tasksForDate, overdueTasks, localDate, MAX_TASK_TEXT, MAX_NOTE_TEXT} from '../model.js';
import {box, label, button, iconButton, emptyState, sectionHeading, formatDate} from './widgets.js';
import {calendar} from './calendar.js';
import {editor} from './editor.js';
import {resolveAccent, backgroundColor} from './appearance.js';
import {PrivateNotes} from './privateNotes.js';

export const DaylinePanel = GObject.registerClass({
    // Fresh runtime snapshots can coexist with the previous GObject type.
    GTypeName: `DaylinePanelV2_${GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, import.meta.url, -1).slice(0, 12)}`,
}, class DaylinePanel extends PanelMenu.Button {
    _init(app) {
        super._init(0.5, 'Dayline');
        this.app = app;
        this.tab = 'today';
        this.selectedDate = app.today;
        this.drafts = new Map();
        this.expanded = false;
        const status = box(false, 'dayline-status');
        status.add_child(new St.Icon({gicon: Gio.icon_new_for_string(`${app.path}/icons/dayline-symbolic.svg`), style_class: 'system-status-icon'}));
        this.inProgressCounter = label('▶ 0', 'dayline-counter dayline-progress-counter');
        status.add_child(this.inProgressCounter);
        status.add_child(label('·', 'dayline-counter-divider'));
        this.counter = label('0', 'dayline-counter');
        status.add_child(this.counter);
        this.add_child(status);

        this.menu.actor.add_style_class_name('dayline-menu');
        this.root = box(true, 'dayline-popup');
        this.menu.box.add_child(this.root);
        const heading = box(false, 'dayline-heading');
        const brand = box(true, 'dayline-brand');
        brand.add_child(label('Dayline', 'dayline-brand-name'));
        this.subtitle = label('', 'dayline-muted');
        brand.add_child(this.subtitle);
        heading.add_child(brand);
        heading.add_child(iconButton('Settings and backups', 'emblem-system-symbolic', () => {
            this.menu.close();
            app.openPreferences();
        }));
        this.root.add_child(heading);
        this.summary = box(true, 'dayline-summary');
        this.root.add_child(this.summary);
        const tabs = box(false, 'dayline-tabs');
        this.tabsBox = tabs;
        this.tabs = {};
        for (const [key, text] of [['today', 'Today'], ['calendar', 'Calendar'], ['notes', 'Notes'], ['private', 'Private']]) {
            const tab = button(text, () => this.selectTab(key), 'dayline-tab');
            tab.x_expand = true;
            this.tabs[key] = tab;
            tabs.add_child(tab);
        }
        this.root.add_child(tabs);
        this.scroll = new St.ScrollView({style_class: 'dayline-scroll', x_expand: true, overlay_scrollbars: true, hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
        this.body = box(true, 'dayline-content');
        this.scroll.set_child(this.body);
        this.root.add_child(this.scroll);
        this.message = box(false, 'dayline-message');
        this.root.add_child(this.message);
        this.message.hide();

        this.composerArea = box(true, 'dayline-composer-area');
        this.composerCaption = label('', 'dayline-caption');
        this.composerArea.add_child(this.composerCaption);
        const compose = box(false, 'dayline-composer');
        this.composer = new St.Entry({hint_text: 'What is on your list?', style_class: 'dayline-entry', can_focus: true, x_expand: true, accessible_name: 'New entry'});
        this.composer.clutter_text.connect('activate', () => this.submit());
        compose.add_child(this.composer);
        compose.add_child(iconButton('Open full editor', 'document-edit-symbolic', () => this.showEditor(this.tab === 'notes' ? 'notes' : 'tasks', null)));
        compose.add_child(iconButton('Add entry', 'list-add-symbolic', () => this.submit(), 'dayline-add'));
        this.composerArea.add_child(compose);
        this.composerArea.add_child(label('Enter to add · pencil for more detail', 'dayline-hint'));
        this.root.add_child(this.composerArea);
        this.privateNotes = new PrivateNotes(this);

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                app.reload();
                this.refresh();
                this.adjustSize();
            } else if (!this.pinningChanging) {
                void this.privateNotes.lock();
            }
        });
        this.refresh();
    }

    adjustSize(animate = false) {
        if (!this.get_stage()) return;
        const monitor = Main.layoutManager.findMonitorForActor(this) ?? Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const compact = this.app.settings.get_boolean('compact');
        if (compact) this.root.add_style_class_name('dayline-compact');
        else this.root.remove_style_class_name('dayline-compact');
        const availableHeight = monitor.height / scale;
        const height = Math.max(120, Math.min(this.editor ? availableHeight - 160 : compact ? 300 : 430, availableHeight - (this.editor ? 140 : 310)));
        this.scroll.set_style(`max-height: ${height}px;`);
        const width = Math.min(this.expanded ? 652 : compact ? 382 : 464, Math.max(260, monitor.width / scale - 40)) * scale;
        if (animate && this.root.mapped)
            this.root.ease({width, duration: 180, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        else this.root.width = width;
        this.editor?.resize(this.expanded, Math.max(100, Math.min(this.expanded ? 380 : 190, height - 215)));
    }

    setExpanded(expanded, animate = true) {
        this.expanded = Boolean(expanded && this.editor);
        this.adjustSize(animate);
    }

    draftKey() {
        return this.tab === 'notes' ? 'notes' : this.tab === 'today' ? this.app.today : this.selectedDate;
    }

    selectTab(tab) {
        if (this.tab !== 'private') this.drafts.set(this.draftKey(), this.composer.get_text());
        this.tab = tab;
        this.editor = null;
        this.expanded = false;
        this.composer.set_text(tab === 'private' ? '' : this.drafts.get(this.draftKey()) ?? '');
        this.message.hide();
        this.refresh();
    }

    selectDate(date) {
        this.drafts.set(this.draftKey(), this.composer.get_text());
        this.selectedDate = date;
        this.composer.set_text(this.drafts.get(this.draftKey()) ?? '');
        this.refresh();
    }

    submit() {
        const kind = this.tab === 'notes' ? 'notes' : 'tasks';
        try {
            this.app.add(kind, this.composer.get_text(), this.tab === 'today' ? this.app.today : this.selectedDate);
            this.composer.set_text('');
            this.drafts.delete(this.draftKey());
            this.composer.grab_key_focus();
        } catch (error) {
            this.showMessage(error.message);
        }
    }

    showMessage(text, undo = false) {
        this.message.destroy_all_children();
        this.message.add_child(label(text, 'dayline-message-text', true));
        if (undo)
            this.message.add_child(button('Undo', () => this.app.undoDelete(), 'dayline-chip'));
        if (undo)
            this.message.get_last_child().accessible_name = 'Undo deletion';
        this.message.show();
    }

    showEditor(kind, item) {
        this.body.destroy_all_children();
        this.composerArea.hide();
        this.expanded = false;
        const cancel = () => { this.editor = null; this.expanded = false; this.refresh(); };
        this.editor = editor(kind, item, this.composer.get_text(), this.tab === 'today' ? this.app.today : this.selectedDate, this.app.store.data,
            (text, date) => {
                if (item) this.app.edit(kind, item.id, text, date);
                else this.app.add(kind, text, date);
                this.editor = null;
                this.expanded = false;
                if (!item) { this.composer.set_text(''); this.drafts.delete(this.draftKey()); }
                this.refresh();
            }, cancel, message => this.showMessage(message), () => this.setExpanded(!this.expanded));
        this.body.add_child(this.editor.root);
        this.summary.hide();
        this.tabsBox.hide();
        this.adjustSize();
        this.editor.text.grab_key_focus();
    }

    taskRow(item, overdue = false) {
        const row = box(false, item.done ? 'dayline-task dayline-task-done' : 'dayline-task');
        const check = button(`${item.done ? 'Reopen' : 'Complete'}: ${item.text}`, () => this.app.toggle(item.id), `dayline-check ${item.done ? 'dayline-check-done' : ''}`,
            item.done ? 'object-select-symbolic' : null);
        if (!item.done) check.set_child(new St.Widget({width: 12, height: 12}));
        check.y_align = Clutter.ActorAlign.START;
        row.add_child(check);
        const textButton = button(`Edit: ${item.text}`, () => this.showEditor('tasks', item), 'dayline-task-text-button');
        textButton.x_expand = true;
        const content = box(true, 'dayline-task-text');
        const lines = item.text.split('\n');
        let preview = lines.slice(0, 4).join('\n');
        if (preview.length > 220 || lines.length > 4) preview = `${preview.slice(0, 220)}…`;
        content.add_child(label(preview, item.done ? 'dayline-done-text' : '', true));
        if (item.inProgress && !item.done)
            content.add_child(label('In progress', 'dayline-in-progress-badge'));
        if (overdue)
            content.add_child(label(formatDate(item.date, {day: 'numeric', month: 'short', year: 'numeric'}), 'dayline-overdue-date'));
        textButton.set_child(content);
        row.add_child(textButton);
        if (!item.done) {
            const start = iconButton(item.inProgress ? 'Move to waiting' : 'Start task', item.inProgress ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic', () => this.app.start(item.id), item.inProgress ? 'dayline-start-active' : '');
            start.y_align = Clutter.ActorAlign.START;
            row.add_child(start);
        }
        const remove = iconButton('Delete task', 'user-trash-symbolic', () => this.app.remove('tasks', item.id));
        remove.y_align = Clutter.ActorAlign.START;
        row.add_child(remove);
        return row;
    }

    renderTasks(date) {
        const tasks = tasksForDate(this.app.store.data, date);
        const open = tasks.filter(item => !item.done);
        const active = open.filter(item => item.inProgress);
        const waiting = open.filter(item => !item.inProgress);
        const completed = tasks.filter(item => item.done);
        this.body.add_child(sectionHeading(this.tab === 'today' ? 'TO DO' : formatDate(date, {weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'}), open.length));
        if (!open.length)
            this.body.add_child(emptyState('emblem-ok-symbolic', tasks.length ? 'All checked off' : 'Make room for a good plan', tasks.length ? 'Nice work. The rest of the day is yours.' : 'Add your first task in the field below.'));
        if (active.length) {
            this.body.add_child(sectionHeading('IN PROGRESS', active.length));
            for (const item of active) this.body.add_child(this.taskRow(item));
        }
        if (active.length && waiting.length) this.body.add_child(sectionHeading('WAITING', waiting.length));
        for (const item of waiting) this.body.add_child(this.taskRow(item));
        if (completed.length) {
            this.body.add_child(sectionHeading('DONE', completed.length));
            for (const item of completed) this.body.add_child(this.taskRow(item));
        }
        if (this.tab === 'today') {
            const overdue = overdueTasks(this.app.store.data, this.app.today);
            if (overdue.length) {
                this.body.add_child(sectionHeading('OVERDUE', overdue.length));
                for (const item of overdue) this.body.add_child(this.taskRow(item, true));
            }
        }
    }

    renderNotes() {
        const notes = this.app.store.data.notes;
        this.body.add_child(sectionHeading('KEEP CLOSE', notes.length));
        if (!notes.length)
            this.body.add_child(emptyState('document-edit-symbolic', 'Catch a thought before it goes', 'Ideas, task details, things to remember. No dates or deadlines.'));
        for (const item of [...notes].reverse()) {
            const row = box(false, 'dayline-note');
            row.add_child(new St.Icon({icon_name: 'document-edit-symbolic', icon_size: 16, style_class: 'dayline-note-icon', y_align: Clutter.ActorAlign.START}));
            const edit = button(`Edit: ${item.text}`, () => this.showEditor('notes', item), 'dayline-task-text-button');
            edit.x_expand = true;
            const preview = item.text.length > 220 ? `${item.text.slice(0, 220)}…` : item.text;
            edit.set_child(label(preview, '', true));
            row.add_child(edit);
            const remove = iconButton('Delete note', 'user-trash-symbolic', () => this.app.remove('notes', item.id));
            remove.y_align = Clutter.ActorAlign.START;
            row.add_child(remove);
            this.body.add_child(row);
        }
    }

    updateTheme() {
        const appearance = this.app.settings.get_string('appearance');
        const light = appearance === 'light' || appearance === 'system' && this.app.desktopSettings.get_string('color-scheme') !== 'prefer-dark';
        if (light) this.menu.actor.add_style_class_name('dayline-light');
        else this.menu.actor.remove_style_class_name('dayline-light');
        const accent = resolveAccent(this.app.settings.get_string('accent'), this.app.desktopSettings.get_string('accent-color'));
        if (this.accentName) this.menu.actor.remove_style_class_name(`dayline-accent-${this.accentName}`);
        this.accentName = accent.name;
        this.menu.actor.add_style_class_name(`dayline-accent-${accent.name}`);
        const styles = (this.menu.actor.get_style() ?? '').split(';').map(part => part.trim()).filter(part => part && !part.startsWith('-arrow-background-color:'));
        styles.push(`-arrow-background-color: ${backgroundColor(accent, light, this.app.settings.get_int('opacity'))}`);
        this.menu.actor.set_style(`${styles.join('; ')};`);
    }

    refresh() {
        this.updateTheme();
        const {remaining, done, total, inProgress, waiting} = todaySummary(this.app.store.data, this.app.today);
        this.counter.text = this.app.store.error ? '!' : String(waiting);
        this.inProgressCounter.text = `▶ ${inProgress}`;
        this.accessible_name = `Dayline: ${inProgress} in progress, ${waiting} waiting today`;
        this.subtitle.text = formatDate(this.app.today, {weekday: 'long', day: 'numeric', month: 'long'});
        this.summary.destroy_all_children();
        const row = box(false, 'dayline-summary-line');
        const count = box(false, 'dayline-summary-count');
        count.add_child(label(String(remaining).padStart(2, '0'), 'dayline-big-count'));
        count.add_child(label('left today', 'dayline-summary-caption'));
        row.add_child(count);
        const progress = label(`${done} / ${total} done`, 'dayline-progress-label');
        progress.x_expand = true;
        progress.x_align = Clutter.ActorAlign.END;
        row.add_child(progress);
        this.summary.add_child(row);
        const track = new St.Widget({style_class: 'dayline-progress-track', x_expand: true});
        const fill = new St.Widget({style_class: 'dayline-progress-fill', height: 4});
        track.add_child(fill);
        track.connect('notify::width', () => { fill.width = track.width * (total ? done / total : 0); });
        this.summary.add_child(track);
        this.summary.add_child(label(`${inProgress} in progress · ${waiting} waiting`, 'dayline-summary-status'));
        for (const [key, tab] of Object.entries(this.tabs)) {
            if (key === this.tab) tab.add_style_class_name('dayline-tab-active');
            else tab.remove_style_class_name('dayline-tab-active');
        }
        if (this.app.store.error) {
            this.storageWarning = true;
            this.showMessage('Cannot read your data. Open Settings to restore a backup.');
        } else if (this.storageWarning) {
            this.storageWarning = false;
            if (this.app.deleted) this.showMessage('Entry deleted.', true);
            else this.message.hide();
        }
        if (this.editor) {
            this.summary.hide();
            this.tabsBox.hide();
            return;
        }
        this.summary.show();
        this.tabsBox.show();
        if (this.tab === 'private' && this.privateNotes.password && !this.app.vault.unlocked && !this.privateNotes.pending && !this.privateNotes.closing) {
            this.adjustSize();
            return;
        }
        this.privateNotes.clearAuthentication();
        this.body.destroy_all_children();
        this.scroll.vadjustment.value = 0;
        this.composerArea.show();
        if (this.tab === 'private') {
            this.privateNotes.render();
        } else if (this.tab === 'calendar') {
            this.body.add_child(calendar(this.selectedDate, this.app.store.data, date => this.selectDate(date), date => this.selectDate(date)));
            this.renderTasks(this.selectedDate);
        } else if (this.tab === 'notes') {
            this.renderNotes();
        } else {
            this.renderTasks(this.app.today);
        }
        this.composerCaption.text = this.tab === 'notes' ? 'NEW NOTE · NO DATE' : `ADD TASK · ${formatDate(this.tab === 'today' ? this.app.today : this.selectedDate, {day: 'numeric', month: 'short'})}`;
        this.composer.hint_text = this.tab === 'notes' ? 'What would you like to remember?' : 'What needs doing?';
        this.composer.clutter_text.max_length = this.tab === 'notes' ? MAX_NOTE_TEXT : MAX_TASK_TEXT;
        this.adjustSize();
    }
});
