import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as S from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
function assert(condition,message){if(!condition)throw new Error(`Editor hit area: ${message}`);}
async function click(x,y){
 const pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
 pointer.notify_absolute_motion(GLib.get_monotonic_time(),x,y);await S.sleep(40);
 print(`Blank click target: ${global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,x,y)?.toString()}`);
 pointer.notify_button(GLib.get_monotonic_time(),1,Clutter.ButtonState.PRESSED);
 pointer.notify_button(GLib.get_monotonic_time(),1,Clutter.ButtonState.RELEASED);await S.sleep(150);
}
function caret(ct){return ct.cursor_position<0?Array.from(ct.text).length:ct.cursor_position;}
export async function run(){
 Main.overview.hide();const pointer=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
 pointer.notify_absolute_motion(GLib.get_monotonic_time(),640,650);await S.sleep(600);
 const app=Main.extensionManager.lookup('dayline@marekbartczak.github.io').stateObj;const panel=app.panel;
 const value='One 😀 line';const length=Array.from(value).length;
 app.add('tasks',value,app.today);panel.menu.open();panel.pinning.setPinned(GLib.getenv('DAYLINE_TEST_PINNED')!=='0');panel.showEditor('tasks',app.store.data.tasks[0]);await S.sleep(350);
 const entry=panel.editor.text,ct=entry.clutter_text;
 const field=panel.editor.root.get_children().find(actor=>actor.has_style_class_name?.('dayline-editor-field'));
 for(const expanded of [false,true]){
  entry.set_text(value);
  panel.setExpanded(expanded,false);await S.sleep(250);
  const [x,y]=field.get_transformed_position(),[w,h]=field.get_transformed_size();
  const [tx,ty]=ct.get_transformed_position();const [,endX,endY,lineH]=ct.position_to_coords(-1);
  print('Field geometry '+JSON.stringify({expanded,x,y,w,h,tx,ty,ctWidth:ct.width,ctHeight:ct.height,entryHeight:entry.height,reactive:field.reactive,entryReactive:entry.reactive}));
  for(const [name,px,py,expected] of [['right gutter',x+w-25,ty+endY+lineH/2,length],['above text',x+35,y+6,0],['below text',x+35,y+h-8,length],['left gutter',x+5,ty+endY+lineH/2,0]]){
   ct.set_selection(0,0);panel.editor.date.grab_key_focus();await S.sleep(50);
   await click(px,py);
   assert(ct.has_key_focus(),`${expanded?'expanded':'compact'} ${name} focuses text`);
   assert(caret(ct)===expected,`${name} places caret at ${expected}, got ${caret(ct)}`);
   assert(ct.selection_bound===ct.cursor_position,'Blank click clears selection');
  }
  const multiline='Alpha 😀\nBeta';entry.set_text(multiline);ct.set_selection(0,0);await S.sleep(200);
  const [mx,my]=ct.get_transformed_position();const [, ,firstY,firstH]=ct.position_to_coords(0);
  panel.editor.date.grab_key_focus();await click(x+w-25,my+firstY+firstH/2);
  assert(ct.has_key_focus()&&caret(ct)===7,'Right gutter chooses the clicked line end, accounting for emoji bytes');
  ct.set_selection(2,2);
  const keyboard=global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  keyboard.notify_keyval(GLib.get_monotonic_time(),Clutter.KEY_Shift_L,Clutter.KeyState.PRESSED);await S.sleep(50);
  await click(x+w-25,my+firstY+firstH/2);
  keyboard.notify_keyval(GLib.get_monotonic_time(),Clutter.KEY_Shift_L,Clutter.KeyState.RELEASED);await S.sleep(50);
  assert(ct.get_selection()==='pha 😀','Shift click in the margin preserves the selection anchor');
  const [, glyphX,glyphY,glyphH]=ct.position_to_coords(3);
  await click(mx+glyphX,my+glyphY+glyphH/2);
  assert(caret(ct)===3,'Native glyph click keeps its original placement');
  const long=Array.from({length:40},(_,i)=>`Line ${i} with 😀 text`).join('\n');entry.set_text(long);await S.sleep(180);
  const target=Array.from(long.split('\n').slice(0,20).join('\n')+'\n').length;
  ct.set_selection(target,target);await S.sleep(180);
  const [lx,ly]=ct.get_transformed_position();const [, ,rowY,rowH]=ct.position_to_coords(target);
  const [fx,fy]=field.get_transformed_position();const [fw,fh]=field.get_transformed_size();
  assert(ly+rowY>=fy&&ly+rowY+rowH<=fy+fh,'Target line is visible after inner scrolling');
  panel.editor.date.grab_key_focus();await click(fx+fw-25,ly+rowY+rowH/2);
  const expected=target+Array.from(long.split('\n')[20]).length;
  assert(ct.has_key_focus()&&caret(ct)===expected,'Gutter click follows scrolled document coordinates');
  entry.set_text('');await S.sleep(150);panel.editor.date.grab_key_focus();
  const [emptyX,emptyY]=field.get_transformed_position();
  await click(emptyX+35,emptyY+field.height-8);
  assert(ct.has_key_focus()&&caret(ct)===0,'An empty field accepts focus anywhere');
  keyboard.notify_keyval(GLib.get_monotonic_time(),Clutter.KEY_x,Clutter.KeyState.PRESSED);
  keyboard.notify_keyval(GLib.get_monotonic_time()+1,Clutter.KEY_x,Clutter.KeyState.RELEASED);await S.sleep(120);
  assert(entry.get_text()==='x','Native typing works after an empty-area click');
 }
 await Main.extensionManager.disableExtension(app.uuid);
 print('PASS: compact/expanded blank margins focus the editor and place the caret at the nearest boundary');
}
