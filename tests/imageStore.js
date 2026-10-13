import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';
import System from 'system';
import {ImageStore} from '../imageStore.js';
import {Store, dataPath} from '../store.js';
import {addTask, emptyDocument, updateTask} from '../model.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
async function rejects(operation, message) {
    let rejected = false;
    try { await operation(); } catch { rejected = true; }
    assert(rejected, message);
}
function removeTree(file) {
    if (!file.query_exists(null)) return;
    if (file.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) === Gio.FileType.DIRECTORY) {
        const children = file.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        for (let info = children.next_file(null); info; info = children.next_file(null))
            removeTree(file.get_child(info.get_name()));
        children.close(null);
    }
    file.delete(null);
}
const temporary = GLib.dir_make_tmp('dayline-image-store-XXXXXX');
const root = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
const source = Gio.File.new_for_path(`${temporary}/fixture.png`);
const pixbuf = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 48, 96);
pixbuf.fill(0x854ecaff);
pixbuf.savev(source.get_path(), 'png', [], []);
const [, bytes] = source.load_contents(null);

async function wrapperTests() {
    const images = new ImageStore(`${temporary}/images`);
    const restored = new ImageStore(`${temporary}/restored`);
    const invalid = new ImageStore(`${temporary}/invalid`, `${temporary}/missing-helper.py`);
    try {
        const [image] = await images.importBytes(new GLib.Bytes(bytes), 'image/png');
        assert(image.width === 48 && image.height === 96 && image.mime === 'image/png', 'Clipboard bytes must return decoded image metadata');
        assert(image.id === GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, bytes), 'Image ID must hash original bytes');
        const [fileImage] = await images.importFiles([source.get_path()]);
        assert(fileImage.id === image.id, 'File and clipboard imports must deduplicate original content');
        for (const variant of ['original', 'preview.png', 'thumbnail.png'])
            assert(Gio.File.new_for_path(images.path(image, variant)).query_exists(null), `Missing imported ${variant}`);
        await rejects(() => images.path({...image, id: '../escape'}), 'Unsafe asset IDs must be rejected');
        await rejects(() => images.path(image, '../original'), 'Unsafe asset variants must be rejected');
        let document = addTask(emptyDocument(), {id: 'image-task', text: '\uFFFC', date: '2026-10-13', createdAt: '2026-10-13T08:00:00.000Z'});
        document = updateTask(document, 'image-task', {images: [{...image, offset: 0}]});
        const archive = `${temporary}/portable.zip`;
        await images.exportBackup(archive, document);
        source.delete(null);
        const result = await restored.importBackup(archive);
        assert(JSON.stringify(result) === JSON.stringify(document), 'ZIP restore must return canonical task/image metadata');
        const [, original] = Gio.File.new_for_path(restored.path(image, 'original')).load_contents(null);
        assert(GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, original) === image.id, 'ZIP must restore original image bytes without its source');
        await rejects(() => invalid.importBytes(new GLib.Bytes(bytes), 'image/png'), 'Failed helper must reject');
        const cancelled = new ImageStore(`${temporary}/cancelled`);
        const pending = cancelled.importBytes(new GLib.Bytes(bytes), 'image/png');
        cancelled.dispose();
        await rejects(() => pending, 'Disposing a running image job must reject');
        await rejects(() => cancelled.importFiles([]), 'Disposed store must reject new jobs');
        assert(cancelled.jobs.size === 0, 'Disposing must release jobs');
        print('PASS: asynchronous image import, safe paths, portable ZIP roundtrip, helper failure and cancellation');
    } finally {
        images.dispose(); restored.dispose(); invalid.dispose();
    }
}

