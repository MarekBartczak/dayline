import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {validateDocument} from './model.js';

export class ImageStore {
    constructor(directory = GLib.build_filenamev([GLib.get_user_data_dir(), 'dayline', 'attachments']), helper = null) {
        this.directory = directory;
        this.helper = helper ?? Gio.File.new_for_uri(import.meta.url).get_parent().get_child('image_worker.py').get_path();
        this.jobs = new Set();
        this.disposed = false;
    }
    path(image, variant = 'thumbnail.png') {
        if (!/^[a-f0-9]{64}$/.test(image.id) || !['thumbnail.png', 'preview.png', 'original'].includes(variant))
            throw new Error('Invalid image reference.');
        return GLib.build_filenamev([this.directory, image.id, variant]);
    }
    importFiles(files) { return this.request({operation: 'import', files}).then(result => result.images); }
    importBytes(bytes, mime) {
        const data = bytes instanceof GLib.Bytes ? bytes.get_data() : bytes;
        if (data.length > 25 * 1024 * 1024) return Promise.reject(new Error('Images must be no larger than 25 MiB.'));
        return this.request({operation: 'import', bytes: GLib.base64_encode(data), name: `Clipboard image.${mime.split('/')[1] ?? 'png'}`}).then(result => result.images);
    }
    chooseFiles() { return this.request({operation: 'choose'}).then(result => result.files); }
    exportBackup(path, document) { return this.request({operation: 'export', path, document: validateDocument(document)}); }
    importBackup(path) { return this.request({operation: 'restore', path}).then(result => validateDocument(result.document)); }
    dispose() {
        this.disposed = true;
        for (const job of this.jobs) { job.cancellable.cancel(); job.process.force_exit(); }
        this.jobs.clear();
    }
    request(fields) {
        if (this.disposed) return Promise.reject(new Error('Image operation was cancelled.'));
        return new Promise((resolve, reject) => {
            let process;
            try {
                process = Gio.Subprocess.new(['/usr/bin/python3', '-I', this.helper],
                    Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            } catch { reject(new Error('Unable to start the image helper.')); return; }
            const job = {process, cancellable: new Gio.Cancellable()};
            this.jobs.add(job);
            process.communicate_utf8_async(JSON.stringify({directory: this.directory, ...fields}), job.cancellable, (_source, result) => {
                this.jobs.delete(job);
                try {
                    const [, stdout] = process.communicate_utf8_finish(result);
                    if (this.disposed || job.cancellable.is_cancelled()) throw new Error('Image operation was cancelled.');
                    if (!process.get_successful()) throw new Error('Unable to read this image.');
                    const response = JSON.parse(stdout);
                    if (!response.ok) throw new Error(response.error ?? 'Unable to read this image.');
                    resolve(response);
                } catch (error) { reject(error); }
            });
        });
    }
}
