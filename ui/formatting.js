import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';
import {validateFormat, remapFormat, toggleFormat, listSelection, codeSelection, byteOffsets} from '../formatting.js';
import {box, label, button, iconButton} from './widgets.js';

// Positioned decoration must never contribute its old width to the document's
// minimum size when the editor shrinks back to its compact view.
const DocumentOverlay = GObject.registerClass({
    GTypeName: `DaylineDocumentOverlay_${GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, import.meta.url, -1).slice(0, 12)}`,
}, class DocumentOverlay extends St.Widget {
    vfunc_get_preferred_width() { return [0, 0]; }
    vfunc_get_preferred_height() { return [0, 0]; }
});

function applyAttributes(actor, text, format) {
    if (!actor.get_stage()) return;
    const attributes = textAttributes(text, format);
    const color = actor.get_theme_node().get_foreground_color();
    const foreground = Pango.attr_foreground_new(color.red * 257, color.green * 257, color.blue * 257);
    foreground.start_index = 0;
    foreground.end_index = 0xffffffff;
    attributes.insert(foreground);
    actor.clutter_text.set_attributes(attributes);
}

export function textAttributes(text, format) {
    const length = Array.from(text).length;
    const ranges = validateFormat(text, (format ?? []).filter(range => range.start < length)
        .map(range => ({...range, end: Math.min(range.end, length)})));
    const offsets = byteOffsets(text);
    const attributes = new Pango.AttrList();
    for (const range of ranges) {
        const attribute = range.type === 'bold' ? Pango.attr_weight_new(Pango.Weight.BOLD)
            : range.type === 'italic' ? Pango.attr_style_new(Pango.Style.ITALIC) : Pango.attr_family_new('monospace');
        attribute.start_index = offsets[range.start];
        attribute.end_index = offsets[range.end];
        attributes.insert(attribute);
    }
    return attributes;
}

export function formattedLabel(text, format, style = '', wrap = false) {
    const actor = label(text, style, wrap);
    const apply = () => applyAttributes(actor, text, format);
    actor.connect_after('style-changed', apply);
    apply();
    return actor;
}

