// Actual Shell actors and async crypto in an isolated headless test session.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};
const uuid = 'dayline@marekbartczak.github.io';
const password = 'Synthetic test password 2026';
let pointerDevice;
function assert(value, message) { if (!value) throw new Error(`Private notes: ${message}`); }
function find(actor, name) {
    if (actor.accessible_name === name) return actor;
    for (const child of actor.get_children()) { const match = find(child, name); if (match) return match; }
    return null;
}
function click(panel, name) {
    const actor = find(panel.menu.actor, name);
    assert(actor, `Missing ${name}`);
    actor.emit('clicked', 1);
}
async function pointerClick(panel, name) {
    // Let preceding text/viewport changes allocate the target before moving
    // the pointer; stale popup coordinates can intentionally dismiss it.
    await Scripting.sleep(180);
    const actor = find(panel.menu.actor, name);
    assert(actor?.visible && actor.mapped, `Visible pointer target ${name}`);
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    const pointer = pointerDevice;
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + width / 2, y + height / 2);
    await Scripting.sleep(50);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(250);
}
async function pointerSelect(entry, fragment) {
    entry.grab_key_focus();
    await Scripting.sleep(300);
    const value = entry.get_text();
    const offset = value.indexOf(fragment);
    assert(offset >= 0, 'Pointer selection text exists');
    const start = Array.from(value.slice(0, offset)).length;
    const end = start + Array.from(fragment).length;
    const actor = entry.clutter_text;
    const [x, y] = actor.get_transformed_position();
    const [firstValid, firstX, firstY, firstHeight] = actor.position_to_coords(start);
    const [lastValid, lastX, lastY, lastHeight] = actor.position_to_coords(end);
    assert(firstValid && lastValid, 'Pointer selection coordinates exist');
    const pointer = pointerDevice;
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + firstX + 1, y + firstY + firstHeight / 2);
    await Scripting.sleep(50);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
    await Scripting.sleep(50);
    pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + lastX - 1, y + lastY + lastHeight / 2);
    await Scripting.sleep(80);
    pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
    await Scripting.sleep(100);
    assert(actor.get_selection() === fragment, `Actual pointer selects complete title/code text: ${JSON.stringify({expected:fragment,selected:actor.get_selection(),start,end,firstX,firstY,lastX,lastY,x,y})}`);
}
async function formatPrivate(panel, title, code) {
    await pointerSelect(panel.editor.text, title);
    await pointerClick(panel, 'Bold');
    await pointerSelect(panel.editor.text, code);
    await pointerClick(panel, 'Code block');
    const ranges = panel.editor.getFormat();
    assert(ranges.some(range => range.type === 'bold') && ranges.some(range => range.type === 'code'), 'Private title and code gain formatting');
    assert(find(panel.menu.actor, 'Copy code'), 'Private code frame has a copy control');
    return ranges;
}
function assertIsolation(app, panel, secret) {
    const envelope = JSON.parse(read(app.vault.path));
    assert(Object.keys(envelope).sort().join(',') === 'ciphertext,kdf,nonce,salt,version', 'Vault envelope contains only encrypted protocol fields');
    assert(!read(app.vault.path).includes(secret) && !read(app.vault.path).includes('format'), 'Private text and formatting remain encrypted');
    assert(app.store.data.notes.length === 0 && !JSON.stringify(app.store.data).includes(secret), 'Private never enters public store');
    assert(panel.entryDrafts.size === 0, 'Private text and formatting never enter public entryDrafts');
}
async function settle(panel) {
    for (let attempt = 0; attempt < 150; attempt++) {
        if (!panel.privateNotes.pending && !panel.privateNotes.closing && !panel.app.vault.busy) {
            await Scripting.sleep(180);
            return;
        }
        await Scripting.sleep(50);
    }
    throw new Error('Private operation timed out');
}
function authenticate(panel, create = false, value = password) {
    find(panel.menu.actor, 'Private notes password').set_text(value);
    if (create) find(panel.menu.actor, 'Confirm private notes password').set_text(value);
    click(panel, create ? 'Create encrypted vault' : 'Unlock private notes');
}
function read(path) { return new TextDecoder().decode(Gio.File.new_for_path(path).load_contents(null)[1]); }
async function capture(panel) {
    const directory = GLib.getenv('DAYLINE_SCREENSHOTS');
    if (!directory) return;
    GLib.mkdir_with_parents(directory, 0o755);
    await Scripting.sleep(250);
    const stream = Gio.File.new_for_path(`${directory}/private-locked.png`).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const [x, y] = panel.menu.actor.get_transformed_position();
    const [width, height] = panel.menu.actor.get_transformed_size();
    const start = Math.max(0, Math.floor(x) - 16);
    await new Shell.Screenshot().screenshot_area(start, 0, Math.min(global.stage.width - start, Math.ceil(width) + 32), Math.min(global.stage.height, Math.ceil(y + height) + 16), stream);
    stream.close(null);
}

