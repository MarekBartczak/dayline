import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import {localDate, shiftDate, MAX_TASK_TEXT, MAX_NOTE_TEXT} from '../model.js';
import {box, label, button, iconButton} from './widgets.js';
import {calendar} from './calendar.js';

export function editor(kind, item, initialText, initialDate, data, onSave, onCancel, onError, onExpand, options = {}) {
    const root = box(true, 'dayline-editor');
    const header = box(false, 'dayline-editor-heading');
    header.add_child(iconButton('Back to list', 'go-previous-symbolic', options.onBack ?? onCancel));
    const title = label(options.title ?? (item ? 'Edit entry' : kind === 'notes' ? 'New note' : 'New task'), 'dayline-editor-title');
    title.x_expand = true;
    header.add_child(title);
    const expand = iconButton('Expand editor', null, onExpand);
    // Resolve against this module's runtime directory, including live snapshots.
    expand.set_child(new St.Icon({gicon: Gio.icon_new_for_string(Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('icons/expand-symbolic.svg').get_path()), icon_size: 16}));
    header.add_child(expand);
    root.add_child(header);
    root.add_child(label('DETAILS', 'dayline-caption'));
    const text = new St.Entry({text: item?.text ?? initialText, style_class: 'dayline-textarea', can_focus: true, x_expand: true, accessible_name: 'Entry text'});
    text.clutter_text.set_single_line_mode(false);
    text.clutter_text.set_activatable(false);
    text.clutter_text.line_wrap = true;
    text.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    text.clutter_text.max_length = kind === 'notes' ? MAX_NOTE_TEXT : MAX_TASK_TEXT;
    const field = new St.ScrollView({style_class: 'dayline-editor-field', x_expand: true, overlay_scrollbars: true, hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
    const fieldContent = box(true);
    fieldContent.add_child(text);
    field.set_child(fieldContent);
    root.add_child(field);
    let expanded = false;
    let heightLimit = 190;
    const measure = () => {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const width = Math.max(180 * scale, text.width - 24 * scale);
        const [, natural] = text.clutter_text.get_preferred_height(width);
        const height = Math.max(expanded ? Math.min(240, heightLimit) : 105, Math.ceil(natural / scale) + 26);
        text.set_style(`min-height: 0px; padding-top: 12px; padding-bottom: ${Math.max(12, height - natural / scale - 12)}px;`);
        field.set_style(`height: ${Math.min(heightLimit, Math.max(expanded ? Math.min(240, heightLimit) : 105, height))}px;`);
    };
    text.connect('notify::width', measure);
    text.clutter_text.connect('text-changed', measure);
    text.clutter_text.connect('notify::cursor-position', () => {
        const [valid, , y, lineHeight] = text.clutter_text.position_to_coords(text.clutter_text.cursor_position);
        if (!valid) return;
        const adjustment = field.vadjustment;
        if (y < adjustment.value) adjustment.value = y;
        else if (y + lineHeight + 26 * St.ThemeContext.get_for_stage(global.stage).scale_factor > adjustment.value + field.height)
            adjustment.value = y + lineHeight + 26 * St.ThemeContext.get_for_stage(global.stage).scale_factor - field.height;
    });
    let date = null;
    if (kind === 'tasks') {
        root.add_child(label('SCHEDULED FOR', 'dayline-caption'));
        const row = box(false, 'dayline-date-editor');
        date = new St.Entry({text: item?.date ?? initialDate, style_class: 'dayline-entry', can_focus: true, x_expand: true, accessible_name: 'Task date YYYY-MM-DD'});
        date.clutter_text.max_length = 10;
        row.add_child(date);
        const picker = box(true);
        const choose = value => {
            // Keep focus inside the editor before removing a focused day button.
            date.grab_key_focus();
            date.set_text(value);
            picker.destroy_all_children();
            picker.hide();
        };
        row.add_child(iconButton('Choose a date', 'x-office-calendar-symbolic', () => {
            if (picker.visible) { date.grab_key_focus(); picker.hide(); return; }
            const draw = value => {
                date.grab_key_focus();
                picker.destroy_all_children();
                picker.add_child(calendar(value, data, choose, draw));
            };
            // Invalid manually typed dates do not prevent opening the picker.
            try { draw(date.get_text()); } catch { draw(localDate()); }
            picker.show();
        }));
        root.add_child(row);
        const quick = box(false, 'dayline-date-shortcuts');
        quick.add_child(button('Today', () => choose(localDate()), 'dayline-chip'));
        quick.add_child(button('Tomorrow', () => choose(shiftDate(localDate(), 1)), 'dayline-chip'));
        root.add_child(quick);
        root.add_child(picker);
        picker.hide();
    } else {
        root.add_child(label('No date. Keep ideas and details you want to come back to.', 'dayline-muted', true));
    }
    const save = () => {
        try { onSave(text.get_text(), date?.get_text()); } catch (error) { onError(error.message); }
    };
    const actions = box(false, 'dayline-editor-actions');
    actions.add_child(button('Cancel', onCancel, 'dayline-secondary'));
    const submit = button(item ? 'Save changes' : 'Add entry', save, 'dayline-primary');
    submit.x_expand = true;
    actions.add_child(submit);
    root.add_child(actions);
    root.add_child(label('Ctrl + Enter to save · Esc to go back', 'dayline-hint'));
    text.clutter_text.connect('key-press-event', (_actor, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            (options.onClose ?? onCancel)();
            return Clutter.EVENT_STOP;
        }
        if (event.get_key_symbol() === Clutter.KEY_Return && (event.get_state() & Clutter.ModifierType.CONTROL_MASK)) {
            save();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    return {root, text, date, kind, item,
        resize(value, limit) {
            expanded = value;
            heightLimit = limit;
            expand.accessible_name = value ? 'Compact editor' : 'Expand editor';
            measure();
        },
    };
}
