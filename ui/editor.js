import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';
import {localDate, shiftDate, MAX_TASK_TEXT, MAX_NOTE_TEXT} from '../model.js';
import {box, label, button, iconButton} from './widgets.js';
import {calendar} from './calendar.js';
import {createFormatting} from './formatting.js';

const EditorLayout = GObject.registerClass({
    GTypeName: `DaylineEditorLayout_${GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, import.meta.url, -1).slice(0, 12)}`,
}, class EditorLayout extends St.BoxLayout {
    vfunc_pick(context) {
        super.vfunc_pick(context);
        // Mutter 50 caches a picked text actor's full allocation without its
        // ancestor scroll clips. After a drag, that allocation covers the
        // toolbar, retaining the text cursor and routing clicks to the Entry.
        // Exclude the full document allocation, including the part scrolled
        // above this editor into the panel header. Native picking still chooses
        // every target; the rest of the desktop keeps its normal cache.
        context.log_overlap(this.documentActor ?? this);
    }
});

export function editor(kind, item, initialText, initialDate, data, onSave, onCancel, onError, onExpand, options = {}) {
    const root = new EditorLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'dayline-editor', x_expand: true});
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
    const text = new St.Entry({text: item?.text ?? initialText, style_class: 'dayline-textarea', can_focus: true, x_expand: true, y_align: Clutter.ActorAlign.START, accessible_name: 'Entry text'});
    root.documentActor = text;
    text.clutter_text.set_single_line_mode(false);
    text.clutter_text.set_activatable(false);
    text.clutter_text.line_wrap = true;
    text.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    text.clutter_text.max_length = kind === 'notes' ? MAX_NOTE_TEXT : MAX_TASK_TEXT;
    const field = new St.ScrollView({style_class: 'dayline-editor-field dayline-textarea', x_expand: true, clip_to_allocation: true, overlay_scrollbars: true, hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
    const fieldContent = box(true);
    const stack = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});
    fieldContent.add_child(stack);
    field.set_child(fieldContent);
    root.add_child(field);
    field.connect('button-press-event', (_actor, event) => {
        if (event.get_button() !== 1 || !text.clutter_text.editable)
            return Clutter.EVENT_PROPAGATE;
        const ct = text.clutter_text;
        const source = global.stage.get_event_actor(event);
        // Glyph clicks keep Clutter's native selection/drag behavior. Image,
        // code-copy and scrollbar controls own their clicks inside this field.
        for (let actor = source; actor && actor !== field; actor = actor.get_parent()) {
            if (actor === ct || actor instanceof St.Button || actor instanceof St.ScrollBar)
                return Clutter.EVENT_PROPAGATE;
        }
        const [stageX, stageY] = event.get_coords();
        const [valid, x, y] = ct.transform_stage_point(stageX, stageY);
        if (!valid) return Clutter.EVENT_PROPAGATE;
        const characters = Array.from(text.get_text());
        let position;
        if (y < 0) position = 0;
        else if (y >= ct.height) position = characters.length;
        else {
            // coords_to_position uses UTF-8 bytes; selection uses characters.
            const index = ct.coords_to_position(x, y);
            let bytes = 0;
            position = 0;
            for (const character of characters) {
                if (bytes >= index) break;
                const point = character.codePointAt(0);
                bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
                position++;
            }
        }
        const anchor = event.get_state() & Clutter.ModifierType.SHIFT_MASK
            ? (ct.selection_bound < 0 ? characters.length : ct.selection_bound) : position;
        text.grab_key_focus();
        ct.set_selection(position, anchor);
        return Clutter.EVENT_STOP;
    });
    let revealSource = 0;
    let measureSource = 0;
    let destroyed = false;
    const revealCaret = () => {
        if (destroyed || revealSource) return;
        revealSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            revealSource = 0;
            if (destroyed || !text.clutter_text.has_key_focus()) return GLib.SOURCE_REMOVE;
            const [valid, , y, lineHeight] = text.clutter_text.position_to_coords(text.clutter_text.cursor_position);
            if (!valid) return GLib.SOURCE_REMOVE;
            const adjustment = field.vadjustment;
            const padding = 12 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
            if (y < adjustment.value) adjustment.value = y;
            else if (y + lineHeight + padding * 2 > adjustment.value + adjustment.page_size)
                adjustment.value = y + lineHeight + padding * 2 - adjustment.page_size;
            return GLib.SOURCE_REMOVE;
        });
    };
    field.connect('notify::height', revealCaret);
    // ScrollView owns and disposes the adjustment before its actor destroy
    // signal; the adjustment's handlers are removed by that disposal.
    field.vadjustment.connect('notify::upper', revealCaret);
    field.vadjustment.connect('notify::page-size', revealCaret);
    const focusIn = text.clutter_text.connect('key-focus-in', () => {
        field.add_style_pseudo_class('focus');
        revealCaret();
    });
    const focusOut = text.clutter_text.connect('key-focus-out', () => field.remove_style_pseudo_class('focus'));
    field.connect('destroy', () => {
        destroyed = true;
        root.documentActor = null;
        if (revealSource) GLib.Source.remove(revealSource);
        if (measureSource) GLib.Source.remove(measureSource);
        revealSource = 0;
        measureSource = 0;
        text.clutter_text.disconnect(focusIn);
        text.clutter_text.disconnect(focusOut);
    });
    let expanded = false;
    let heightLimit = 190;
    const measure = () => {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        // Actor.width falls back to the unconstrained natural width while a
        // relayout is pending. The viewport allocation remains the wrap bound.
        const viewport = field.get_allocation_box();
        if (viewport.get_width() <= 0) return;
        const width = Math.max(180 * scale, viewport.get_width() - 54 * scale);
        const [, natural] = text.clutter_text.get_preferred_height(width);
        const height = Math.max(105, Math.ceil(natural / scale) + 26);
        // Keep the entire document at its natural height. Only the surrounding
        // ScrollView is bounded; shrinking this Entry clips text before scrolling.
        text.set_style(`min-height: ${height}px; padding: 12px 40px 12px 12px; border-width: 0px; border-radius: 0px; background-color: transparent;`);
        field.set_style(`height: ${Math.min(heightLimit, Math.max(expanded ? Math.min(240, heightLimit) : 105, height))}px; min-height: 0px; padding: 0px;`);
    };
    // Entry allocation precedes its text child's allocation. Measuring there
    // uses the previous wrap width, especially after monospace attributes change.
    // Coalesce changes until the child has received its final width and styles.
    const scheduleMeasure = () => {
        if (destroyed || measureSource) return;
        // LOW idles can remain pending across multiple keystrokes while Shell
        // animates a long document. Sizing must keep up with native text edits.
        measureSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            measureSource = 0;
            if (!destroyed) { measure(); revealCaret(); }
            return GLib.SOURCE_REMOVE;
        });
    };
    text.connect('notify::width', scheduleMeasure);
    text.clutter_text.connect('notify::width', scheduleMeasure);
    field.connect('notify::allocation', scheduleMeasure);
    text.connect('notify::height', revealCaret);
    const formatting = createFormatting({text, field, stack, format: options.format ?? item?.format,
        images: options.images ?? item?.images, imageStore: kind === 'tasks' ? options.imageStore : null, onPreview: options.onPreview, onReady: options.onReady, onChoose: options.onChoose,
        limit: kind === 'notes' ? MAX_NOTE_TEXT : MAX_TASK_TEXT, onError, onChange: scheduleMeasure});
    root.insert_child_at_index(formatting.toolbar, 2);
    if (kind === 'tasks' && options.imageStore) header.insert_child_at_index(iconButton('Insert images', 'insert-image-symbolic', formatting.chooseImages), 2);
    text.clutter_text.connect('text-changed', scheduleMeasure);
    text.clutter_text.connect('notify::cursor-position', revealCaret);
    // Appending at the end leaves cursor_position at -1. Cursor geometry is
    // updated during native layout/paint, after range attributes have settled.
    text.clutter_text.connect('cursor-changed', revealCaret);
    text.clutter_text.connect('notify::allocation', revealCaret);
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
        try { if (formatting.isPending()) throw new Error('Wait for the image to finish loading before saving.'); onSave(text.get_text(), date?.get_text(), formatting.getFormat(), kind === 'tasks' ? formatting.getImages() : undefined); } catch (error) { onError(error.message); }
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
    return {root, text, date, kind, item, getFormat: formatting.getFormat, getImages: formatting.getImages, pasteImages: formatting.pasteImages,
        resize(value, limit) {
            expanded = value;
            heightLimit = limit;
            expand.accessible_name = value ? 'Compact editor' : 'Expand editor';
            formatting.setExpanded(value);
            scheduleMeasure();
        },
    };
}
