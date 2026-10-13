import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as S from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
async function capture(panel, name) {
    const directory=GLib.getenv('DAYLINE_SCREENSHOTS');GLib.mkdir_with_parents(directory,0o755);
    if (panel.editor && !panel.imagePreview) {panel.editor.text.clutter_text.set_selection(0,0);}
    await S.sleep(500);
    const [x,y]=panel.menu.actor.get_transformed_position();const [w,h]=panel.menu.actor.get_transformed_size();
    const left=Math.max(0,Math.floor(x)-12),top=Math.max(0,Math.floor(y)-8);
    const stream=Gio.File.new_for_path(`${directory}/${name}.png`).replace(null,false,Gio.FileCreateFlags.REPLACE_DESTINATION,null);
    await new Shell.Screenshot().screenshot_area(left,top,Math.min(global.stage.width-left,Math.ceil(w)+24),Math.min(global.stage.height-top,Math.ceil(h)+16),stream);stream.close(null);
}
export async function run() {
    Main.overview.hide();await S.sleep(700);
    const app=Main.extensionManager.lookup('dayline@marekbartczak.github.io').stateObj;const panel=app.panel;
    app.settings.set_string('appearance','dark');app.settings.set_string('accent','ubuntu');app.settings.set_int('opacity',100);
    const [image]=await app.images.importFiles([GLib.getenv('DAYLINE_IMAGE_FIXTURE')]);
    const text='Review the release board\n\uFFFC\nKeep the green status easy to read.\n• Check spacing on the cards\n• Confirm the keyboard flow';
    app.add('tasks',text,app.today,[{type:'bold',start:0,end:24}], [{...image,offset:25}]);
    panel.menu.open();panel.pinning.setPinned(true);
    await capture(panel,'images-task-list');
    panel.showEditor('tasks',app.store.data.tasks[0]);await capture(panel,'images-compact');
    panel.setExpanded(true,false);await capture(panel,'images-expanded');
    panel.showImage(image);await capture(panel,'images-preview');
    panel.closeImage();panel.returnToList(true);
    await Main.extensionManager.disableExtension(app.uuid);
    print('PASS: synthetic inline image README screenshots');
}
