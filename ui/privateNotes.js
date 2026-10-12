import St from 'gi://St';
import GLib from 'gi://GLib';
import {box, label, button, iconButton, emptyState, sectionHeading} from './widgets.js';
import {editor} from './editor.js';
import {formattedLabel} from './formatting.js';
import {MAX_NOTE_TEXT} from '../model.js';
import {validateFormat} from '../formatting.js';

// Private text never enters the public composer, model, undo queue or export.
export class PrivateNotes {
    constructor(panel) {
        this.panel = panel;
        this.vault = panel.app.vault;
        this.pending = null;
        this.closing = null;
        this.error = '';
        this.disposed = false;
        this.epoch = 0;
    }

    refresh() {
        if (!this.disposed && this.panel.tab === 'private') this.panel.refresh();
    }

    clearAuthentication() {
        this.password?.set_text('');
        this.confirm?.set_text('');
        this.password = this.confirm = null;
    }

    run(action, success = () => {}) {
        if (this.pending || this.closing) return;
        this.error = '';
        const epoch = this.epoch;
        const activeEditor = this.panel.editor?.kind === 'private' ? this.panel.editor : null;
        if (activeEditor) activeEditor.text.clutter_text.editable = false;
        this.pending = (async () => action())();
        this.refresh();
        const operation = this.pending;
        operation.then(() => {
            this.pending = null;
            if (!this.disposed && !this.closing && epoch === this.epoch) success();
        }, error => {
            this.pending = null;
            if (!this.disposed && !this.closing && epoch === this.epoch) {
                this.error = error.message;
                if (activeEditor && this.panel.editor === activeEditor) this.panel.showMessage(error.message);
            }
        }).finally(() => {
            if (!this.disposed && this.panel.editor === activeEditor && activeEditor) activeEditor.text.clutter_text.editable = true;
            this.refresh();
        });
    }

    render() {
        const {body} = this.panel;
        this.panel.composerArea.hide();
        if (this.closing || this.pending && !this.vault.unlocked) {
            body.add_child(emptyState('changes-prevent-symbolic', this.closing ? 'Locking private notes…' : 'Opening your vault…', 'Your notes are stored separately and encrypted.'));
            return;
        }
        if (!this.vault.unlocked) {
            const exists = this.vault.exists();
            body.add_child(emptyState('changes-prevent-symbolic', exists ? 'Private notes are locked' : 'A place just for you', exists ? 'Enter your password to unlock your notes.' : 'Choose a separate password to encrypt your private notes.'));
            this.password = new St.Entry({hint_text: 'Password', style_class: 'dayline-entry', can_focus: true, x_expand: true, accessible_name: 'Private notes password'});
            this.password.clutter_text.set_password_char('●');
            body.add_child(this.password);
            this.confirm = null;
            if (!exists) {
                this.confirm = new St.Entry({hint_text: 'Confirm password', style_class: 'dayline-entry', can_focus: true, x_expand: true, accessible_name: 'Confirm private notes password'});
                this.confirm.clutter_text.set_password_char('●');
                body.add_child(this.confirm);
            }
            const authenticate = () => {
                const password = this.password.get_text();
                const confirmation = this.confirm?.get_text();
                if (!exists && password.length < 10) { this.showError('Use at least 10 characters for your password.'); return; }
                if (!exists && password !== confirmation) { this.showError('The passwords do not match.'); return; }
                this.password.set_text('');
                this.confirm?.set_text('');
                this.password = this.confirm = null;
                this.run(() => exists ? this.vault.unlock(password) : this.vault.create(password));
            };
            this.password.clutter_text.connect('activate', authenticate);
            this.confirm?.clutter_text.connect('activate', authenticate);
            body.add_child(button(exists ? 'Unlock private notes' : 'Create encrypted vault', authenticate, 'dayline-primary'));
            body.add_child(label('Locks when you close the panel or lock your screen. Your password cannot be recovered.', 'dayline-hint', true));
            const focus = global.stage.get_key_focus();
            if (this.panel.menu.isOpen && (!focus || this.panel.menu.actor.contains(focus))) this.password.grab_key_focus();
        } else {
            const heading = box(false);
            heading.add_child(sectionHeading('PRIVATE NOTES', this.vault.notes.length));
            heading.add_child(iconButton('Lock private notes', 'changes-prevent-symbolic', () => this.lock()));
            body.add_child(heading);
            if (this.vault.draft) body.add_child(button('Resume saved draft', () => {
                const draft = this.vault.draft;
                const item = this.vault.notes.find(note => note.id === draft.id) ?? null;
                this.showEditor(item, draft.text, draft.format ?? []);
            }, 'dayline-chip'));
            if (!this.vault.notes.length) body.add_child(emptyState('document-edit-symbolic', 'Your private notebook', 'Only this vault contains these notes. They are excluded from regular exports.'));
            for (const note of [...this.vault.notes].reverse()) {
                const row = box(false, 'dayline-note');
                const open = button('Open private note', () => this.showEditor(note), 'dayline-task-text-button');
                open.x_expand = true;
                open.set_child(formattedLabel(note.text.length > 220 ? `${note.text.slice(0, 220)}…` : note.text, note.format, '', true));
                row.add_child(open);
                row.add_child(iconButton('Delete private note', 'user-trash-symbolic', () => this.run(() => this.vault.save(this.vault.notes.filter(item => item.id !== note.id), this.vault.draft?.id === note.id ? null : this.vault.draft))));
                body.add_child(row);
            }
            const add = button('New private note', () => this.showEditor(null, ''), 'dayline-primary');
            add.reactive = !this.pending;
            body.add_child(add);
            body.add_child(label(this.pending ? 'Saving encrypted notes…' : 'Encrypted · locks when the panel closes', 'dayline-hint', true));
        }
        if (this.error) body.add_child(label(this.error, 'dayline-message-text', true));
    }

