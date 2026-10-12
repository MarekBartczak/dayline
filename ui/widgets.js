import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

export function box(vertical = false, style = '') {
    return new St.BoxLayout({orientation: vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL, style_class: style, x_expand: true});
}

export function label(text, style = '', wrap = false) {
    const actor = new St.Label({text, style_class: style, y_align: Clutter.ActorAlign.CENTER});
    actor.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    if (wrap) {
        actor.x_expand = true;
        actor.clutter_text.line_wrap = true;
        actor.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        actor.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    }
    return actor;
}

export function button(text, callback, style = 'dayline-button', icon = null) {
    const actor = new St.Button({style_class: style, can_focus: true, accessible_name: text});
    if (icon)
        actor.set_child(new St.Icon({icon_name: icon, icon_size: 16}));
    else
        actor.set_child(label(text));
    actor.connect('clicked', callback);
    return actor;
}

export function iconButton(name, icon, callback, extra = '') {
    const actor = button(name, callback, `dayline-icon-button ${extra}`, icon);
    actor.y_align = Clutter.ActorAlign.CENTER;
    return actor;
}

export function sectionHeading(text, count = null) {
    const row = box(false, 'dayline-section-heading');
    row.add_child(label(text, 'dayline-section-title'));
    if (count !== null)
        row.add_child(label(String(count), 'dayline-section-count'));
    return row;
}

export function emptyState(icon, title, description) {
    const actor = box(true, 'dayline-empty');
    actor.add_child(new St.Icon({icon_name: icon, icon_size: 30, style_class: 'dayline-empty-icon', x_align: Clutter.ActorAlign.CENTER}));
    actor.add_child(label(title, 'dayline-empty-title'));
    actor.add_child(label(description, 'dayline-muted', true));
    return actor;
}

export function formatDate(date, options = {day: 'numeric', month: 'long'}) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day, 12).toLocaleDateString('en-GB', options);
}
