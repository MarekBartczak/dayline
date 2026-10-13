import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as S from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
function assert(condition,message){if(!condition)throw new Error(message);}
export async function run(){
 Main.overview.hide();await S.sleep(700);
 const record=Main.extensionManager.lookup('dayline@marekbartczak.github.io');const old=record.stateObj;
 assert(record.metadata.version===9,'Start with v0.3.1');
 old.add('tasks','Synthetic task before image update',old.today);old.panel.menu.open();old.panel.pinning.setPinned(true);old.panel.composer.set_text('Unsubmitted composer');
 old.panel.openDetails('tasks',old.store.data.tasks[0]);old.panel.editor.text.set_text('Unsaved editor text');await S.sleep(250);
 const [,before]=old.store.file.load_contents(null);
 const {update}=await import(Gio.File.new_for_path(`${GLib.getenv('DAYLINE_UPGRADE_SOURCE')}/scripts/safe-update.mjs`).get_uri());
 const result=await update(GLib.getenv('DAYLINE_UPGRADE_SOURCE'));
 assert(record.metadata.version===10&&record.stateObj!==old&&record.stateObj.panel,'Fresh v0.4.0 active');
 assert(record.stateObj.panel.pinning.pinned,'Pin restored');assert(record.stateObj.panel.composer.get_text()==='Unsubmitted composer','Composer restored');
 assert(record.stateObj.panel.editor.text.get_text()==='Unsaved editor text','Unsaved editor restored');
 const [,after]=record.stateObj.store.file.load_contents(null);assert(new TextDecoder().decode(before)===new TextDecoder().decode(after),'Installation preserves original bytes');
 record.stateObj.panel.returnToList();await Main.extensionManager.disableExtension(record.uuid);
 print('PASS: safe disable/install/verify/fresh-enable with task bytes, composer, editor drafts and pin preserved; '+result);
}
