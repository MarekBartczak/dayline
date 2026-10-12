import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';

// Looking Glass can import this new module even when the old extension modules
// are cached. Each runtime snapshot has fresh module URLs and its own schema.
export async function activateUpdate(record, directory = null) {
    if (!record?.stateObj?.panel) throw new Error('Enable Dayline before updating it.');
    const old = record.stateObj;
    if (old.panel.editor) throw new Error('Save or cancel the current edit, then run the update again.');
    if (old.panel.privateNotes?.pending || old.panel.privateNotes?.closing) throw new Error('Wait for private notes to finish saving, then run the update again.');
    if (!directory) {
        const pointer = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', record.uuid, 'current-runtime']));
        const [, bytes] = pointer.load_contents(null);
        directory = new TextDecoder().decode(bytes).trim();
    }
    const dir = Gio.File.new_for_path(directory);
    const [, bytes] = dir.get_child('metadata.json').load_contents(null);
    const metadata = {...JSON.parse(new TextDecoder().decode(bytes)), dir, path: directory};
    if (metadata.uuid !== record.uuid || metadata.version < 2) throw new Error('This is not a Dayline update.');
    const {default: UpdatedExtension} = await import(dir.get_child('extension.js').get_uri());
    const replacement = new UpdatedExtension(metadata);
    const previous = {stateObj: old, metadata: record.metadata, dir: record.dir, path: record.path, errors: [...(record.errors ?? [])], error: record.error};
    const view = {tab: old.panel.tab, date: old.panel.selectedDate, draft: old.panel.composer.get_text(), drafts: new Map(old.panel.drafts), pinned: old.panel.pinning?.pinned ?? false, open: old.panel.menu.isOpen};
    const manager = Main.extensionManager;
    old.panel.menu.close(BoxPointer.PopupAnimation.NONE);
    Main.layoutManager.panelBox.get_allocation_box();
    await manager._callExtensionDisable(record.uuid);
    try {
        Object.assign(record, {stateObj: replacement, metadata, dir, path: directory});
        await manager._callExtensionEnable(record.uuid);
        if (record.state !== ExtensionState.ACTIVE || !replacement.panel)
            throw new Error(record.error || 'Unable to enable the updated panel.');
        const panel = replacement.panel;
        panel.tab = view.tab;
        panel.selectedDate = view.date;
        panel.drafts = view.drafts;
        panel.composer.set_text(view.draft);
        panel.refresh();
        if (view.pinned) panel.pinning.setPinned(true);
        if (view.open) panel.menu.open();
        return 'Dayline updated. Your tasks and drafts are preserved.';
    } catch (error) {
        if (record.state === ExtensionState.ACTIVE) await manager._callExtensionDisable(record.uuid);
        else {
            try { replacement.disable(); } catch { /* clean up partial enable */ }
        }
        Object.assign(record, previous, {state: ExtensionState.INACTIVE});
        await manager._callExtensionEnable(record.uuid);
        if (old.panel) {
            old.panel.tab = view.tab;
            old.panel.selectedDate = view.date;
            old.panel.drafts = view.drafts;
            old.panel.composer.set_text(view.draft);
            old.panel.refresh();
            if (view.pinned) old.panel.pinning?.setPinned(true);
            if (view.open) old.panel.menu.open();
        }
        throw error;
    }
}
