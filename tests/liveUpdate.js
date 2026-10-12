import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};

export async function run() {
    Main.overview.hide();
    await Scripting.sleep(1000);
    const record = Main.extensionManager.lookup('dayline@marekbartczak.github.io');
    const old = record.stateObj;
    if (record.metadata.version !== 1) throw new Error('Update test must start with original 0.1.0 archive');
    old.add('tasks', 'Original task with Polish text: migracje', old.today);
    old.panel.menu.open();
    old.panel.composer.set_text('Unsubmitted composer draft');
    const oldTask = old.store.data.tasks[0];
    old.panel.showEditor('tasks', oldTask);
    old.panel.editor.text.set_text('An unsaved edit');
    const {activateUpdate} = await import(`${GLib.getenv('DAYLINE_UPDATE_SOURCE')}/liveUpdate.js`);
    let rejected = false;
    try { await activateUpdate(record, GLib.getenv('DAYLINE_UPDATE_RUNTIME')); } catch { rejected = true; }
    if (!rejected || record.stateObj !== old || !old.panel.editor) throw new Error('Active unsaved editor must block update');
    old.panel.editor = null;
    old.panel.refresh();
    await activateUpdate(record, GLib.getenv('DAYLINE_UPDATE_RUNTIME'));
    const app = record.stateObj;
    if (app === old || !app.panel.pinning || app.store.data.version !== 2) throw new Error('Fresh v0.2 runtime must replace old module cache');
    if (app.panel.composer.get_text() !== 'Unsubmitted composer draft') throw new Error('Composer draft lost during update');
    if (app.store.data.tasks[0].text !== oldTask.text || app.store.data.tasks[0].id !== oldTask.id) throw new Error('User data changed during update');
    app.start(oldTask.id);
    if (app.panel.inProgressCounter.text !== '▶ 1') throw new Error('Updated runtime lacks new task status');
    app.panel.pinning.setPinned(true);
    const entry = app.store.data.tasks[0];
    app.panel.openDetails('tasks', entry);
    app.panel.details.editor.text.set_text('Unfinished detached-window draft');
    let detailGuard = false;
    try { await activateUpdate(record, GLib.getenv('DAYLINE_UPDATE_RUNTIME')); } catch { detailGuard = true; }
    if (!detailGuard || !app.panel.details || app.panel.details.editor.text.get_text() !== 'Unfinished detached-window draft') throw new Error('Detached edit must block a live update without losing text');
    app.panel.details.close();
    const draftKey = `tasks/${entry.id}`;
    const failing = GLib.dir_make_tmp('dayline-failing-runtime-XXXXXX');
    const failingDir = Gio.File.new_for_path(failing);
    failingDir.get_child('metadata.json').replace_contents(JSON.stringify({uuid: record.uuid, name: 'Dayline', version: 2, 'shell-version': ['50']}), null, false, Gio.FileCreateFlags.PRIVATE, null);
    failingDir.get_child('extension.js').replace_contents('export default class FailingExtension { enable() { throw new Error("Expected rollback test failure"); } disable() {} }', null, false, Gio.FileCreateFlags.PRIVATE, null);
    let rolledBack = false;
    try { await activateUpdate(record, failing); } catch { rolledBack = true; }
    if (!rolledBack || record.stateObj !== app || !app.panel.pinning.pinned || !app.panel.menu.isOpen || app.panel.composer.get_text() !== 'Unsubmitted composer draft')
        throw new Error('Failed update must restore the prior instance, view, pin and composer draft');
    if (app.panel.entryDrafts.get(draftKey)?.text !== 'Unfinished detached-window draft') throw new Error('Failed update must preserve detached drafts');
    for (const name of ['metadata.json', 'extension.js']) failingDir.get_child(name).delete(null);
    failingDir.delete(null);
    await Scripting.sleep(200);
    app.panel.menu.close();
    await Scripting.sleep(200);
    await activateUpdate(record, GLib.getenv('DAYLINE_UPDATE_RUNTIME'));
    if (record.stateObj.panel.entryDrafts.get(draftKey)?.text !== 'Unfinished detached-window draft') throw new Error('Successful update must preserve detached drafts');
    const settings = record.stateObj.settings;
    await Main.extensionManager.disableExtension(record.uuid);
    if (record.stateObj.panel) throw new Error('Inactive update test must begin with disabled extension');
    await activateUpdate(record, GLib.getenv('DAYLINE_UPDATE_RUNTIME'));
    if (!record.stateObj.panel || !settings.get_string('appearance') || !global.settings.get_strv('enabled-extensions').includes(record.uuid)) throw new Error('Update must directly enable a fresh runtime from a disabled extension and persist enabled state');
    await Scripting.sleep(200);
    print('PASS: live update from original 0.1.0, inline/detached guards, draft preservation, rollback and direct inactive activation');
}
