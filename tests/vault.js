import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {PrivateVault} from '../vault.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

async function rejected(promise) {
    try {
        await promise;
        return false;
    } catch {
        return true;
    }
}

const directory = GLib.dir_make_tmp('dayline-vault-XXXXXX');
const path = GLib.build_filenamev([directory, 'private-notes.vault']);
const helper = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('private_vault.py').get_path();
const password = 'test-only secret password';
const note = {id: 'private-a', text: 'Hidden note', createdAt: '2026-10-12T08:00:00.000Z'};

try {
    const vault = new PrivateVault(path, helper);
    assert(!vault.exists() && !vault.unlocked && !vault.busy, 'New vault must start locked');
    await vault.create(password);
    assert(vault.exists() && vault.unlocked && vault.notes.length === 0, 'Create must unlock encrypted vault');
    const draft = {id: note.id, text: 'Unfinished edited text'};
    await vault.save([note], draft);
    vault.lock();
    assert(!vault.unlocked && vault.notes.length === 0 && vault.draft === null, 'Lock must clear decrypted data synchronously');
    assert(await rejected(vault.unlock('wrong password')), 'Wrong password must be rejected');
    assert(!vault.unlocked, 'Failed unlock must stay locked');
    await vault.unlock(password);
    assert(vault.notes[0].text === note.text && vault.draft.text === draft.text, 'Saved note and draft must survive lock');
    const exposed = vault.notes;
    exposed[0].text = 'Changed outside vault';
    assert(vault.notes[0].text === note.text, 'Getter must not expose mutable internal state');
    const codeText = '\n    🔐print("hello")\n  ';
    const format = [{type: 'code', start: 0, end: Array.from(codeText).length}, {type: 'bold', start: 5, end: 6}];
    const formatted = {...note, text: codeText, format};
    const formattedDraft = {id: note.id, text: codeText, format};
    const formattingSave = vault.save([formatted], formattedDraft);
    // Request cloning prevents later caller mutation from changing queued data.
    format[0].end = 1;
    await formattingSave;
    const [, encryptedBytes] = Gio.File.new_for_path(path).load_contents(null);
    const envelopeText = new TextDecoder().decode(encryptedBytes);
    assert(!envelopeText.includes('format') && !envelopeText.includes(codeText), 'Formatting and code must remain inside encrypted payload');
    vault.lock();
    await vault.unlock(password);
    assert(vault.notes[0].text === codeText && vault.draft.text === codeText, 'Encrypted code whitespace must survive lock');
    assert(vault.notes[0].format[0].end === Array.from(codeText).length && vault.draft.format[0].end === Array.from(codeText).length, 'Formatting must survive encrypted note and draft roundtrip');
    const noteClone = vault.notes;
    const draftClone = vault.draft;
    noteClone[0].format[0].end = 1;
    draftClone.format[0].end = 1;
    assert(vault.notes[0].format[0].end > 1 && vault.draft.format[0].end > 1, 'Formatting getters must clone nested metadata');
    for (const invalid of [null, [{type: 'bold', start: true, end: 1}], [{type: 'code', start: 0, end: 3}], [{type: 'italic', start: 0, end: 1, extra: true}], Array(2001).fill({type: 'bold', start: 0, end: 1})]) {
        assert(await rejected(vault.save([{...note, text: '🔐x', format: invalid}])), 'Malformed note formatting must reject');
        assert(await rejected(vault.save(vault.notes, {id: null, text: '🔐x', format: invalid})), 'Malformed draft formatting must reject');
    }
    const limitText = '🔐'.repeat(5000);
    await vault.save([{...note, text: limitText, format: [{type: 'code', start: 0, end: 5000}]}]);
    assert(await rejected(vault.save([{...note, text: limitText + 'x', format: []}])), 'Formatted notes must retain 10000 UTF-16 limit');
    assert(await rejected(vault.save(vault.notes, {id: null, text: limitText + 'x', format: []})), 'Formatted drafts must retain 10000 UTF-16 limit');
    await vault.save([{...note, format: []}], {id: null, text: '', format: []});
    vault.lock();
    await vault.unlock(password);
    assert(vault.notes[0].format.length === 0 && vault.draft.format.length === 0, 'Saving no ranges must clear previous annotations');
    const firstSave = vault.save([{...note, text: 'First queued save'}]);
    const lastSave = vault.save([{...note, text: 'Second queued save'}], {id: null, text: 'New note draft'});
    await vault.whenIdle();
    await Promise.all([firstSave, lastSave]);
    assert(!vault.busy && vault.notes[0].text === 'Second queued save', 'Saves must serialize');
    vault.lock();
    const unlocking = vault.unlock(password);
    const queuedSave = vault.save([note]);
    assert(vault.busy, 'Pending operations must report busy');
    // Yield to GIO so unlock has actually started its subprocess before locking.
    await new Promise(resolve => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
    vault.lock();
    assert(await rejected(unlocking) && await rejected(queuedSave), 'Lock must cancel active and queued jobs');
    await vault.whenIdle();
    assert(!vault.unlocked && !vault.busy && vault.notes.length === 0, 'Pending completion must not unlock closed vault');
    await vault.unlock(password);
    assert(vault.notes[0].text === 'Second queued save', 'Cancelled operations must retain ciphertext');
    assert(await rejected(vault.unlock('wrong password')), 'Failed reauthentication must reject');
    assert(!vault.unlocked && vault.notes.length === 0, 'Failed reauthentication must clear prior decrypted state');
    await vault.unlock(password);
    const file = Gio.File.new_for_path(path);
    file.replace_contents('{broken', null, false, Gio.FileCreateFlags.PRIVATE, null);
    assert(await rejected(vault.save([note])), 'Corrupt ciphertext must block writes');
    const [, bytes] = file.load_contents(null);
    assert(new TextDecoder().decode(bytes) === '{broken', 'Failed save must retain corrupt original');
    vault.lock();
    print('PASS: async encrypted vault, formatting and draft recovery, Unicode limits, serialization and lock cancellation');
} finally {
    for (const name of ['private-notes.vault', 'private-notes.vault.lock']) {
        const file = Gio.File.new_for_path(GLib.build_filenamev([directory, name]));
        if (file.query_exists(null))
            file.delete(null);
    }
    Gio.File.new_for_path(directory).delete(null);
}
