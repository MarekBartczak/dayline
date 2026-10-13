"""Decode public task images outside GNOME Shell and build portable backups."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import zipfile

import gi
gi.require_version('GdkPixbuf', '2.0')
from gi.repository import GdkPixbuf

MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 64_000_000
MAX_BACKUP_BYTES = 512 * 1024 * 1024
MIMES = {'png':'image/png','jpeg':'image/jpeg','webp':'image/webp','gif':'image/gif','bmp':'image/bmp'}
ID = re.compile(r'^[a-f0-9]{64}$')


def atomic(path, content):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.image-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def import_image(directory, content, name):
    if not content or len(content) > MAX_BYTES:
        raise ValueError('Images must be no larger than 25 MiB.')
    with tempfile.TemporaryDirectory(prefix='dayline-image-') as tmp:
        source = Path(tmp) / 'source'
        source.write_bytes(content)
        try:
            fmt, width, height = GdkPixbuf.Pixbuf.get_file_info(str(source))
            if not fmt or fmt.get_name() not in MIMES:
                raise ValueError('Choose a PNG, JPEG, WebP, GIF or BMP image.')
            if min(width, height) < 1 or max(width, height) > 32768 or width * height > MAX_PIXELS:
                raise ValueError('Image dimensions exceed the limit (64 million pixels).')
            # Bounded decoding keeps both worker memory and Shell textures small.
            pix = GdkPixbuf.Pixbuf.new_from_file_at_scale(str(source), 2048, 2048, True).apply_embedded_orientation()
            digest = hashlib.sha256(content).hexdigest()
            target = Path(directory) / digest
            atomic(target / 'original', content)
            for filename, bound in [('preview.png', 2048), ('thumbnail.png', 1024)]:
                ratio = min(1, bound / max(pix.get_width(), pix.get_height()))
                preview = pix.scale_simple(max(1, round(pix.get_width()*ratio)), max(1, round(pix.get_height()*ratio)), GdkPixbuf.InterpType.BILINEAR)
                success, encoded = preview.save_to_bufferv('png', [], [])
                if not success: raise ValueError('Cannot create the image preview.')
                atomic(target / filename, bytes(encoded))
            # Embedded EXIF orientation changes the displayed aspect ratio.
            if (width > height) != (pix.get_width() > pix.get_height()) and width != height:
                width, height = height, width
            return {'id':digest,'name':Path(name).name[:255] or 'Clipboard image.png', 'mime':MIMES[fmt.get_name()], 'width':width,'height':height,'size':len(content)}
        except ValueError:
            raise
        except Exception as error:
            raise ValueError('Cannot read this image. Choose a PNG, JPEG, WebP, GIF or BMP file.') from error


def choose_files():
    gi.require_version('Gtk', '4.0')
    from gi.repository import Gtk, GLib, Gio
    Gtk.init()
    loop = GLib.MainLoop()
    response = {'files':[]}
    filters = Gio.ListStore.new(Gtk.FileFilter)
    image_filter = Gtk.FileFilter.new(); image_filter.set_name('Images (PNG, JPEG, WebP, GIF, BMP)')
    for mime in MIMES.values(): image_filter.add_mime_type(mime)
    filters.append(image_filter)
    dialog = Gtk.FileDialog.new(); dialog.set_title('Insert images into task');dialog.set_filters(filters)
    def complete(source, result):
        try:
            files = source.open_multiple_finish(result)
            response['files'] = [files.get_item(i).get_path() for i in range(files.get_n_items())]
            if any(path is None for path in response['files']): response['error'] = 'Choose local image files.'
        except Exception as error:
            if not error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED): response['error'] = str(error)
        finally: loop.quit()
    dialog.open_multiple(None, None, complete)
    loop.run()
    if 'error' in response: raise ValueError(response['error'])
    return response


def execute(request):
    operation = request['operation']
    if operation == 'choose': return choose_files()
    directory = Path(request['directory'])
    if operation == 'import':
        files = request.get('files', [])
        if len(files) > 20: raise ValueError('A task can contain up to 20 images.')
        images = []
        for file in files:
            path = Path(file)
            if not path.is_file() or path.stat().st_size > MAX_BYTES: raise ValueError('Choose a readable image no larger than 25 MiB.')
            images.append(import_image(directory, path.read_bytes(), path.name))
        if 'bytes' in request:
            images.append(import_image(directory, base64.b64decode(request['bytes'], validate=True), request.get('name','Clipboard image.png')))
        return {'images':images}
    if operation == 'export':
        document = request['document']
        references = {image['id'] for task in document['tasks'] for image in task.get('images', [])}
        if any(not ID.fullmatch(i) for i in references): raise ValueError('Invalid image reference.')
        destination = Path(request['path'])
        destination.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix='.dayline-backup-', dir=destination.parent)
        os.close(fd)
        try:
            if len(references) > 10000: raise ValueError('Backup contains too many distinct images (limit: 10,000).')
            serialized = json.dumps(document, ensure_ascii=False, indent=2).encode('utf-8')
            if len(serialized) > 32*1024*1024: raise ValueError('Public backup data exceeds the 32 MiB limit.')
            total_size = len(serialized)
            for image_id in references:
                original = directory / image_id / 'original'
                if not original.is_file(): raise ValueError('An attached image is missing. Backup was not written.')
                total_size += original.stat().st_size
            if total_size > MAX_BACKUP_BYTES: raise ValueError('Backup exceeds the 512 MiB limit.')
            with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
                archive.writestr('data.json', serialized)
                for image_id in sorted(references):
                    source = directory / image_id / 'original'
                    if not source.is_file() or source.stat().st_size > MAX_BYTES: raise ValueError('An attached image is missing. Backup was not written.')
                    content = source.read_bytes()
                    if hashlib.sha256(content).hexdigest() != image_id: raise ValueError('An attached image is damaged.')
                    archive.writestr('images/' + image_id, content)
            os.replace(temporary, destination)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
        return {}
    if operation == 'restore':
        with zipfile.ZipFile(request['path']) as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            if len(names) != len(set(names)) or 'data.json' not in names or len(names)>10001:
                raise ValueError('Invalid Dayline image backup.')
            if sum(entry.file_size for entry in entries) > MAX_BACKUP_BYTES:
                raise ValueError('Backup exceeds the 512 MiB limit.')
            for entry in entries:
                if entry.filename != 'data.json' and not re.fullmatch('images/[a-f0-9]{64}', entry.filename):
                    raise ValueError('Invalid backup file path.')
                if entry.file_size > (32*1024*1024 if entry.filename == 'data.json' else MAX_BYTES):
                    raise ValueError('Backup contains an oversized file.')
            document = json.loads(archive.read('data.json'))
            refs = [image for task in document['tasks'] for image in task.get('images', [])]
            referenced = {image['id'] for image in refs}
            if set(names) != {'data.json'} | {'images/'+i for i in referenced}:
                raise ValueError('Backup images do not match task references.')
            restored = {}
            for image in refs:
                image_id = image['id']
                if not ID.fullmatch(image_id): raise ValueError('Invalid image reference.')
                if image_id not in restored:
                    content = archive.read('images/'+image_id)
                    if hashlib.sha256(content).hexdigest() != image_id: raise ValueError('Backup contains a damaged image.')
                    restored[image_id] = import_image(directory, content, image['name'])
                if any(restored[image_id][key] != image[key] for key in ['mime','width','height','size']):
                    raise ValueError('Backup image metadata does not match the original.')
            return {'document':document}
    raise ValueError('Unknown image operation.')


if __name__ == '__main__':
    os.umask(0o077)
    try:
        # The clipboard's base64 expansion is bounded separately from public JSON.
        raw = sys.stdin.buffer.read(40*1024*1024+1)
        if len(raw)>40*1024*1024: raise ValueError('Image request is too large.')
        result = execute(json.loads(raw))
        print(json.dumps({'ok':True, **result}, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'ok':False, 'error':str(error)}, ensure_ascii=False))
