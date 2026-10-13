import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as S from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
function assert(value, message) { if (!value) throw new Error(`Task images: ${message}`); }
function find(actor, name) {
    if (!actor.visible) return null;
    if (actor.accessible_name === name) return actor;
    for (const child of actor.get_children()) { const found = find(child, name); if (found) return found; }
    return null;
}
async function click(actor) {
    assert(actor, 'Control exists');
    const [x,y]=actor.get_transformed_position();const [w,h]=actor.get_transformed_size();
    const pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    pointer.notify_absolute_motion(GLib.get_monotonic_time(),x+w/2,y+h/2);await S.sleep(40);
    pointer.notify_button(GLib.get_monotonic_time(),1,Clutter.ButtonState.PRESSED);
    pointer.notify_button(GLib.get_monotonic_time(),1,Clutter.ButtonState.RELEASED);await S.sleep(250);
}
async function paste() {
    const keyboard=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const t=GLib.get_monotonic_time();
    keyboard.notify_keyval(t,Clutter.KEY_Control_L,Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(t+1,Clutter.KEY_v,Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(t+2,Clutter.KEY_v,Clutter.KeyState.RELEASED);
    keyboard.notify_keyval(t+3,Clutter.KEY_Control_L,Clutter.KeyState.RELEASED);
    await S.sleep(1000);
}
async function key(symbol, control = false) {
    const keyboard=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time=GLib.get_monotonic_time();
    if (control) keyboard.notify_keyval(time,Clutter.KEY_Control_L,Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time+1,symbol,Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time+2,symbol,Clutter.KeyState.RELEASED);
    if (control) keyboard.notify_keyval(time+3,Clutter.KEY_Control_L,Clutter.KeyState.RELEASED);
    await S.sleep(200);
}
export async function run() {
    Main.overview.hide();
    const initialPointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    initialPointer.notify_absolute_motion(GLib.get_monotonic_time(),640,650);await S.sleep(600);
    const app=Main.extensionManager.lookup('dayline@marekbartczak.github.io').stateObj;
    app.add('tasks','Before\nAfter',app.today,[{type:'bold',start:0,end:6}]);
    const panel=app.panel;panel.menu.open();panel.pinning.setPinned(GLib.getenv('DAYLINE_TEST_PINNED') !== '0');panel.openDetails('tasks',app.store.data.tasks[0]);await S.sleep(400);
    assert(find(panel.menu.actor,'Insert images'), 'Native image file button exists');
    const pix=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,false,8,1000,1600);pix.fill(0x8959caff);
    const [,bytes]=pix.save_to_bufferv('png',[],[]);
    panel.editor.text.clutter_text.set_selection(7,7);
    St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD,'image/png',new GLib.Bytes(bytes));await paste();
    assert(panel.editor.text.get_text()==='Before\n\uFFFC\nAfter', 'Clipboard image inserted between paragraphs');
    assert(panel.editor.getImages().length===1,'Attachment belongs to the task draft');
    const image=panel.editor.getImages()[0];
    const preview=find(panel.menu.actor,`View image: ${image.name}`);
    assert(preview&&preview.width>panel.editor.text.width*0.8,'Inline image fills editor width');
    const [, ,afterY]=panel.editor.text.clutter_text.position_to_coords(9);
    assert(afterY>150, 'Image reserves space and text stays underneath');
    await click(preview);
    assert(panel.imagePreview&&find(panel.menu.actor,'Back to task'),'Click enlarges in the same panel');
    assert(panel.pinning.pinned === (GLib.getenv('DAYLINE_TEST_PINNED') !== '0'),'Preview preserves pin');
    await click(find(panel.menu.actor,'Back to task'));
    assert(panel.editor.getImages().length===1,'Back restores unsaved editor');
    panel.editor.text.grab_key_focus();panel.editor.text.clutter_text.set_selection(-1,-1);
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD,' ordinary paste');await paste();
    assert(panel.editor.text.get_text().endsWith('After ordinary paste'),'Text paste remains native');
    await click(find(panel.menu.actor,'Save changes'));
    assert(app.store.data.tasks[0].images.length===1&&app.store.data.tasks[0].format[0].type==='bold','Save persists image and formatting');
    const card=find(panel.menu.actor,`View image: ${image.name}`);
    assert(card&&card.width>panel.body.width*0.85,'Task card image spans the card');
    panel.openDetails('tasks',app.store.data.tasks[0]);await S.sleep(350);
    await click(find(panel.menu.actor,`Remove image: ${image.name}`));
    assert(panel.editor.getImages().length===0&&!panel.editor.text.get_text().includes('\uFFFC'),'Remove deletes only the image block');
    await click(find(panel.menu.actor,'Save changes'));
    assert(app.store.data.tasks[0].text.includes('Before')&&app.store.data.tasks[0].text.includes('After'),'Removal preserves surrounding paragraphs');
    const source = GLib.build_filenamev([GLib.get_user_data_dir(), 'selected-image.png']);
    pix.savev(source, 'png', [], []);
    panel.openDetails('tasks', app.store.data.tasks[0]);await S.sleep(300);
    panel.editor.text.clutter_text.set_selection(-1,-1);
    await click(find(panel.menu.actor,'Insert images'));
    await S.sleep(800);
    assert(global.get_window_actors().some(actor => actor.meta_window.get_title()?.includes('Insert images')), 'Real native file picker opens');
    await key(Clutter.KEY_l,true);
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD,source);await paste();
    await key(Clutter.KEY_Return);await S.sleep(500);await key(Clutter.KEY_Return);await S.sleep(800);
    assert(panel.editor.getImages().length===1,'Real native file picker imports at the caret');
    const selected = panel.editor.getImages()[0];
    assert(panel.editor.text.get_text().endsWith('\uFFFC\n'),'End insertion provides a paragraph below image');
    panel.returnToList();panel.openDetails('tasks',app.store.data.tasks[0]);await S.sleep(300);
    assert(panel.editor.getImages()[0].id===selected.id,'Back/reopen restores image draft');
    await click(find(panel.menu.actor,'Save changes'));
    app.remove('tasks', app.store.data.tasks[0].id);app.undoDelete();
    assert(app.store.data.tasks[0].images[0].id===selected.id,'Deletion Undo retains image');
    panel.openDetails('tasks',app.store.data.tasks[0]);await S.sleep(350);
    const uri = Gio.File.new_for_path(source).get_uri();
    St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD,'x-special/gnome-copied-files',new GLib.Bytes(new TextEncoder().encode(`copy\n${uri}`)));
    panel.editor.text.clutter_text.set_selection(-1,-1);await paste();
    assert(panel.editor.getImages().length===2,'Copied local image pastes at the cursor');
    panel.returnToList(true);
    panel.selectTab('notes');panel.showEditor('notes',null,{expanded:true});await S.sleep(200);
    assert(!find(panel.menu.actor,'Insert images'),'Notes do not expose public image storage');
    await Main.extensionManager.disableExtension(app.uuid);
    print('PASS: native inline clipboard image, full width, preview/back, pin, text paste, persistence and removal');
}
