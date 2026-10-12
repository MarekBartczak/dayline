import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

// Bypass the perf helper's display initialization: these windows must belong
// to the isolated compositor even when its X11 services are unavailable.
export async function createNativeTestWindow() {
    const title = `Dayline native test window ${GLib.uuid_string_random()}`;
    const client = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('windowClient.js').get_path();
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
    launcher.setenv('WAYLAND_DISPLAY', 'gnome-shell-test-display', true);
    launcher.setenv('GDK_BACKEND', 'wayland', true);
    launcher.setenv('GTK_A11Y', 'none', true);
    launcher.setenv('GSK_RENDERER', 'cairo', true);
    const process = launcher.spawnv(['/usr/bin/gjs', '-m', client, title]);
    let closed = false;
    const close = () => {
        if (closed)
            return;
        closed = true;
        try {
            process.force_exit();
        } catch {
            // The compositor may already have closed the client connection.
        }
    };
    try {
        const deadline = GLib.get_monotonic_time() + 5_000_000;
        while (GLib.get_monotonic_time() < deadline) {
            const window = global.get_window_actors().map(actor => actor.meta_window)
                .find(candidate => candidate.get_title() === title);
            if (window) {
                if (window.get_client_type() !== Meta.WindowClientType.WAYLAND)
                    throw new Error('The test window must use the isolated Wayland compositor.');
                // Keep its text entry outside the centered floating editor.
                // Clicking a covered window's center would target that editor.
                const monitor = global.display.get_monitor_geometry(window.get_monitor());
                window.move_frame(true, monitor.x + 8, monitor.y + 80);
                await Scripting.sleep(100);
                return {window, process, close};
            }
            await Scripting.sleep(50);
        }
        throw new Error('The native Wayland test window did not map within five seconds.');
    } catch (error) {
        close();
        throw error;
    }
}

function shortcut(key) {
    const keyboard = global.stage.context.get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time = GLib.get_monotonic_time();
    keyboard.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time + 1, key, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time + 2, key, Clutter.KeyState.RELEASED);
    keyboard.notify_keyval(time + 3, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
}

function clipboardText() {
    return new Promise(resolve => St.Clipboard.get_default().get_text(
        St.ClipboardType.CLIPBOARD, (_clipboard, text) => resolve(text)));
}

export async function copyNativeWindowText(handle) {
    global.stage.set_key_focus(null);
    handle.window.activate(global.get_current_time());
    await Scripting.sleep(200);
    if (global.display.focus_window !== handle.window)
        throw new Error('The native test window did not gain focus.');
    // A real seat interaction supplies the Wayland serial used by clipboard
    // selection ownership; programmatic window activation alone is insufficient.
    const rect = handle.window.get_frame_rect();
    const pointer = global.stage.context.get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const time = GLib.get_monotonic_time();
    pointer.notify_absolute_motion(time, rect.x + rect.width / 2, rect.y + rect.height / 2);
    pointer.notify_button(time + 1, 1, Clutter.ButtonState.PRESSED);
    pointer.notify_button(time + 2, 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(100);
    shortcut(Clutter.KEY_a);
    await Scripting.sleep(50);
    shortcut(Clutter.KEY_c);
    for (let attempt = 0; attempt < 20; attempt++) {
        await Scripting.sleep(50);
        const text = await clipboardText();
        if (text === 'External application text')
            return text;
    }
    throw new Error('Copying text from the native test entry did not update the clipboard.');
}

export async function pasteIntoShellEntry(entry) {
    const copied = await clipboardText();
    if (!copied)
        throw new Error('Copy text before pasting into the Shell test entry.');
    const before = entry.get_text();
    entry.grab_key_focus();
    entry.clutter_text.set_cursor_position(-1);
    entry.clutter_text.set_selection(-1, -1);
    shortcut(Clutter.KEY_v);
    for (let attempt = 0; attempt < 20; attempt++) {
        await Scripting.sleep(50);
        const text = entry.get_text();
        if (text === before + copied)
            return text;
    }
    throw new Error('Pasting native clipboard text into the Shell test entry failed.');
}
