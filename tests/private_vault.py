"""Real subprocess tests: no test passwords are passed as command arguments."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

HELPER = Path(__file__).resolve().parents[1] / 'private_vault.py'
PASSWORD = 'test-only correct horse 🔐'
NOTE = {'id': 'private-a', 'text': 'Secret note\n<b>literal</b>', 'createdAt': '2026-10-12T08:00:00.000Z'}


class PrivateVaultTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / 'dayline' / 'private-notes.vault'

    def tearDown(self):
        self.directory.cleanup()

    def request(self, operation, **fields):
        process = subprocess.run(
            ['/usr/bin/python3', '-I', str(HELPER)],
            input=json.dumps({'operation': operation, 'path': str(self.path), **fields}, ensure_ascii=False),
            text=True, capture_output=True, check=False,
        )
        self.assertEqual(process.returncode, 0, 'Helper must return structured errors')
        self.assertEqual(process.stderr, '', 'Helper must never log secrets or tracebacks')
        return json.loads(process.stdout)

    def create(self):
        result = self.request('create', password=PASSWORD)
        self.assertTrue(result['ok'], result)
        return result

    def save(self, unlocked, notes, draft=None):
        return self.request('save', key=unlocked['key'], salt=unlocked['salt'],
                            revision=unlocked['revision'], notes=notes, draft=draft)

    def test_create_encrypt_save_unlock_and_permissions(self):
        created = self.create()
        self.assertEqual(created['notes'], [])
        self.assertIsNone(created['draft'])
        draft = {'id': NOTE['id'], 'text': 'Unfinished secret edit'}
        saved = self.save(created, [NOTE], draft)
        self.assertTrue(saved['ok'], saved)
        ciphertext = self.path.read_bytes()
        self.assertNotIn(NOTE['text'].encode(), ciphertext)
        self.assertNotIn(draft['text'].encode(), ciphertext)
        self.assertNotIn(PASSWORD.encode(), ciphertext)
        self.assertNotIn(created['key'].encode(), ciphertext)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.path.parent.stat().st_mode & 0o777, 0o700)
        unlocked = self.request('unlock', password=PASSWORD)
        self.assertTrue(unlocked['ok'], unlocked)
        self.assertEqual(unlocked['notes'], [NOTE])
        self.assertEqual(unlocked['draft'], draft)
        self.assertEqual(unlocked['key'], created['key'])
        for entry in self.path.parent.iterdir():
            self.assertNotIn(NOTE['text'].encode(), entry.read_bytes())
            self.assertNotIn(draft['text'].encode(), entry.read_bytes())

    def test_crypto_parameters_authenticated_header_and_fresh_nonce(self):
        created = self.create()
        before = json.loads(self.path.read_bytes())
        salt = base64.b64decode(before['salt'], validate=True)
        self.assertEqual(len(salt), 16)
        expected_key = hashlib.scrypt(PASSWORD.encode(), salt=salt, n=131072, r=8, p=1,
                                     maxmem=256 * 1024 * 1024, dklen=32)
        self.assertEqual(base64.b64decode(created['key']), expected_key)
        self.assertEqual(len(base64.b64decode(before['nonce'])), 12)
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        header = b'Dayline private notes\x00version=1;scrypt=131072,8,1;AES-256-GCM\x00'
        body = AESGCM(expected_key).decrypt(base64.b64decode(before['nonce']),
                                          base64.b64decode(before['ciphertext']), header + salt)
        self.assertEqual(json.loads(body), {'notes': [], 'draft': None})
        saved = self.save(created, [NOTE])
        self.assertTrue(saved['ok'], saved)
        after = json.loads(self.path.read_bytes())
        self.assertNotEqual(before['nonce'], after['nonce'])
        self.assertEqual(before['salt'], after['salt'])
        after['version'] = 2
        self.path.write_text(json.dumps(after))
        self.assertFalse(self.request('unlock', password=PASSWORD)['ok'])

    def test_wrong_password_and_tampering_have_same_error_and_block_writes(self):
        created = self.create()
        original = self.path.read_bytes()
        wrong = self.request('unlock', password='wrong test password')
        self.assertFalse(wrong['ok'])
        self.assertEqual(self.path.read_bytes(), original)
        envelope = json.loads(original)
        cipher = bytearray(base64.b64decode(envelope['ciphertext']))
        cipher[len(cipher) // 2] ^= 1
        envelope['ciphertext'] = base64.b64encode(cipher).decode()
        self.path.write_text(json.dumps(envelope))
        corrupt = self.path.read_bytes()
        failure = self.request('unlock', password=PASSWORD)
        self.assertEqual(failure['error'], wrong['error'])
        self.assertFalse(self.save(created, [NOTE])['ok'])
        self.assertFalse(self.request('create', password=PASSWORD)['ok'])
        self.assertEqual(self.path.read_bytes(), corrupt)

    def test_invalid_and_oversized_inputs_preserve_ciphertext(self):
        created = self.create()
        original = self.path.read_bytes()
        bad_notes = [
            [{**NOTE, 'text': ''}], [{**NOTE, 'text': 'x' * 10001}],
            [NOTE, NOTE], [{**NOTE, 'createdAt': 'invalid'}],
            [{**NOTE, 'extra': 'field'}], [{**NOTE, 'id': ''}],
        ]
        for notes in bad_notes:
            self.assertFalse(self.save(created, notes)['ok'])
            self.assertEqual(self.path.read_bytes(), original)
        self.assertFalse(self.save(created, [NOTE], {'id': 'missing', 'text': 'draft'})['ok'])
        self.assertFalse(self.save(created, [NOTE], {'id': None, 'text': 'x' * 10001})['ok'])
        oversized = [{'id': f'n{i}', 'text': '思' * 10000, 'createdAt': NOTE['createdAt']} for i in range(1200)]
        self.assertFalse(self.save(created, oversized)['ok'])
        self.assertEqual(self.path.read_bytes(), original)

    def test_stale_session_cannot_overwrite_newer_ciphertext(self):
        created = self.create()
        saved = self.save(created, [NOTE])
        self.assertTrue(saved['ok'], saved)
        current = self.path.read_bytes()
        self.assertFalse(self.save(created, [])['ok'])
        self.assertEqual(self.path.read_bytes(), current)

    def test_authenticated_malformed_plaintext_and_protocol_errors_do_not_leak(self):
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        created = self.create()
        envelope = json.loads(self.path.read_bytes())
        salt = base64.b64decode(envelope['salt'])
        nonce = base64.b64decode(envelope['nonce'])
        key = base64.b64decode(created['key'])
        header = b'Dayline private notes\x00version=1;scrypt=131072,8,1;AES-256-GCM\x00'
        invalid = {'notes': [{**NOTE, 'text': ''}], 'draft': None}
        envelope['ciphertext'] = base64.b64encode(AESGCM(key).encrypt(nonce, json.dumps(invalid).encode(), header + salt)).decode()
        self.path.write_text(json.dumps(envelope))
        wrong = self.request('unlock', password='wrong test password')
        malformed = self.request('unlock', password=PASSWORD)
        self.assertEqual(wrong['error'], malformed['error'])
        for password in ['', 'x' * 1025]:
            self.assertFalse(self.request('unlock', password=password)['ok'])
        self.assertFalse(self.request('unknown', password=PASSWORD)['ok'])

    def test_missing_symlink_and_oversized_vaults_fail_without_overwrite(self):
        self.assertFalse(self.request('unlock', password=PASSWORD)['ok'])
        created = self.create()
        target = self.path.with_name('original.vault')
        self.path.rename(target)
        self.path.symlink_to(target)
        self.assertFalse(self.request('unlock', password=PASSWORD)['ok'])
        self.assertFalse(self.save(created, [])['ok'])
        self.path.unlink()
        with self.path.open('wb') as stream:
            stream.truncate(32 * 1024 * 1024 + 1)
        self.assertFalse(self.request('unlock', password=PASSWORD)['ok'])
        self.assertEqual(self.path.stat().st_size, 32 * 1024 * 1024 + 1)


if __name__ == '__main__':
    unittest.main()
