"""One-request encrypted vault helper. Requests and secrets travel only over pipes."""
import base64
from contextlib import contextmanager
from datetime import datetime
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

LIMIT = 32 * 1024 * 1024
REQUEST_LIMIT = 48 * 1024 * 1024
HEADER = b'Dayline private notes\x00version=1;scrypt=131072,8,1;AES-256-GCM\x00'
UNLOCK_ERROR = 'Unable to unlock private notes. Check the password or restore your encrypted vault backup.'


class VaultError(Exception):
    pass


def exact_keys(value, keys, optional=()):
    if type(value) is not dict or not set(keys) <= set(value) or not set(value) <= set(keys) | set(optional):
        raise VaultError('Invalid private vault data.')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise VaultError('Invalid private vault data.')
        result[key] = value
    return result


def loads(contents):
    return json.loads(contents, object_pairs_hook=unique_object)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def text_length(value):
    # Match the ordinary notes limit, which counts JavaScript UTF-16 code units.
    if type(value) is not str:
        raise VaultError('Invalid private note text.')
    return len(value.encode('utf-16-le')) // 2


def validate_format(text, ranges):
    if type(ranges) is not list or len(ranges) > 2000:
        raise VaultError('Invalid private note formatting.')
    for item in ranges:
        exact_keys(item, ['type', 'start', 'end'])
        if item['type'] not in ('bold', 'italic', 'code') or \
                type(item['start']) is not int or type(item['end']) is not int or \
                not 0 <= item['start'] < item['end'] <= len(text):
            raise VaultError('Invalid private note formatting.')


def validate_notes(notes, draft):
    if type(notes) is not list or len(notes) > 10000:
        raise VaultError('Private notes must contain at most 10,000 entries.')
    ids = set()
    for note in notes:
        exact_keys(note, ['id', 'text', 'createdAt'], ['format'])
        if not 0 < text_length(note['id']) <= 128 or note['id'] in ids:
            raise VaultError('Invalid or duplicate private note ID.')
        ids.add(note['id'])
        if not note['text'].strip() or text_length(note['text']) > 10000:
            raise VaultError('Private notes must contain between 1 and 10,000 characters.')
        if 'format' in note:
            validate_format(note['text'], note['format'])
        timestamp = note['createdAt']
        if type(timestamp) is not str or not re.match(r'^\d{4}-\d{2}-\d{2}T', timestamp):
            raise VaultError('Invalid private note creation date.')
        try:
            datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except ValueError:
            raise VaultError('Invalid private note creation date.') from None
    if draft is not None:
        exact_keys(draft, ['id', 'text'], ['format'])
        if draft['id'] is not None and (type(draft['id']) is not str or draft['id'] not in ids):
            raise VaultError('The private draft must refer to an existing note or a new note.')
        if text_length(draft['text']) > 10000:
            raise VaultError('Private drafts must contain at most 10,000 characters.')
        if 'format' in draft:
            validate_format(draft['text'], draft['format'])
    return {'notes': notes, 'draft': draft}


def b64(value):
    return base64.b64encode(value).decode('ascii')


def unb64(value, length=None):
    if type(value) is not str:
        raise VaultError('Invalid private vault data.')
    decoded = base64.b64decode(value, validate=True)
    if length is not None and len(decoded) != length:
        raise VaultError('Invalid private vault data.')
    return decoded


def password_key(password, salt):
    if type(password) is not str or not 0 < len(password.encode('utf-8')) <= 1024:
        raise VaultError('Enter a password containing at most 1,024 UTF-8 bytes.')
    return hashlib.scrypt(password.encode('utf-8'), salt=salt, n=131072, r=8, p=1,
                          maxmem=256 * 1024 * 1024, dklen=32)


