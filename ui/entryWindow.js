import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {box, label, iconButton} from './widgets.js';
import {editor} from './editor.js';
import {resolveAccent, backgroundColor, windowOpacity} from './appearance.js';

export class EntryWindow {
    constructor(panel, kind, item) {
        this.panel = panel;
        this.app = panel.app;
        this.kind = kind;
        this.item = item;
        this.closed = false;
        this.pinned = panel.pinning?.pinned ?? false;
        this.expanded = false;
        const draft = panel.entryDrafts.get(`${kind}/${item.id}`);
        this.root = box(true, 'dayline-popup dayline-detail-content');
        this.actor = new St.Bin({style_class: 'dayline-menu dayline-entry-window', child: this.root, reactive: true, can_focus: true});
        this.pin = iconButton('Pin entry window', null, () => this.setPinned(!this.pinned));
        this.pin.set_child(new St.Icon({gicon: Gio.icon_new_for_string(`${this.app.path}/icons/pin-symbolic.svg`), icon_size: 16}));
        this.scroll = new St.ScrollView({style_class: 'dayline-detail-scroll', x_expand: true, overlay_scrollbars: false, hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
        this.editor = editor(kind, {...item, text: draft?.text ?? item.text}, '', draft?.date ?? item.date, this.app.store.data,
            (text, date) => {
                this.app.edit(kind, item.id, text, date);
                this.close(true);
            }, () => this.close(true), message => this.showError(message), () => this.setExpanded(!this.expanded),
            {detached: true, title: kind === 'tasks' ? 'Task details' : 'Note details', pinButton: this.pin, onClose: () => this.close()});
        if (draft?.date && this.editor.date) this.editor.date.set_text(draft.date);
        this.scroll.set_child(this.editor.root);
        this.root.add_child(this.scroll);
        this.message = label('', 'dayline-message-text', true);
        this.root.add_child(this.message);
        this.message.hide();
        this.hint = label('', 'dayline-hint', true);
        this.root.add_child(this.hint);
        this.setPinned(this.pinned);
        this.monitor = Main.layoutManager.findMonitorForActor(panel) ?? Main.layoutManager.primaryMonitor;
        Main.layoutManager.addChrome(this.actor, {trackFullscreen: false});
        this.adjustSize();
        this.updateTheme();
        this.heightSignal = this.actor.connect('notify::height', () => this.position());
        this.widthSignal = this.actor.connect('notify::width', () => {
            if (!this.closed) { this.root.width = this.actor.width; this.position(); }
        });
        this.actor.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) { this.close(); return Clutter.EVENT_STOP; }
            return Clutter.EVENT_PROPAGATE;
        });
        this.outsideSignal = global.stage.connect('captured-event', (_stage, event) => {
            if (!this.pinned && [Clutter.EventType.BUTTON_PRESS, Clutter.EventType.TOUCH_BEGIN].includes(event.type())) {
                const source = global.stage.get_event_actor(event);
                if (!source || !this.actor.contains(source)) this.close();
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.focusSignal = global.display.connect('notify::focus-window', () => {
            if (!global.display.focus_window) return;
            const focus = global.stage.get_key_focus();
            if (focus && this.actor.contains(focus)) global.stage.set_key_focus(null);
            if (!this.pinned) this.close();
        });
        this.keyFocusSignal = global.stage.connect('notify::key-focus', () => {
            if (this.closed || this.pinned) return;
            const focus = global.stage.get_key_focus();
            if (!focus || !this.actor.contains(focus)) this.close();
        });
        this.monitorSignal = Main.layoutManager.connect('monitors-changed', () => {
            this.monitor = Main.layoutManager.findMonitorForActor(this.actor) ?? Main.layoutManager.primaryMonitor;
            this.adjustSize();
        });
        this.themeContext = St.ThemeContext.get_for_stage(global.stage);
        this.scaleSignal = this.themeContext.connect('notify::scale-factor', () => this.adjustSize());
        this.actor.show();
        this.position();
        this.editor.text.grab_key_focus();
    }

    setPinned(value) {
        this.pinned = Boolean(value);
        this.pin.accessible_name = this.pinned ? 'Unpin entry window' : 'Pin entry window';
        if (this.pinned) this.pin.add_style_class_name('dayline-pin-active');
        else this.pin.remove_style_class_name('dayline-pin-active');
        this.hint.text = this.pinned ? 'Pinned · switch windows freely' : 'Pin this window to keep it open while copying elsewhere.';
    }

    adjustSize(animate = false) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const monitor = this.monitor;
        if (!monitor) return;
        const width = Math.min(this.expanded ? 760 : 560, Math.max(240, monitor.width / scale - 48)) * scale;
        const height = Math.max(160, monitor.height / scale - 135);
        this.scroll.set_style(`max-height: ${height}px;`);
        this.editor.resize(this.expanded, Math.max(100, Math.min(this.expanded ? 440 : 290, height - (this.kind === 'tasks' ? 235 : 155))));
        if (animate && this.actor.mapped) this.actor.ease({width, duration: 180, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        else this.actor.width = this.root.width = width;
        this.position();
    }

    setExpanded(value) {
        this.expanded = Boolean(value);
        this.adjustSize(true);
    }

    position() {
        if (this.closed || !this.monitor) return;
        const monitor = this.monitor;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.actor.set_position(Math.round(monitor.x + (monitor.width - this.actor.width) / 2),
            Math.round(monitor.y + Math.max(32 * scale, (monitor.height - this.actor.height) / 2)));
    }

    updateTheme() {
        if (this.closed) return;
        const appearance = this.app.settings.get_string('appearance');
        const light = appearance === 'light' || appearance === 'system' && this.app.desktopSettings.get_string('color-scheme') !== 'prefer-dark';
        if (light) this.actor.add_style_class_name('dayline-light');
        else this.actor.remove_style_class_name('dayline-light');
        const accent = resolveAccent(this.app.settings.get_string('accent'), this.app.desktopSettings.get_string('accent-color'));
        if (this.accentName) this.actor.remove_style_class_name(`dayline-accent-${this.accentName}`);
        this.accentName = accent.name;
        this.actor.add_style_class_name(`dayline-accent-${accent.name}`);
        this.actor.set_style(`background-color: ${backgroundColor(accent, light)}; border-color: ${light ? '#dddae8' : '#393a4b'};`);
        this.actor.opacity = windowOpacity(this.app.settings.get_int('opacity'));
    }

    showError(message) {
        this.message.text = message;
        this.message.show();
    }

    close(discardDraft = false) {
        if (this.closed) return;
        this.closed = true;
        const key = `${this.kind}/${this.item.id}`;
        if (discardDraft) this.panel.entryDrafts.delete(key);
        else this.panel.entryDrafts.set(key, {text: this.editor.text.get_text(), date: this.editor.date?.get_text()});
        this.editor.text.set_text('');
        if (this.outsideSignal) global.stage.disconnect(this.outsideSignal);
        if (this.focusSignal) global.display.disconnect(this.focusSignal);
        if (this.keyFocusSignal) global.stage.disconnect(this.keyFocusSignal);
        if (this.monitorSignal) Main.layoutManager.disconnect(this.monitorSignal);
        if (this.scaleSignal) this.themeContext.disconnect(this.scaleSignal);
        this.actor.disconnect(this.heightSignal);
        this.actor.disconnect(this.widthSignal);
        const focus = global.stage.get_key_focus();
        if (focus && this.actor.contains(focus)) global.stage.set_key_focus(null);
        this.actor.remove_all_transitions();
        Main.uiGroup.get_allocation_box();
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
        if (this.panel.details === this) this.panel.details = null;
    }
}