// One editable plain-text document. Range attributes style its glyphs; code
// frames and copy controls share the document's scrolling coordinate system.
export function createFormatting({text, field, stack, format, limit, onError, onChange}) {
    let ranges = validateFormat(text.get_text(), format);
    let previous = text.get_text();
    let expanded = false;
    let changing = false;
    let destroyed = false;
    let renderSource = 0;
    let syncSource = 0;
    const feedbackSources = new Set();
    const background = new DocumentOverlay({x_expand: true, y_expand: true});
    const controls = new DocumentOverlay({x_expand: true, y_expand: true});
    stack.add_child(background);
    stack.add_child(text);
    stack.add_child(controls);
    const frames = [];
    const toolbar = box(false, 'dayline-format-toolbar');
    toolbar.accessible_name = 'Text formatting';
    const content = () => text.get_text();
    const selection = () => {
        const length = Array.from(content()).length;
        const cursor = text.clutter_text.cursor_position < 0 ? length : text.clutter_text.cursor_position;
        const bound = text.clutter_text.selection_bound < 0 ? length : text.clutter_text.selection_bound;
        return {start: Math.min(cursor, bound), end: Math.max(cursor, bound)};
    };
    let observedSelection = selection();
    let editSelection = null;
    let editKey = null;
    const rememberSelection = () => {
        if (!destroyed && content() === previous) observedSelection = selection();
    };
    text.clutter_text.connect('notify::cursor-position', rememberSelection);
    text.clutter_text.connect('notify::selection-bound', rememberSelection);

    function renderFrames() {
        if (destroyed || !text.mapped) return;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const codes = ranges.filter(range => range.type === 'code');
        while (frames.length > codes.length) {
            const frame = frames.pop();
            frame.background.destroy();
            frame.copy.destroy();
        }
        for (let i = 0; i < codes.length; i++) {
            let frame = frames[i];
            if (!frame) {
                const index = i;
                frame = {background: new St.Widget({style_class: 'dayline-code-frame', accessible_name: 'Code frame'}), copy: null};
                frame.copy = iconButton('Copy code', 'edit-copy-symbolic', () => {
                    if (destroyed) return;
                    const range = ranges.filter(item => item.type === 'code')[index];
                    if (!range) return;
                    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD,
                        Array.from(content()).slice(range.start, range.end).join(''));
                    frame.copy.set_child(new St.Icon({icon_name: 'emblem-ok-symbolic', icon_size: 16}));
                    const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1400, () => {
                        feedbackSources.delete(source);
                        if (!destroyed && frames.includes(frame))
                            frame.copy.set_child(new St.Icon({icon_name: 'edit-copy-symbolic', icon_size: 16}));
                        return GLib.SOURCE_REMOVE;
                    });
                    feedbackSources.add(source);
                }, 'dayline-code-copy');
                background.add_child(frame.background);
                controls.add_child(frame.copy);
                frames.push(frame);
            }
            const range = codes[i];
            const [firstValid, , firstY, firstHeight] = text.clutter_text.position_to_coords(range.start);
            const [lastValid, , lastY, lastHeight] = text.clutter_text.position_to_coords(range.end - 1);
            if (!firstValid || !lastValid) { frame.background.hide(); frame.copy.hide(); continue; }
            const top = Math.max(2 * scale, text.y + text.clutter_text.y + firstY - background.y - 5 * scale);
            const left = text.x + 6 * scale;
            const width = Math.max(40 * scale, text.width - left * 2);
            frame.background.set_position(left, top);
            frame.background.set_size(width, Math.max(firstHeight, lastY + lastHeight - firstY) + 10 * scale);
            frame.copy.set_position(left + width - 31 * scale, top + 2 * scale);
            frame.copy.set_size(26 * scale, 26 * scale);
            frame.background.show();
            frame.copy.show();
        }
    }

    function scheduleFrames() {
        if (destroyed || renderSource) return;
        renderSource = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            renderSource = 0;
            renderFrames();
            return GLib.SOURCE_REMOVE;
        });
    }

    function refresh() {
        applyAttributes(text, content(), ranges);
        scheduleFrames();
    }

    function syncText() {
        if (destroyed) return;
        const next = content();
        if (next === previous) {
            editSelection = null;
            editKey = null;
            observedSelection = selection();
            return;
        }
        let hint = editSelection ?? observedSelection;
        const delta = Array.from(next).length - Array.from(previous).length;
        if (hint.start === hint.end && delta < 0) {
            if (editKey === Clutter.KEY_BackSpace) hint = {start: hint.start + delta, end: hint.end};
            else if (editKey === Clutter.KEY_Delete) hint = {start: hint.start, end: hint.end - delta};
        }
        ranges = remapFormat(previous, next, ranges, hint);
        previous = next;
        editSelection = null;
        editKey = null;
        observedSelection = selection();
        refresh();
        onChange();
    }

    function flushText() {
        if (syncSource) GLib.Source.remove(syncSource);
        syncSource = 0;
        syncText();
    }

    function apply(action) {
        if (!expanded || !text.clutter_text.editable || destroyed) return;
        try {
            flushText();
            const before = content();
            let {start, end} = selection();
            let result;
            if (action === 'bold' || action === 'italic') {
                if (start === end) throw new Error('Select the text you want to format.');
                result = {text: before, format: toggleFormat(before, ranges, action, start, end), start, end};
            } else if (action === 'bullet' || action === 'numbered') {
                result = listSelection(before, ranges, start, end, action === 'numbered');
            } else {
                let codeText = before;
                let codeRanges = ranges;
                if (start === end) {
                    const characters = Array.from(before);
                    characters.splice(start, 0, ...'Paste code here');
                    codeText = characters.join('');
                    codeRanges = remapFormat(before, codeText, ranges);
                    end += 'Paste code here'.length;
                }
                result = codeSelection(codeText, codeRanges, start, end);
            }
            if (result.text.length > limit) throw new Error(`Text must be no longer than ${limit} characters.`);
            changing = true;
            ranges = validateFormat(result.text, result.format);
            text.set_text(result.text);
            previous = result.text;
            changing = false;
            refresh();
            onChange();
            text.grab_key_focus();
            text.clutter_text.set_selection(result.start, result.end);
        } catch (error) {
            changing = false;
            onError(error.message);
        }
    }

    for (const [caption, name, action] of [['B', 'Bold', 'bold'], ['I', 'Italic', 'italic'], ['• List', 'Bulleted list', 'bullet'], ['1. List', 'Numbered list', 'numbered'], ['</>', 'Code block', 'code']]) {
        const control = button(caption, () => apply(action), `dayline-format-button dayline-format-${action}`);
        control.accessible_name = name;
        toolbar.add_child(control);
    }
    toolbar.hide();
    text.clutter_text.connect('text-changed', () => {
        if (destroyed || changing || syncSource) return;
        // Native paste replaces a selection by deleting then inserting. Treat
        // both notifications as one edit so the selection's styles survive.
        syncSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            syncSource = 0;
            syncText();
            return GLib.SOURCE_REMOVE;
        });
    });
    text.clutter_text.connect('key-press-event', (_actor, event) => {
        if (content() === previous) {
            editSelection = selection();
            editKey = event.get_key_symbol();
        }
        if (!expanded || !(event.get_state() & Clutter.ModifierType.CONTROL_MASK)) return Clutter.EVENT_PROPAGATE;
        const symbol = event.get_key_symbol();
        if ([Clutter.KEY_b, Clutter.KEY_B, Clutter.KEY_i, Clutter.KEY_I].includes(symbol)) {
            apply([Clutter.KEY_b, Clutter.KEY_B].includes(symbol) ? 'bold' : 'italic');
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    text.connect('notify::width', scheduleFrames);
    text.connect('notify::height', scheduleFrames);
    text.connect('notify::mapped', scheduleFrames);
    text.connect('notify::allocation', scheduleFrames);
    text.clutter_text.connect('notify::allocation', scheduleFrames);
    // St.Entry rebuilds its Pango attributes on theme/focus changes. Apply the
    // document's ranges after that native handler, without replacing the Entry.
    text.connect_after('style-changed', () => {
        if (destroyed) return;
        refresh();
        onChange();
    });
    field.connect('destroy', () => {
        destroyed = true;
        if (renderSource) GLib.Source.remove(renderSource);
        if (syncSource) GLib.Source.remove(syncSource);
        renderSource = 0;
        syncSource = 0;
        for (const source of feedbackSources) GLib.Source.remove(source);
        feedbackSources.clear();
        ranges = [];
        previous = '';
    });
    refresh();
    return {toolbar, getFormat: () => { flushText(); return ranges.map(range => ({...range})); },
        setExpanded(value) { expanded = value; toolbar.visible = value; scheduleFrames(); }};
}
