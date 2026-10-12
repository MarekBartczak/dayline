import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import {iconButton, label} from './widgets.js';

// Keep the same editor actors while switching this menu's modal ownership.
// The manager is never monkey-patched and other panel menus remain managed.
export function attachPin(panel) {
    if (panel.pinning) return panel.pinning;
    const manager = Main.panel.menuManager;
    const menu = panel.menu;
    const heading = panel.root.get_first_child();
    const brand = heading.get_first_child();
    const hint = label('Pinned · switch windows freely', 'dayline-pin-hint');
    brand.add_child(hint);
    hint.hide();
    let changing = false;
    const control = {
        pinned: false,
        setPinned(value) {
            if (value === this.pinned) return;
            const wasOpen = menu.isOpen;
            const focus = global.stage.get_key_focus();
            const restoreFocus = wasOpen && focus && menu.actor.contains(focus);
            changing = true;
            panel.pinningChanging = true;
            try {
                // close() releases the existing grab before removeMenu(), which
                // alone would leave the manager's activeMenu pointing at us.
                menu.close(BoxPointer.PopupAnimation.NONE);
                if (value) manager.removeMenu(menu);
                else manager.addMenu(menu);
                this.pinned = value;
                pin.accessible_name = value ? 'Unpin panel' : 'Pin panel';
                if (value) pin.add_style_class_name('dayline-pin-active');
                else pin.remove_style_class_name('dayline-pin-active');
                hint.visible = close.visible = value;
                if (wasOpen) menu.open(BoxPointer.PopupAnimation.NONE);
                if (restoreFocus) focus.grab_key_focus();
            } finally {
                changing = false;
                panel.pinningChanging = false;
            }
        },
    };
    const pin = iconButton('Pin panel', null, () => control.setPinned(!control.pinned));
    pin.set_child(new St.Icon({gicon: Gio.icon_new_for_string(`${panel.app.path}/icons/pin-symbolic.svg`), icon_size: 16}));
    const close = iconButton('Close pinned panel', 'window-close-symbolic', () => menu.close(BoxPointer.PopupAnimation.FULL));
    close.hide();
    heading.insert_child_at_index(pin, 1);
    heading.insert_child_at_index(close, 2);
    const stateId = menu.connect('open-state-changed', (_menu, open) => {
        if (open || changing || !control.pinned) return;
        const focus = global.stage.get_key_focus();
        if (focus && menu.actor.contains(focus)) global.stage.set_key_focus(null);
    });
    const focusId = global.display.connect('notify::focus-window', () => {
        if (!control.pinned || !menu.isOpen || !global.display.focus_window) return;
        const focus = global.stage.get_key_focus();
        if (focus && menu.actor.contains(focus)) global.stage.set_key_focus(null);
    });
    menu.actor.connect('key-press-event', (_actor, event) => {
        if (control.pinned && !panel.editor && event.get_key_symbol() === Clutter.KEY_Escape) {
            menu.close(BoxPointer.PopupAnimation.FULL);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    menu.connect('destroy', () => {
        menu.disconnect(stateId);
        global.display.disconnect(focusId);
        panel.pinning = null;
    });
    panel.pinning = control;
    return control;
}
