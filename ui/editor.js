import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {localDate, shiftDate, MAX_TASK_TEXT, MAX_NOTE_TEXT} from '../model.js';
import {box, label, button, iconButton} from './widgets.js';
import {calendar} from './calendar.js';

export function editor(kind, item, initialText, initialDate, data, onSave, onCancel, onError) {
    const root = box(true, 'dayline-editor');
    const header = box(false, 'dayline-editor-heading');
    header.add_child(iconButton('Wróć do listy', 'go-previous-symbolic', onCancel));
    header.add_child(label(item ? 'Edytuj wpis' : kind === 'notes' ? 'Nowa notatka' : 'Nowe zadanie', 'dayline-editor-title'));
    root.add_child(header);
    root.add_child(label('TREŚĆ', 'dayline-caption'));
    const text = new St.Entry({text: item?.text ?? initialText, style_class: 'dayline-textarea', can_focus: true, x_expand: true, accessible_name: 'Treść wpisu'});
    text.clutter_text.set_single_line_mode(false);
    text.clutter_text.set_activatable(false);
    text.clutter_text.line_wrap = true;
    text.clutter_text.max_length = kind === 'notes' ? MAX_NOTE_TEXT : MAX_TASK_TEXT;
    root.add_child(text);
    let date = null;
    if (kind === 'tasks') {
        root.add_child(label('ZAPLANOWANE NA', 'dayline-caption'));
        const row = box(false, 'dayline-date-editor');
        date = new St.Entry({text: item?.date ?? initialDate, style_class: 'dayline-entry', can_focus: true, x_expand: true, accessible_name: 'Data zadania RRRR-MM-DD'});
        date.clutter_text.max_length = 10;
        row.add_child(date);
        const picker = box(true);
        const choose = value => {
            date.set_text(value);
            picker.destroy_all_children();
            picker.hide();
        };
        row.add_child(iconButton('Wybierz datę z kalendarza', 'x-office-calendar-symbolic', () => {
            if (picker.visible) { picker.hide(); return; }
            const draw = value => {
                picker.destroy_all_children();
                picker.add_child(calendar(value, data, choose, draw));
            };
            // Invalid manually typed dates do not prevent opening the picker.
            try { draw(date.get_text()); } catch { draw(localDate()); }
            picker.show();
        }));
        root.add_child(row);
        const quick = box(false, 'dayline-date-shortcuts');
        quick.add_child(button('Dzisiaj', () => choose(localDate()), 'dayline-chip'));
        quick.add_child(button('Jutro', () => choose(shiftDate(localDate(), 1)), 'dayline-chip'));
        root.add_child(quick);
        root.add_child(picker);
        picker.hide();
    } else {
        root.add_child(label('Bez daty. Pomysły i szczegóły, do których chcesz wrócić.', 'dayline-muted', true));
    }
    const save = () => {
        try { onSave(text.get_text(), date?.get_text()); } catch (error) { onError(error.message); }
    };
    const actions = box(false, 'dayline-editor-actions');
    actions.add_child(button('Anuluj', onCancel, 'dayline-secondary'));
    const submit = button(item ? 'Zapisz zmiany' : 'Dodaj wpis', save, 'dayline-primary');
    submit.x_expand = true;
    actions.add_child(submit);
    root.add_child(actions);
    root.add_child(label('Ctrl + Enter zapisuje · Esc wraca do listy', 'dayline-hint'));
    text.clutter_text.connect('key-press-event', (_actor, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            onCancel();
            return Clutter.EVENT_STOP;
        }
        if (event.get_key_symbol() === Clutter.KEY_Return && (event.get_state() & Clutter.ModifierType.CONTROL_MASK)) {
            save();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    return {root, text, date};
}
