import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccent, backgroundColor} from '../ui/appearance.js';

test('system accent follows GNOME colors and explicit choices stay independent', () => {
    assert.equal(resolveAccent('system', 'orange').name, 'ubuntu');
    assert.equal(resolveAccent('system', 'green').name, 'green');
    assert.equal(resolveAccent('system', 'blue').name, 'blue');
    assert.equal(resolveAccent('violet', 'orange').name, 'violet');
    assert.equal(resolveAccent('system', 'unknown').name, 'ubuntu');
});

test('background opacity produces bounded alpha while foreground palette stays fixed', () => {
    const accent = resolveAccent('ubuntu');
    const original = {...accent};
    assert.match(backgroundColor(accent, false, 100), /, 1\)$/);
    assert.match(backgroundColor(accent, false, 20), /, 0\.2\)$/);
    assert.notEqual(backgroundColor(accent, false, 50), backgroundColor(accent, true, 50));
    assert.deepEqual(accent, original);
});
