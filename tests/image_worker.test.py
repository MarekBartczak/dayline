import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
import gi
gi.require_version('GdkPixbuf', '2.0')
from gi.repository import GdkPixbuf

class Images(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('worker', Path(__file__).parents[1] / 'image_worker.py')
        self.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.worker)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'Example.png'
        pix = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, False, 8, 800, 1600)
        pix.fill(0x854ecaff)
        pix.savev(str(self.source), 'png', [], [])
        self.data = self.root / 'data'

    def test_import_and_portable_backup(self):
        image = self.worker.execute({'operation':'import', 'directory':str(self.data), 'files':[str(self.source)]})['images'][0]
        self.assertEqual((image['width'], image['height']), (800, 1600))
        original = self.data / image['id'] / 'original'
        self.assertEqual(original.read_bytes(), self.source.read_bytes())
        preview = GdkPixbuf.Pixbuf.new_from_file(str(self.data / image['id'] / 'thumbnail.png'))
        self.assertLessEqual(max(preview.get_width(), preview.get_height()), 1024)
        doc = {'version':3, 'tasks':[{'text':'Before\n\ufffc\nAfter', 'images':[dict(image, offset=7)]}], 'notes':[]}
        backup = self.root / 'backup.zip'
        self.worker.execute({'operation':'export','directory':str(self.data),'path':str(backup),'document':doc})
        self.source.unlink()
        restored = self.worker.execute({'operation':'restore','directory':str(self.root/'restored'),'path':str(backup)})
        self.assertEqual(restored['document'], doc)
        self.assertEqual((self.root/'restored'/image['id']/'original').read_bytes(), original.read_bytes())

    def test_backup_budget_uses_exact_serialized_bytes(self):
        doc = {'version':3,'tasks':[], 'notes':[{'text':'x'*20} for _ in range(60)]}
        serialized = json.dumps(doc, ensure_ascii=False, indent=2).encode()
        self.worker.MAX_BACKUP_BYTES = len(serialized)-1
        target = self.root/'oversized.zip'
        with self.assertRaisesRegex(ValueError, '512 MiB'):
            self.worker.execute({'operation':'export','directory':str(self.data),'path':str(target),'document':doc})
        self.assertFalse(target.exists())
        self.worker.MAX_BACKUP_BYTES = len(serialized)
        self.worker.execute({'operation':'export','directory':str(self.data),'path':str(target),'document':doc})
        self.assertEqual(self.worker.execute({'operation':'restore','directory':str(self.data),'path':str(target)})['document'], doc)

    def test_corrupt_and_oversized(self):
        bad = self.root / 'bad.png';bad.write_bytes(b'not a picture')
        with self.assertRaises(ValueError):
            self.worker.execute({'operation':'import','directory':str(self.data),'files':[str(bad)]})
        bad.write_bytes(b'0' * (25*1024*1024 + 1))
        with self.assertRaises(ValueError):
            self.worker.execute({'operation':'import','directory':str(self.data),'files':[str(bad)]})

    def test_archive_rejects_traversal_and_hash_mismatch(self):
        for name in ['../outside.png', '/absolute.png', 'images/'+'0'*64]:
            backup = self.root / 'bad.zip'
            with zipfile.ZipFile(backup, 'w') as z:
                z.writestr('data.json', json.dumps({'version':3,'tasks':[],'notes':[]}))
                z.writestr(name, self.source.read_bytes())
            with self.assertRaises(ValueError):
                self.worker.execute({'operation':'restore','directory':str(self.data),'path':str(backup)})
        self.assertFalse((self.root/'outside.png').exists())

if __name__ == '__main__': unittest.main()
