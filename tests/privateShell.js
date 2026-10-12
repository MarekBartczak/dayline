// Actual Shell actors and async crypto in an isolated headless test session.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};
const uuid = 'dayline@marekbartczak.github.io';
const password = 'Synthetic test password 2026';
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
    panel.editor.text.set_text('Synthetic confidential note\nSecond line');
    click(panel, 'Add entry');
    await settle(panel);
    assert(!panel.editor && app.vault.notes.length === 1, 'Save encrypted private note');
    assert(!read(app.vault.path).includes('Synthetic confidential'), 'Disk must contain ciphertext');
    assert(app.store.data.notes.length === 0 && !JSON.stringify(app.store.data).includes('confidential'), 'Private never enters public store');
    click(panel, 'Open private note');
    const originalSave = app.vault.save;
    app.vault.save = () => Promise.reject(new Error('Synthetic storage failure'));
    click(panel, 'Save changes');
    await settle(panel);
    assert(panel.editor && panel.message.visible, 'A failed save must keep the editor and show feedback');
    assert(panel.message.get_first_child().text === 'Synthetic storage failure', 'Save error must be readable');
    app.vault.save = originalSave;
    panel.message.hide();
    panel.editor.text.set_text('Synthetic unfinished private edit');
    const edit = panel.editor;
    click(panel, 'Pin panel');
    assert(app.vault.unlocked && panel.editor === edit && panel.editor.text.get_text().includes('unfinished'), 'Internal pin switch must not lock or destroy private draft');
    click(panel, 'Expand editor');
    assert(panel.expanded && panel.pinning.pinned, 'Private editor expands with pin retained');
    panel.menu.close();
    assert(!panel.editor && !find(panel.menu.actor, 'Open private note'), 'Closing removes plaintext actors immediately');
    await settle(panel);
    assert(!app.vault.unlocked && app.vault.notes.length === 0 && app.vault.draft === null, 'Closing clears decrypted RAM state');
    const focus = global.stage.get_key_focus();
    assert(!focus || !panel.menu.actor.contains(focus), 'Locked hidden form must not retain keyboard focus');
    assert(!read(app.vault.path).includes('unfinished'), 'Unfinished draft is encrypted');
    panel.menu.open();
    await capture(panel);
    authenticate(panel, false, 'wrong password');
    await settle(panel);
    assert(!app.vault.unlocked && panel.privateNotes.error, 'Wrong password stays locked');
    authenticate(panel);
    await settle(panel);
    click(panel, 'Resume saved draft');
    assert(panel.editor.text.get_text() === 'Synthetic unfinished private edit', 'Encrypted draft restores exactly');
    click(panel, 'Save changes');
    panel.menu.close();
    await settle(panel);
    panel.menu.open();
    authenticate(panel);
    await settle(panel);
    assert(app.vault.notes[0].text.includes('unfinished') && app.vault.draft === null, 'Closing during save must preserve one note without duplicate draft');
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
    print('PASS: native Private tab, encryption isolation, pin/expand, encrypted drafts, pending unlock/save, close/screen lock and disable lifecycle');
}
