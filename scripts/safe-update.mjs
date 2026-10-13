import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

export async function update(sourceDirectory = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_path()) {
    const record = Main.extensionManager.lookup('dayline@marekbartczak.github.io');
    const old = record?.stateObj;
    const panel = old?.panel;
    if (!panel || record.state !== ExtensionState.ACTIVE) throw new Error('Keep the current Dayline running until this update starts.');
    if (old.store.error) throw new Error('Recover the current tasks before updating.');
    if (panel.privateNotes?.pending || panel.privateNotes?.closing || panel.editor?.kind === 'private')
        throw new Error('Save and close Private before updating.');
    const view = {tab: panel.tab, date: panel.selectedDate, composer: panel.composer.get_text(), drafts: [...panel.drafts], entries: [...panel.entryDrafts], pinned: panel.pinning.pinned, open: panel.menu.isOpen, expanded: panel.expanded};
    let edit = null;
    if (panel.editor) {
        const current = panel.editor;
        edit = {kind: current.kind, item: current.item, text: current.text.get_text(), date: current.date?.get_text(), format: current.getFormat()};
        if (current.kind === 'tasks' && current.getImages) edit.images = current.getImages();
        const key = current.item ? `${current.kind}/${current.item.id}` : current.newDraftKey ?? panel.newEntryKey(current.kind);
        view.entries = view.entries.filter(([existing]) => existing !== key);
        view.entries.push([key, {text: edit.text, date: edit.date, format: edit.format, ...(edit.images ? {images: edit.images} : {})}]);
        if (!current.item) view.composer = edit.text;
    }
    const backup = old.store.file.get_parent().get_child(`pre-update-${Date.now()}`);
    GLib.mkdir_with_parents(backup.get_path(), 0o700);
    if (old.store.file.query_exists(null)) old.store.file.copy(backup.get_child('data.json'), Gio.FileCopyFlags.NONE, null, null);
    else backup.get_child('data.json').replace_contents(JSON.stringify(old.store.data, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
    backup.get_child('public-session.json').replace_contents(JSON.stringify({view, edit}, null, 2), null, false, Gio.FileCreateFlags.PRIVATE, null);
    await Main.extensionManager._callExtensionDisable(record.uuid);
    Main.extensionManager.disableExtension(record.uuid);
    if (record.state !== ExtensionState.INACTIVE || old.panel) throw new Error('Dayline did not stop; installed files were not changed.');
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE});
    launcher.setenv('DAYLINE_SKIP_ENABLE', '1', true);
    const process = launcher.spawnv(['bash', `${sourceDirectory}/scripts/install.sh`]);
    await new Promise((resolve, reject) => process.communicate_utf8_async(null, null, (_process, result) => {
        try { const [,stdout,stderr] = process.communicate_utf8_finish(result);if (!process.get_successful()) throw new Error(stderr || stdout || 'Installation failed.');resolve(); }
        catch (error) {reject(error);}
    }));
    const pointer = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', record.uuid, 'current-runtime']));
    const [, bytes] = pointer.load_contents(null);
    const directory = new TextDecoder().decode(bytes).trim();
    const runtime = Gio.File.new_for_path(directory);
    const installed = pointer.get_parent();
    function verifyFiles(source, destination) {
        const files = source.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        for (let info = files.next_file(null); info; info = files.next_file(null)) {
            const left = source.get_child(info.get_name()), right = destination.get_child(info.get_name());
            if (info.get_file_type() === Gio.FileType.DIRECTORY) verifyFiles(left, right);
            else {
                const [, a] = left.load_contents(null), [, b] = right.load_contents(null);
                if (GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, a) !== GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, b))
                    throw new Error('Installed files did not match the verified runtime. Dayline remains disabled.');
            }
        }
        files.close(null);
    }
    verifyFiles(runtime, installed);
    const {activateUpdate} = await import(Gio.File.new_for_path(`${directory}/liveUpdate.js`).get_uri());
    await activateUpdate(record, directory);
    const fresh = record.stateObj.panel;
    fresh.tab = view.tab;fresh.selectedDate = view.date;fresh.drafts = new Map(view.drafts);fresh.entryDrafts = new Map(view.entries);fresh.composer.set_text(view.composer);fresh.refresh();
    if (view.pinned) fresh.pinning.setPinned(true);
    if (view.open) fresh.menu.open();
    if (edit) fresh.showEditor(edit.kind, edit.item, {expanded: view.expanded});
    return `Dayline ${record.metadata['version-name']} ACTIVE. ${record.stateObj.store.data.tasks.length} tasks preserved; drafts restored. Backup: ${backup.get_path()}`;
}
