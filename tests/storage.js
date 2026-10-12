import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {Store} from '../store.js';
import {addTask, emptyDocument, updateTask} from '../model.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
const directory = GLib.dir_make_tmp('dayline-storage-XXXXXX');
const path = GLib.build_filenamev([directory, 'data.json']);
const file = Gio.File.new_for_path(path);
const first = addTask(emptyDocument(), {id: 'a', text: 'Test', date: '2026-10-12', createdAt: '2026-10-12T08:00:00.000Z'});

try {
    const store = new Store(path);
    assert(store.data.tasks.length === 0 && !store.error, 'Missing file should start empty');
    store.save(first);
    assert(new Store(path).data.tasks[0].id === 'a', 'Saved data must survive reload');
    const oversized = {...emptyDocument(), notes: Array.from({length: 1200}, (_, i) => ({id: `n${i}`, text: '思'.repeat(10000), createdAt: '2026-10-12T08:00:00.000Z'}))};
    let oversizedRejected = false;
    try { store.save(oversized); } catch { oversizedRejected = true; }
    assert(oversizedRejected, 'Oversized UTF-8 document must be rejected before writing');
    assert(new Store(path).data.tasks[0].id === 'a' && store.data.tasks[0].id === 'a', 'Rejected oversized write must preserve disk and model');
    assert(!Gio.File.new_for_path(`${path}.bak`).query_exists(null), 'Rejected oversized write must not change backups');
    oversizedRejected = false;
    try { store.restore(oversized); } catch { oversizedRejected = true; }
    assert(oversizedRejected && new Store(path).data.tasks[0].id === 'a', 'Oversized restore must preserve existing data');
    store.save(emptyDocument());
    const backup = new Store(`${path}.bak`);
    assert(backup.data.tasks.length === 1, 'Backup must retain previous valid document');
    file.replace_contents('{broken', null, false, Gio.FileCreateFlags.PRIVATE, null);
    const corrupt = new Store(path);
    assert(Boolean(corrupt.error), 'Corrupt file must be reported');
    let failed = false;
    try { corrupt.save(first); } catch { failed = true; }
    assert(failed, 'Corrupt input must block writes');
    const [, bytes] = file.load_contents(null);
    assert(new TextDecoder().decode(bytes) === '{broken', 'Corrupt file must be preserved');
    corrupt.restore(first);
    assert(!corrupt.error && new Store(path).data.tasks.length === 1, 'Explicit restore must recover store');
    const [, corruptBytes] = Gio.File.new_for_path(`${path}.corrupt`).load_contents(null);
    assert(new TextDecoder().decode(corruptBytes) === '{broken', 'Restore must preserve corrupt original');
    const legacy = {version: 1, tasks: [
        {id: 'legacy', text: 'Original task', date: '2026-10-12', done: false, createdAt: '2026-10-12T08:00:00.000Z'},
        {id: 'completed', text: 'Already done', date: '2026-10-11', done: true, createdAt: '2026-10-11T08:00:00.000Z'},
    ], notes: [{id: 'legacy-note', text: 'Original\nnotes', createdAt: '2026-10-12T08:00:00.000Z'}]};
    const legacyContents = JSON.stringify(legacy, null, 4) + '\n';
    file.replace_contents(legacyContents, null, false, Gio.FileCreateFlags.PRIVATE, null);
    const migrated = new Store(path);
    assert(!migrated.error && migrated.data.version === 2, 'Existing v1 data must load as canonical v2');
    assert(migrated.data.tasks.every(task => task.inProgress === false), 'Migration must preserve done tasks and default to waiting');
    assert(migrated.data.tasks[1].done && migrated.data.notes[0].text === legacy.notes[0].text, 'Migration must preserve task status and notes');
    migrated.save(updateTask(migrated.data, 'legacy', {inProgress: true}));
    const [, migratedBytes] = file.load_contents(null);
    const onDisk = JSON.parse(new TextDecoder().decode(migratedBytes));
    assert(onDisk.version === 2 && onDisk.tasks[0].inProgress, 'Saving migrated data must persist v2 task status');
    assert(new Store(path).data.tasks[0].inProgress, 'In-progress status must survive reload');
    const [, legacyBackupBytes] = Gio.File.new_for_path(`${path}.bak`).load_contents(null);
    assert(new TextDecoder().decode(legacyBackupBytes) === legacyContents, 'Migration save must retain original v1 bytes in backup');
    file.replace_contents(legacyContents, null, false, Gio.FileCreateFlags.PRIVATE, null);
    new Store(path).restore(first);
    const [, restoreBackupBytes] = Gio.File.new_for_path(`${path}.bak`).load_contents(null);
    assert(new TextDecoder().decode(restoreBackupBytes) === legacyContents, 'Restore must also retain original valid v1 bytes');
    // A regular file as parent guarantees ENOTDIR even when tests run as root.
    const blocked = new Store(`${path}/blocked.json`);
    failed = false;
    try { blocked.save(first); } catch { failed = true; }
    assert(failed && blocked.data.tasks.length === 0, 'Failed save cannot update model');
    print('PASS: real GIO storage, v1 migration, original backups, status persistence, size limits and corruption recovery');
} finally {
    for (const name of ['data.json', 'data.json.bak', 'data.json.corrupt']) {
        const entry = Gio.File.new_for_path(GLib.build_filenamev([directory, name]));
        if (entry.query_exists(null))
            entry.delete(null);
    }
    Gio.File.new_for_path(directory).delete(null);
}
