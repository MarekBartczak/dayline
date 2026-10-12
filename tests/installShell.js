// Install over a genuinely loaded 0.1.0 extension in an isolated compositor.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};
const uuid = 'dayline@marekbartczak.github.io';
const assert = (value, message) => { if (!value) throw new Error(message); };

export async function run() {
    Main.overview.hide();
    await Scripting.sleep(800);
    const record = Main.extensionManager.lookup(uuid);
    const old = record.stateObj;
    assert(record.metadata.version === 1 && old.panel, 'Start with original 0.1.0 extension');
    const heldSettings = old.settings;
    assert(heldSettings.get_string('appearance'), 'Original appearance schema must be readable');
    old.add('tasks', 'Synthetic install regression task', old.today);
    old.panel.menu.open();
    await Scripting.sleep(200);
    const source = Gio.File.new_for_uri(GLib.getenv('DAYLINE_UPDATE_SOURCE')).get_path();
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE});
    launcher.setenv('DAYLINE_SKIP_ENABLE', '0', true);
    const subprocess = launcher.spawnv(['bash', `${source}/scripts/install.sh`]);
    const output = await new Promise((resolve, reject) => subprocess.communicate_utf8_async(null, null, (_process, result) => {
        try { resolve(subprocess.communicate_utf8_finish(result)); } catch (error) { reject(error); }
    }));
    assert(subprocess.get_successful(), `Installation failed: ${output[1]} ${output[2]}`);
    assert(heldSettings.get_string('appearance'), 'Held original schema remains readable after installing');
    for (let attempt = 0; attempt < 60 && !record.stateObj.panel; attempt++) await Scripting.sleep(50);
    assert(record.stateObj.panel, 'Installer must re-enable extension');
    record.stateObj.panel.menu.open();
    await Scripting.sleep(200);
    assert(record.stateObj.panel.counter.text === '1', 'Cached original code can open safely after installing');
    const [, pointer] = Gio.File.new_for_path(`${record.path}/current-runtime`).load_contents(null);
    const runtime = new TextDecoder().decode(pointer).trim();
    const {activateUpdate} = await import(`${GLib.getenv('DAYLINE_UPDATE_SOURCE')}/liveUpdate.js`);
    await activateUpdate(record, runtime);
    assert(record.stateObj.settings.settings_schema.has_key('appearance') && record.stateObj.settings.settings_schema.has_key('opacity'), 'Fresh runtime has complete settings');
    assert(record.stateObj.panel.counter.text === '1', 'Fresh runtime preserves stored task');
    record.stateObj.panel.menu.close();
    await Scripting.sleep(250);
    print('PASS: actual disable/install/enable over loaded v0.1, held schema preservation, safe cached popup and fresh runtime');
}