    showError(message) {
        this.error = message;
        // Keep password fields intact while showing validation feedback.
        this.panel.showMessage(message);
    }

    showEditor(item, initialText = item?.text ?? '', initialFormat = item?.format ?? []) {
        if (this.pending || this.closing || !this.vault.unlocked) return;
        const panel = this.panel;
        panel.body.destroy_all_children();
        panel.composerArea.hide();
        panel.summary.hide();
        panel.tabsBox.hide();
        panel.expanded = false;
        this.editorWrite = null;
        const leave = () => {
            panel.editor = null;
            panel.expanded = false;
            panel.message.hide();
        };
        const noteEditor = editor('notes', item ? {...item, text: initialText, format: initialFormat} : null, initialText, null, panel.app.store.data,
            (text, _date, format = []) => {
                if (this.pending || this.closing || !this.vault.unlocked) return;
                const ranges = validateFormat(text, format);
                if (!text.trim() || text.length > MAX_NOTE_TEXT) { this.showError('Enter a note with 1–10,000 characters.'); return; }
                // Preserve annotated offsets and the indentation of selected code.
                const savedText = ranges.length ? text : text.trim();
                const notes = this.vault.notes.map(note => ({...note}));
                if (item) {
                    const index = notes.findIndex(note => note.id === item.id);
                    if (index < 0) { this.showError('This private note no longer exists.'); return; }
                    notes[index] = {...notes[index], text: savedText, format: ranges};
                } else notes.push({id: GLib.uuid_string_random(), text: savedText, format: ranges, createdAt: new Date().toISOString()});
                const write = {committed: false};
                this.editorWrite = write;
                this.run(async () => { await this.vault.save(notes, null); write.committed = true; }, leave);
            }, () => {
                if (this.pending) return;
                const write = {committed: false};
                this.editorWrite = write;
                this.run(async () => { await this.vault.save(this.vault.notes, null); write.committed = true; }, leave);
            }, message => this.showError(message), () => panel.setExpanded(!panel.expanded), {format: initialFormat});
        noteEditor.kind = 'private';
        panel.editor = noteEditor;
        panel.body.add_child(noteEditor.root);
        panel.adjustSize();
        noteEditor.text.grab_key_focus();
    }

    lock() {
        if (this.closing) return this.closing;
        this.epoch++;
        this.error = '';
        const panel = this.panel;
        const draft = panel.editor?.kind === 'private' ? {
            id: panel.editor.item?.id ?? null,
            text: panel.editor.text.get_text(),
            format: panel.editor.getFormat?.() ?? [],
        } : undefined;
        if (panel.editor?.kind === 'private') {
            panel.editor.text.set_text('');
            panel.editor = null;
            panel.expanded = false;
        }
        this.clearAuthentication();
        panel.message.hide();
        if (panel.tab === 'private') panel.body.destroy_all_children();
        if (!this.vault.unlocked && draft === undefined) {
            this.vault.lock();
            this.refresh();
            return Promise.resolve();
        }
        const pending = this.pending;
        const write = this.editorWrite;
        this.closing = (async () => {
            try {
                await pending?.catch(() => {});
                if (draft !== undefined && !write?.committed && this.vault.unlocked) await this.vault.save(this.vault.notes, draft);
            } catch {
                this.error = 'The draft could not be saved. Previously saved notes are safe.';
            } finally {
                this.vault.lock();
                this.closing = null;
                this.refresh();
            }
        })();
        this.refresh();
        return this.closing;
    }

    dispose() {
        this.disposed = true;
        return this.lock();
    }
}