export async function run() {
    Main.overview.hide();
    pointerDevice = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    pointerDevice.notify_absolute_motion(GLib.get_monotonic_time(), 640, 650);
    await Scripting.sleep(900);
    const app = Main.extensionManager.lookup(uuid)?.stateObj;
    assert(app?.vault && app.panel, 'Extension must enable');
    const panel = app.panel;
    panel.menu.open();
    click(panel, 'Private');
    assert(!app.vault.unlocked && !panel.composerArea.visible, 'Private starts locked without public composer');
    const initialPassword = panel.privateNotes.password;
    initialPassword.set_text('typed password');
    app.reload();
    assert(panel.privateNotes.password === initialPassword && initialPassword.get_text() === 'typed password', 'Public background refresh must preserve a typed private password');
    click(panel, 'Today');
    panel.menu.close();
    panel.menu.open();
    click(panel, 'Private');
    authenticate(panel, true);
    await settle(panel);
    assert(app.vault.unlocked && app.vault.notes.length === 0, `Creation must unlock: ${panel.privateNotes.error}`);
    click(panel, 'New private note');
    const code = '    const secret = "🔐";\n\treturn secret;';
    const savedText = `Synthetic confidential note\n\n${code}\n\nSecond line`;
    panel.editor.text.set_text(savedText);
    await pointerClick(panel, 'Expand editor');
    const savedFormat = await formatPrivate(panel, 'Synthetic confidential note', code);
    assert(panel.editor.text.get_text() === savedText, 'Formatting preserves exact private code indentation');
    await pointerClick(panel, 'Add entry');
    await settle(panel);
    assert(!panel.editor && app.vault.notes.length === 1, 'Save encrypted private note');
    assert(app.vault.notes[0].text === savedText && JSON.stringify(app.vault.notes[0].format) === JSON.stringify(savedFormat), 'Private save persists exact text and formatting');
    assertIsolation(app, panel, 'Synthetic confidential');
    click(panel, 'Open private note');
    const originalSave = app.vault.save;
    app.vault.save = () => Promise.reject(new Error('Synthetic storage failure'));
    click(panel, 'Save changes');
    await settle(panel);
    assert(panel.editor && panel.message.visible, 'A failed save must keep the editor and show feedback');
    assert(panel.message.get_first_child().text === 'Synthetic storage failure', 'Save error must be readable');
    app.vault.save = originalSave;
    panel.message.hide();
    const draftText = `Synthetic unfinished private edit\n\n${code}\n\nDraft review`;
    panel.editor.text.set_text('');
    assert(panel.editor.getFormat().length === 0, 'Replacing private contents clears old formatting');
    panel.editor.text.set_text(draftText);
    const edit = panel.editor;
    click(panel, 'Pin panel');
    assert(app.vault.unlocked && panel.editor === edit && panel.editor.text.get_text().includes('unfinished'), 'Internal pin switch must not lock or destroy private draft');
    click(panel, 'Expand editor');
    assert(panel.expanded && panel.pinning.pinned, 'Private editor expands with pin retained');
    const draftFormat = await formatPrivate(panel, 'Synthetic unfinished private edit', code);
    assert(panel.editor.text.get_text() === draftText, 'Private draft retains indented code before lock');
    panel.menu.close();
    assert(!panel.editor && !find(panel.menu.actor, 'Open private note') && !find(panel.menu.actor, 'Copy code') && !find(panel.menu.actor, 'Text formatting'), 'Closing removes private text, code and formatting actors immediately');
    await settle(panel);
    assert(!app.vault.unlocked && app.vault.notes.length === 0 && app.vault.draft === null, 'Closing clears decrypted RAM state');
    const focus = global.stage.get_key_focus();
    assert(!focus || !panel.menu.actor.contains(focus), 'Locked hidden form must not retain keyboard focus');
    assertIsolation(app, panel, 'Synthetic unfinished');
    panel.menu.open();
    await capture(panel);
    authenticate(panel, false, 'wrong password');
    await settle(panel);
    assert(!app.vault.unlocked && panel.privateNotes.error, 'Wrong password stays locked');
    authenticate(panel);
    await settle(panel);
    assert(app.vault.notes[0].text === savedText && JSON.stringify(app.vault.notes[0].format) === JSON.stringify(savedFormat), 'Saved rich note survives encrypted lock/unlock roundtrip');
    assert(app.vault.draft.text === draftText && JSON.stringify(app.vault.draft.format) === JSON.stringify(draftFormat), 'Encrypted unfinished draft restores exact text and formatting');
    click(panel, 'Resume saved draft');
    await Scripting.sleep(200);
    assert(panel.editor.text.get_text() === draftText && JSON.stringify(panel.editor.getFormat()) === JSON.stringify(draftFormat), 'Private editor restores exact encrypted draft formatting');
    assert(find(panel.menu.actor, 'Copy code'), 'Restored compact private editor recreates code frame');
    assert(panel.entryDrafts.size === 0, 'Restoration keeps private format outside public entryDrafts');
    click(panel, 'Save changes');
    panel.menu.close();
    await settle(panel);
    panel.menu.open();
    authenticate(panel);
    await settle(panel);
    assert(app.vault.notes[0].text.includes('unfinished') && app.vault.draft === null, 'Closing during save must preserve one note without duplicate draft');
    assert(JSON.stringify(app.vault.notes[0].format) === JSON.stringify(draftFormat), 'Closing during rich save preserves committed formatting');
    assertIsolation(app, panel, 'Synthetic unfinished');
    click(panel, 'Lock private notes');
    await settle(panel);
    authenticate(panel);
    panel.menu.close();
    await settle(panel);
    assert(!app.vault.unlocked, 'Close while unlocking must cancel late unlock');
    panel.menu.open();
    authenticate(panel);
    await settle(panel);
    click(panel, 'New private note');
    panel.editor.text.set_text('Synthetic screen-lock draft');
    Main.screenShield._isLocked = true;
    try { Main.screenShield.emit('locked-changed'); }
    finally { Main.screenShield._isLocked = false; }
    await settle(panel);
    assert(!panel.menu.isOpen && !app.vault.unlocked && !panel.editor, 'Screen lock closes pinned panel and locks private notes');
    panel.menu.open();
    authenticate(panel);
    await settle(panel);
    assert(app.vault.draft.text === 'Synthetic screen-lock draft', 'Screen lock preserves encrypted draft');
    click(panel, 'Today');
    panel.menu.close();
    await settle(panel);
    assert(!app.vault.unlocked && panel.counter.text === '0', 'Close on another tab still locks vault, without changing public counters');
    panel.menu.open();
    click(panel, 'Private');
    authenticate(panel);
    await settle(panel);
    click(panel, 'Resume saved draft');
    panel.editor.text.set_text('Synthetic disabled-extension draft');
    const vault = app.vault;
    const controller = panel.privateNotes;
    await Main.extensionManager.disableExtension(uuid);
    await controller.closing;
    await vault.whenIdle();
    assert(!vault.unlocked && controller.disposed && !app.panel, 'Disable locks and disposes all private actors');
    await Main.extensionManager.enableExtension(uuid);
    const next = Main.panel.statusArea[uuid];
    next.menu.open();
    click(next, 'Private');
    authenticate(next);
    await settle(next);
    assert(next.app.vault.draft.text === 'Synthetic disabled-extension draft', 'Disable preserves encrypted draft');
    next.menu.close();
    await settle(next);
    const finalController = next.privateNotes;
    const finalVault = next.app.vault;
    await Main.extensionManager.disableExtension(uuid);
    await finalController.closing;
    await finalVault.whenIdle();
    await Scripting.sleep(200);
    print('PASS: native Private tab, pointer rich formatting, encryption isolation, pin/expand, formatted encrypted drafts, pending unlock/save, close/screen lock and disable lifecycle');
}