async function waitUntil(predicate) {
    const deadline = GLib.get_monotonic_time() + 10_000_000;
    while (!predicate()) {
        if (GLib.get_monotonic_time() > deadline) throw new Error('Timed out waiting for preferences operation');
        await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
            resolve(); return GLib.SOURCE_REMOVE;
        }));
    }
}
async function preferencesTests() {
    // GLib caches XDG paths during GI initialization. The parent must set these
    // before launching this process; changing the environment here is unsafe.
    const isolation = GLib.getenv('DAYLINE_IMAGE_TEST_ROOT');
    assert(isolation && GLib.path_get_basename(isolation).startsWith('dayline-image-store-') &&
        GLib.path_get_dirname(isolation) === GLib.get_tmp_dir(), 'Refusing preferences test: missing temporary subprocess environment');
    assert(GLib.getenv('XDG_DATA_HOME') === `${isolation}/preferences-data` &&
        GLib.getenv('XDG_CONFIG_HOME') === `${isolation}/preferences-config` &&
        GLib.getenv('GSETTINGS_BACKEND') === 'memory', 'Refusing preferences test: data, config or settings are not isolated');
    assert(dataPath() === `${isolation}/preferences-data/dayline/data.json`, 'Refusing preferences test: resolved task data is outside its temporary directory');
    assert(new ImageStore().directory === `${isolation}/preferences-data/dayline/attachments`, 'Refusing preferences test: resolved images are outside its temporary directory');
    if (ARGV.includes('--check-isolation')) {
        print('PASS: preferences data and images resolve to temporary paths');
        return;
    }
    const Gtk = (await import('gi://Gtk?version=4.0')).default;
    const Adw = (await import('gi://Adw?version=1')).default;
    Gtk.init(); Adw.init();
    Gio.resources_register(Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource'));
    const {default: Preferences} = await import('../prefs.js');
    const schemaDirectory = `${temporary}/schemas`;
    GLib.mkdir_with_parents(schemaDirectory, 0o700);
    const [, , error, status] = GLib.spawn_sync(null, ['glib-compile-schemas', '--strict', '--targetdir', schemaDirectory, root.get_child('schemas').get_path()], null, GLib.SpawnFlags.SEARCH_PATH, null);
    assert(status === 0, new TextDecoder().decode(error));
    const [, metadataBytes] = root.get_child('metadata.json').load_contents(null);
    const metadata = {...JSON.parse(new TextDecoder().decode(metadataBytes)), path: root.get_path(), dir: Gio.File.new_for_path(temporary)};
    const publicImages = new ImageStore();
    const [image] = await publicImages.importBytes(new GLib.Bytes(bytes), 'image/png');
    publicImages.dispose();
    let original = addTask(emptyDocument(), {id: 'current', text: 'Keep until confirmed', date: '2026-10-13', createdAt: '2026-10-13T08:00:00.000Z'});
    original = updateTask(original, 'current', {text: '\uFFFC\nKeep until confirmed', images: [{...image, offset: 0}]});
    const store = new Store(); store.save(original);
    let picker, selection, confirmation, errors = 0;
    const patched = [];
    const replace = (prototype, name, implementation) => {
        patched.push([prototype, name, prototype[name]]);
        prototype[name] = implementation;
    };
    replace(Gtk.FileDialog.prototype, 'save', function (_window, _cancel, callback) {
        picker = this; selection = file => callback({save_finish: () => file}, null);
    });
    replace(Gtk.FileDialog.prototype, 'open', function (_window, _cancel, callback) {
        picker = this; selection = file => callback({open_finish: () => file}, null);
    });
    replace(Adw.AlertDialog.prototype, 'choose', function (_window, _cancel, callback) {
        confirmation = {dialog: this, respond: response => callback({choose_finish: () => response}, null)};
    });
    replace(Adw.AlertDialog.prototype, 'present', function () { errors++; });
    const window = new Adw.PreferencesWindow();
    try {
        new Preferences(metadata).fillPreferencesWindow(window);
        window.present();
        const descendants = widget => {
            const found = [widget];
            for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) found.push(...descendants(child));
            return found;
        };
        const row = title => descendants(window).find(widget => widget instanceof Adw.PreferencesRow && widget.title === title);
        row('Export backup').emit('activated');
        assert(picker.initial_name.endsWith('.zip'), 'Preferences export must default to a portable ZIP');
        assert(picker.filters.get_n_items() === 1 && picker.filters.get_item(0).name.includes('.zip'), 'Export must offer only the ZIP filter');
        const exportFile = Gio.File.new_for_path(`${temporary}/preferences.zip`);
        selection(exportFile);
        await waitUntil(() => exportFile.query_exists(null) || errors);
        assert(!errors && exportFile.query_exists(null), 'Preferences must export via asynchronous ZIP worker');
        const exportedImages = new ImageStore(`${temporary}/exported-images`);
        try {
            const exported = await exportedImages.importBackup(exportFile.get_path());
            assert(JSON.stringify(exported) === JSON.stringify(original), 'Preferences ZIP must include its task images');
            assert(Gio.File.new_for_path(exportedImages.path(image, 'original')).query_exists(null), 'Preferences ZIP must carry original image bytes');
        } finally { exportedImages.dispose(); }

        const restored = addTask(emptyDocument(), {id: 'replacement', text: 'Restored task', date: '2026-10-13', createdAt: '2026-10-13T08:00:00.000Z'});
        const archives = new ImageStore(`${temporary}/empty-images`);
        const zip = `${temporary}/replacement.zip`;
        await archives.exportBackup(zip, restored); archives.dispose();
        row('Import or restore backup').emit('activated');
        assert(picker.filters.get_n_items() === 2, 'Import must offer ZIP and legacy JSON filters');
        selection(Gio.File.new_for_path(zip));
        await waitUntil(() => confirmation || errors);
        assert(!errors && confirmation, 'Valid ZIP must present restore confirmation');
        assert(new Store().data.tasks[0].id === 'current', 'Loading ZIP must preserve current list before confirmation');
        confirmation.respond('cancel'); confirmation = null;
        assert(new Store().data.tasks[0].id === 'current', 'Cancelling ZIP restore must preserve current list');
        row('Import or restore backup').emit('activated'); selection(Gio.File.new_for_path(zip));
        await waitUntil(() => confirmation);
        confirmation.respond('restore'); confirmation = null;
        assert(new Store().data.tasks[0].id === 'replacement', 'Confirmed ZIP must replace current list');
        assert(new Store(`${store.file.get_path()}.bak`).data.tasks[0].id === 'current', 'Confirmed restore must preserve prior data');

        const legacy = Gio.File.new_for_path(`${temporary}/legacy.json`);
        const legacyDocument = {version: 1, tasks: [{id: 'legacy', text: 'Legacy task', date: '2026-10-13', done: false, createdAt: '2026-10-13T08:00:00.000Z'}], notes: []};
        legacy.replace_contents(JSON.stringify(legacyDocument), null, false, Gio.FileCreateFlags.PRIVATE, null);
        row('Import or restore backup').emit('activated'); selection(legacy);
        await waitUntil(() => confirmation);
        confirmation.respond('restore'); confirmation = null;
        assert(new Store().data.tasks[0].id === 'legacy' && new Store().data.version === 3, 'Legacy v1 JSON backup must remain importable and migrate');

        row('Import or restore backup').emit('activated'); selection(Gio.File.new_for_path(zip));
        await waitUntil(() => confirmation);
        const lateConfirmation = confirmation; confirmation = null;
        let rejectPending, disposed = false;
        replace(ImageStore.prototype, 'importBackup', () => new Promise((_resolve, reject) => { rejectPending = reject; }));
        const originalDispose = ImageStore.prototype.dispose;
        replace(ImageStore.prototype, 'dispose', function () { disposed = true; originalDispose.call(this); });
        row('Import or restore backup').emit('activated'); selection(Gio.File.new_for_path(zip));
        assert(rejectPending, 'ZIP import must use the image store');
        window.close();
        assert(disposed, 'Closing preferences must dispose image jobs');
        lateConfirmation.respond('restore');
        assert(new Store().data.tasks[0].id === 'legacy', 'Closed preferences must ignore late restore confirmation');
        rejectPending(new Error('Cancelled test operation'));
        await new Promise(resolve => GLib.idle_add(GLib.PRIORITY_DEFAULT, () => { resolve(); return GLib.SOURCE_REMOVE; }));
        assert(errors === 0 && confirmation === null, 'Closed preferences must not show late errors or confirmations');
        print('PASS: ZIP preferences export, confirmed restore, legacy JSON, preserved backup and closed-window cancellation');
    } finally {
        window.close();
        for (const [prototype, name, originalMethod] of patched.reverse()) prototype[name] = originalMethod;
    }
}