def read_envelope(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > LIMIT:
            raise VaultError(UNLOCK_ERROR)
        contents = stream.read(LIMIT + 1)
    if len(contents) > LIMIT:
        raise VaultError(UNLOCK_ERROR)
    envelope = loads(contents)
    exact_keys(envelope, ['version', 'kdf', 'salt', 'nonce', 'ciphertext'])
    if type(envelope['version']) is not int or envelope['version'] != 1 or envelope['kdf'] != 'scrypt':
        raise VaultError(UNLOCK_ERROR)
    return contents, unb64(envelope['salt'], 16), unb64(envelope['nonce'], 12), unb64(envelope['ciphertext'])


def decrypt(key, salt, nonce, ciphertext):
    body = loads(AESGCM(key).decrypt(nonce, ciphertext, HEADER + salt))
    exact_keys(body, ['notes', 'draft'])
    return validate_notes(body['notes'], body['draft'])


def encrypt(key, salt, notes, draft):
    body = encoded(validate_notes(notes, draft))
    if len(body) > LIMIT:
        raise VaultError('Private notes are too large (maximum encrypted file: 32 MB).')
    nonce = os.urandom(12)
    ciphertext = AESGCM(key).encrypt(nonce, body, HEADER + salt)
    contents = encoded({'version': 1, 'kdf': 'scrypt', 'salt': b64(salt),
                        'nonce': b64(nonce), 'ciphertext': b64(ciphertext)}) + b'\n'
    if len(contents) > LIMIT:
        raise VaultError('Private notes are too large (maximum encrypted file: 32 MB).')
    return contents


@contextmanager
def write_lock(path):
    parent = path.parent
    if parent.is_symlink():
        raise VaultError('Unable to safely access the private vault directory.')
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(parent, 0o700)
    descriptor = os.open(str(path) + '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


def atomic_write(path, contents, create=False):
    descriptor, temporary = tempfile.mkstemp(prefix='.private-notes-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        if create:
            # Atomic, exclusive creation: an existing vault can never be replaced.
            os.link(temporary, path)
        else:
            os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def response(key, salt, contents, notes, draft):
    return {'ok': True, 'key': b64(key), 'salt': b64(salt),
            'revision': hashlib.sha256(contents).hexdigest(), 'notes': notes, 'draft': draft}


def handle(request):
    if type(request) is not dict:
        raise VaultError('Invalid private vault request.')
    operation = request.get('operation')
    keys = ['operation', 'path', 'password'] if operation in ['create', 'unlock'] else \
        ['operation', 'path', 'key', 'salt', 'revision', 'notes', 'draft']
    exact_keys(request, keys)
    if type(request['path']) is not str or not os.path.isabs(request['path']):
        raise VaultError('Invalid private vault path.')
    path = Path(request['path'])
    if operation == 'create':
        with write_lock(path):
            if os.path.lexists(path):
                raise VaultError('Private vault already exists. Unlock it to keep your existing notes.')
            salt = os.urandom(16)
            key = password_key(request['password'], salt)
            contents = encrypt(key, salt, [], None)
            atomic_write(path, contents, create=True)
        return response(key, salt, contents, [], None)
    if operation == 'unlock':
        try:
            contents, salt, nonce, ciphertext = read_envelope(path)
            key = password_key(request['password'], salt)
            body = decrypt(key, salt, nonce, ciphertext)
        except Exception:
            raise VaultError(UNLOCK_ERROR) from None
        return response(key, salt, contents, body['notes'], body['draft'])
    if operation == 'save':
        key = unb64(request['key'], 32)
        salt = unb64(request['salt'], 16)
        contents = encrypt(key, salt, request['notes'], request['draft'])
        with write_lock(path):
            try:
                original, old_salt, nonce, ciphertext = read_envelope(path)
                if not hmac.compare_digest(salt, old_salt):
                    raise VaultError(UNLOCK_ERROR)
                # Authenticate the disk document before any replacement, even after unlock.
                decrypt(key, salt, nonce, ciphertext)
            except Exception:
                raise VaultError(UNLOCK_ERROR) from None
            if type(request['revision']) is not str or not hmac.compare_digest(
                    request['revision'], hashlib.sha256(original).hexdigest()):
                raise VaultError('Private vault changed. Lock and unlock it again before saving.')
            atomic_write(path, contents)
        return response(key, salt, contents, request['notes'], request['draft'])
    raise VaultError('Unsupported private vault operation.')


def main():
    # Prevent Python tracebacks, external environment imports and on-disk bytecode.
    sys.dont_write_bytecode = True
    os.umask(0o077)
    try:
        contents = sys.stdin.buffer.read(REQUEST_LIMIT + 1)
        if len(contents) > REQUEST_LIMIT:
            raise VaultError('Private vault request is too large.')
        result = handle(loads(contents))
    except VaultError as error:
        result = {'ok': False, 'error': str(error)}
    except Exception:
        result = {'ok': False, 'error': 'Unable to access private notes. The existing encrypted vault has been preserved.'}
    sys.stdout.buffer.write(encoded(result) + b'\n')


if __name__ == '__main__':
    main()
