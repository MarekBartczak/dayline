import test from 'node:test';
import assert from 'node:assert/strict';
import * as appearance from '../ui/appearance.js';
const {resolveAccent, backgroundColor, windowOpacity} = appearance;

test('system accent follows GNOME colors and explicit choices stay independent', () => {
    assert.equal(resolveAccent('system', 'orange').name, 'ubuntu');
    assert.equal(resolveAccent('system', 'green').name, 'green');
    assert.equal(resolveAccent('system', 'blue').name, 'blue');
    assert.equal(resolveAccent('violet', 'orange').name, 'violet');
    assert.equal(resolveAccent('system', 'unknown').name, 'ubuntu');
});

test('window opacity converts percentages to bounded Clutter opacity bytes', () => {
    assert.equal(typeof windowOpacity, 'function', 'Window opacity conversion must be available');
    for (const [percent, byte] of [[20, 51], [37.5, 96], [50, 128], [65, 166], [100, 255], [0, 51], [120, 255]])
        assert.equal(windowOpacity(percent), byte, `${percent}% must map to ${byte}`);
    for (const invalid of [undefined, NaN, Infinity, -Infinity, '50', null])
        assert.equal(windowOpacity(invalid), 255, 'Invalid percentages must default to full opacity');
});

test('theme backgrounds remain opaque while window opacity fades the whole popup', () => {
    const accent = resolveAccent('ubuntu');
    const original = {...accent};
    assert.match(backgroundColor(accent, false, 100), /, 1\)$/);
    assert.match(backgroundColor(accent, false, 20), /, 1\)$/);
    assert.equal(backgroundColor(accent, false, 20), backgroundColor(accent, false, 100));
    assert.match(backgroundColor(accent, true), /, 1\)$/);
    assert.notEqual(backgroundColor(accent, false, 50), backgroundColor(accent, true, 50));
    assert.deepEqual(accent, original);
});