function isolatedPreferencesTests() {
    const launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.NONE);
    launcher.setenv('DAYLINE_IMAGE_TEST_ROOT', temporary, true);
    launcher.setenv('XDG_DATA_HOME', `${temporary}/preferences-data`, true);
    launcher.setenv('XDG_CONFIG_HOME', `${temporary}/preferences-config`, true);
    launcher.setenv('GSETTINGS_BACKEND', 'memory', true);
    launcher.setenv('GIO_USE_VFS', 'local', true);
    const args = ['/usr/bin/gjs', '-m', Gio.File.new_for_uri(import.meta.url).get_path(), '--preferences-child'];
    if (ARGV.includes('--check-isolation')) args.push('--check-isolation');
    const process = launcher.spawnv(args);
    return new Promise((resolve, reject) => process.wait_check_async(null, (source, result) => {
        try { source.wait_check_finish(result); resolve(); } catch (error) { reject(error); }
    }));
}

const loop = GLib.MainLoop.new(null, false);
let failed = false;
GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    (ARGV.includes('--preferences-child') ? preferencesTests() :
        ARGV.includes('--preferences') ? isolatedPreferencesTests() : wrapperTests()).catch(error => {
        failed = true; printerr(`FAIL: ${error.message}\n${error.stack}`);
    }).finally(() => loop.quit());
    return GLib.SOURCE_REMOVE;
});
try { loop.run(); } finally { removeTree(Gio.File.new_for_path(temporary)); }
if (failed) System.exit(1);
