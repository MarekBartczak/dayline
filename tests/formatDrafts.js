import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
function assert(value, message) { if (!value) throw new Error(`Format draft: ${message}`); }
function find(actor, name) {
    if (actor.accessible_name === name) return actor;
    for (const child of actor.get_children()) { const result = find(child, name); if (result) return result; }
    return null;
}
export async function run() {
    Main.overview.hide();
    await Scripting.sleep(700);
    const app = Main.extensionManager.lookup('dayline@marekbartczak.github.io').stateObj;
    const panel = app.panel;
    panel.menu.open();
    panel.composer.set_text('New task draft');
    panel.showEditor('tasks', null, {expanded: true});
    await Scripting.sleep(250);
    panel.editor.text.clutter_text.set_selection(0, 14);
    find(panel.menu.actor, 'Bold').emit('clicked', 1);
    assert(panel.editor.getFormat().some(range => range.type === 'bold'), 'New entry is formatted');
    panel.returnToList();
    panel.showEditor('tasks', null, {expanded: true});
    await Scripting.sleep(250);
    assert(panel.editor.getFormat().some(range => range.type === 'bold'), 'Back and reopen must retain a new-entry draft formatting');
    find(panel.menu.actor, 'Add entry').emit('clicked', 1);
    assert(app.store.data.tasks[0].format.some(range => range.type === 'bold'), 'Saving draft retains formatting');
    await Main.extensionManager.disableExtension('dayline@marekbartczak.github.io');
    print('PASS: new-entry formatting survives Back/reopen/save');
}
