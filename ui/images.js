import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {button} from './widgets.js';

export function imageHeight(image, width, maximum = 220) {
    return Math.max(48, Math.min(maximum, width * image.height / image.width));
}

const ImageViewport = GObject.registerClass({
    GTypeName: `DaylineImageViewport_${GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, import.meta.url, -1).slice(0, 12)}`,
}, class ImageViewport extends St.Widget {
    vfunc_get_preferred_width() { return [0, 0]; }
    vfunc_get_preferred_height(width) {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const ratio = this.image ? this.image.height / this.image.width : 1;
        const height = Math.min((this.maximum ?? 220) * scale, Math.max(1, width) * ratio);
        return [height, height];
    }
    vfunc_allocate(allocation) {
        super.vfunc_allocate(allocation);
        if (!this.texture || !this.image) return;
        const width = allocation.get_width(); const height = allocation.get_height();
        const ratio = this.fit ? Math.min(width / this.image.width, height / this.image.height) : width / this.image.width;
        const childWidth = Math.max(1, this.image.width * ratio);
        const childHeight = Math.max(1, this.image.height * ratio);
        const child = new Clutter.ActorBox();
        child.x1 = (width - childWidth) / 2;child.y1 = (height - childHeight) / 2;
        child.x2 = child.x1 + childWidth;child.y2 = child.y1 + childHeight;
        this.texture.allocate(child);
    }
});

// Only worker-generated, bounded PNGs enter the compositor's texture cache.
export function imageButton(image, store, onClick, maximum = 220, variant = 'thumbnail.png', fit = false) {
    const control = button(`View image: ${image.name}`, onClick, 'dayline-image');
    control.x_expand = true;
    control.clip_to_allocation = true;
    const viewport = new ImageViewport({x_expand: true, clip_to_allocation: true});
    viewport.image = image;viewport.maximum = maximum;viewport.fit = fit;
    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    const file = Gio.File.new_for_path(store.path(image, variant));
    viewport.texture = St.TextureCache.get_default().load_file_async(file, variant === 'preview.png' ? 2048 : 1024, -1, scale, control.get_resource_scale());
    viewport.texture.content_gravity = Clutter.ContentGravity.RESIZE_FILL;
    viewport.add_child(viewport.texture);
    control.set_child(viewport);
    return control;
}

export function imageClipboardType() {
    const types = St.Clipboard.get_default().get_mimetypes(St.ClipboardType.CLIPBOARD) ?? [];
    return ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].find(type => types.includes(type))
        ?? ['x-special/gnome-copied-files', 'text/uri-list'].find(type => types.includes(type)) ?? null;
}

export function clipboardImages(store, type) {
    return new Promise((resolve, reject) => {
        St.Clipboard.get_default().get_content(St.ClipboardType.CLIPBOARD, type, (_clipboard, bytes) => {
            if (!bytes) { reject(new Error('The clipboard image is no longer available.')); return; }
            if (type.startsWith('image/')) { store.importBytes(bytes, type).then(resolve, reject); return; }
            try {
                const raw = new TextDecoder().decode(bytes.get_data());
                const files = raw.split(/\r?\n/).filter(line => line && !line.startsWith('#') && !['copy', 'cut'].includes(line));
                if (!files.length || files.length > 20 || files.some(uri => !uri.startsWith('file://')))
                    throw new Error('Copy local image files to paste into a task.');
                store.importFiles(files.map(uri => Gio.File.new_for_uri(uri).get_path())).then(resolve, reject);
            } catch (error) { reject(error); }
        });
    });
}
