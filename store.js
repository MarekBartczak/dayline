import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {emptyDocument, validateDocument} from './model.js';

const decoder = new TextDecoder();
const LIMIT = 32 * 1024 * 1024;

export function dataPath() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'dayline', 'data.json']);
}

export function readDocument(file) {
    if (file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null).get_size() > LIMIT)
        throw new Error('Plik jest za duży (maksymalnie 32 MB).');
    const [, bytes] = file.load_contents(null);
    return validateDocument(JSON.parse(decoder.decode(bytes)));
}

function serializeDocument(document) {
    const contents = JSON.stringify(validateDocument(document), null, 2) + '\n';
    if (new TextEncoder().encode(contents).byteLength > LIMIT)
        throw new Error('Dane są za duże (maksymalnie 32 MB). Zmniejsz liczbę lub długość wpisów.');
    return contents;
}

export function writeDocument(file, document) {
    const contents = serializeDocument(document);
    file.replace_contents(contents, null, false, Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

export class Store {
    constructor(path = dataPath()) {
        this.file = Gio.File.new_for_path(path);
        this.data = emptyDocument();
        this.error = null;
        this.reload();
    }

    reload() {
        try {
            this.data = readDocument(this.file);
            this.error = null;
        } catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                this.data = emptyDocument();
                this.error = null;
            } else {
                this.error = `Nie można odczytać danych. Oryginał zachowano. ${error.message}`;
            }
        }
        return this.data;
    }

    save(document) {
        if (this.error)
            throw new Error(this.error);
        const validated = validateDocument(document);
        serializeDocument(validated);
        const parent = this.file.get_parent().get_path();
        if (GLib.mkdir_with_parents(parent, 0o700) !== 0)
            throw new Error('Nie można utworzyć katalogu danych.');
        // Keep the prior on-disk document, including changes made by preferences.
        if (this.file.query_exists(null)) {
            const previous = readDocument(this.file);
            writeDocument(Gio.File.new_for_path(`${this.file.get_path()}.bak`), previous);
        }
        writeDocument(this.file, validated);
        this.data = validated;
        return this.data;
    }

    restore(document) {
        const validated = validateDocument(document);
        serializeDocument(validated);
        if (GLib.mkdir_with_parents(this.file.get_parent().get_path(), 0o700) !== 0)
            throw new Error('Nie można utworzyć katalogu danych.');
        if (this.file.query_exists(null)) {
            if (this.error) {
                this.file.copy(Gio.File.new_for_path(`${this.file.get_path()}.corrupt`), Gio.FileCopyFlags.OVERWRITE, null, null);
            } else {
                writeDocument(Gio.File.new_for_path(`${this.file.get_path()}.bak`), readDocument(this.file));
            }
        }
        writeDocument(this.file, validated);
        this.data = validated;
        this.error = null;
        return this.data;
    }
}
