import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const clone = value => JSON.parse(JSON.stringify(value));
const CANCELLED = 'Private notes were locked. Unlock them again to continue.';

export function privateVaultPath() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'dayline', 'private-notes.vault']);
}

export class PrivateVault {
    constructor(path = privateVaultPath(), helperPath = null) {
        this.path = path;
        this.helperPath = helperPath ?? Gio.File.new_for_uri(import.meta.url).get_parent().get_child('private_vault.py').get_path();
        this._key = null;
        this._salt = null;
        this._revision = null;
        this._notes = [];
        this._draft = null;
        this._generation = 0;
        this._pending = 0;
        this._tail = Promise.resolve();
        this._process = null;
        this._cancellable = null;
    }

    exists() {
        return Gio.File.new_for_path(this.path).query_exists(null);
    }

    get unlocked() {
        return this._key !== null;
    }

    get busy() {
        return this._pending > 0;
    }

    get notes() {
        return clone(this._notes);
    }

    get draft() {
        return clone(this._draft);
    }

    whenIdle() {
        return this._tail;
    }

    create(password) {
        return this._enqueue('create', {password});
    }

    unlock(password) {
        return this._enqueue('unlock', {password});
    }

    save(notes, draft = null) {
        return this._enqueue('save', clone({notes, draft}));
    }

    lock() {
        ++this._generation;
        this._clearState();
        this._cancellable?.cancel();
        this._process?.force_exit();
    }

    _clearState() {
        this._key = null;
        this._salt = null;
        this._revision = null;
        this._notes = [];
        this._draft = null;
    }

    _enqueue(operation, fields) {
        const generation = this._generation;
        ++this._pending;
        const job = this._tail.then(async () => {
            if (generation !== this._generation)
                throw new Error(CANCELLED);
            if (operation === 'create' || operation === 'unlock')
                this._clearState();
            if (operation === 'save') {
                if (!this.unlocked)
                    throw new Error('Unlock private notes before saving.');
                fields.key = this._key;
                fields.salt = this._salt;
                fields.revision = this._revision;
            }
            const result = await this._request({operation, path: this.path, ...fields});
            if (generation !== this._generation)
                throw new Error(CANCELLED);
            if (!result.ok)
                throw new Error(result.error ?? 'Unable to access private notes.');
            this._key = result.key;
            this._salt = result.salt;
            this._revision = result.revision;
            this._notes = result.notes;
            this._draft = result.draft;
            return this.notes;
        }).finally(() => {
            // Drop queued request references as soon as they finish or are cancelled.
            for (const key of Object.keys(fields))
                fields[key] = null;
            --this._pending;
        });
        // The queue survives failed jobs; callers still receive their own rejection.
        this._tail = job.catch(() => {});
        return job;
    }

    _request(request) {
        return new Promise((resolve, reject) => {
            let process;
            try {
                process = Gio.Subprocess.new(['/usr/bin/python3', '-I', this.helperPath],
                    Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            } catch {
                reject(new Error('Unable to start private notes encryption.'));
                return;
            }
            const cancellable = new Gio.Cancellable();
            this._process = process;
            this._cancellable = cancellable;
            process.communicate_utf8_async(JSON.stringify(request), cancellable, (_source, result) => {
                this._process = null;
                this._cancellable = null;
                try {
                    const [, stdout] = process.communicate_utf8_finish(result);
                    if (!process.get_successful())
                        throw new Error('Helper failed');
                    resolve(JSON.parse(stdout));
                } catch {
                    reject(new Error(cancellable.is_cancelled() ? CANCELLED : 'Unable to access private notes.'));
                }
            });
        });
    }
}
