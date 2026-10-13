import test from 'node:test';
import assert from 'node:assert/strict';
import * as images from '../images.js';

const marker = '\uFFFC';
const asset = (id = 'a') => ({id: id.repeat(64), name: 'photo.png', mime: 'image/png', width: 640, height: 480, size: 1200});
const ref = (offset, id = 'a') => ({...asset(id), offset});

test('image metadata uses Unicode marker positions and detached ordered references', () => {
    assert.equal(images.IMAGE_MARKER, marker);
    const input = [ref(4, 'b'), ref(1)];
    assert.deepEqual(images.validateImages(`😀${marker}\nx${marker}`, input), [ref(1), ref(4, 'b')]);
    const output = images.validateImages(`😀${marker}\nx${marker}`, input);
    output[0].name = 'changed';
    assert.equal(input[1].name, 'photo.png');
    assert.deepEqual(images.validateImages('ordinary text'), []);
    assert.deepEqual(images.validateImages(`${marker}\n${marker}`, [ref(0), ref(2)]), [ref(0), ref(2)]);
});

test('image metadata rejects invalid fields, bounds, duplicates and unreferenced markers', () => {
    for (const patch of [{id: '../image'}, {id: 'A'.repeat(64)}, {name: ''}, {name: ' '.repeat(4)}, {name: 'x'.repeat(256)},
        {mime: 'image/svg+xml'}, {width: 0}, {height: 32769}, {width: 8001, height: 8000}, {width: 1.5},
        {size: 0}, {size: 25 * 1024 * 1024 + 1}, {size: NaN}, {offset: -1}, {offset: 1}, {offset: 0.5}, {unexpected: true}])
        assert.throws(() => images.validateImages(marker, [{...ref(0), ...patch}]));
    for (const invalid of [null, undefined, {}, [null], [ref(0), ref(0)], Array.from({length: 21}, (_, offset) => ref(offset))])
        assert.throws(() => images.validateImages(marker.repeat(21), invalid));
    assert.throws(() => images.validateImages(marker, []));
    assert.throws(() => images.validateImages(`x${marker}`, [ref(0)]));
    assert.throws(() => images.validateImages(4, []));
    for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'])
        assert.equal(images.validateImages(marker, [{...ref(0), mime}])[0].mime, mime);
    assert.equal(images.validateImages(marker, [{...ref(0), width: 32768, height: 1, size: 25 * 1024 * 1024}]).length, 1);
    assert.equal(images.validateImages(marker, [{...ref(0), width: 8000, height: 8000}]).length, 1);
});

test('ordinary edits shift Unicode image offsets and deletion drops only removed markers', () => {
    const before = `😀${marker}\ntext\n${marker}`;
    const refs = [ref(1), ref(8, 'b')];
    assert.deepEqual(images.remapImages(before, `Hi😀${marker}\ntext\n${marker}`, refs), [ref(3), ref(10, 'b')]);
    assert.deepEqual(images.remapImages(before, `😀\ntext\n${marker}`, refs), [ref(7, 'b')]);
    assert.deepEqual(images.remapImages(before, before, refs), refs);
    assert.throws(() => images.remapImages(before, `${before}${marker}`, refs));
});

test('verified edit selections preserve identity among repeated image markers', () => {
    const before = `${marker}${marker}`;
    const refs = [ref(0), ref(1, 'b')];
    assert.deepEqual(images.remapImages(before, marker, refs, {start: 0, end: 1}), [ref(0, 'b')]);
    assert.deepEqual(images.remapImages(before, marker, refs, {start: 1, end: 2}), [ref(0)]);
    assert.deepEqual(images.remapImages(before, marker, refs, {start: 10, end: 11}), [ref(0)]);
    assert.deepEqual(images.remapImages(`a${marker}b`, `xa${marker}b`, [ref(1)], {start: 1, end: 2}), [ref(2)]);
});

test('insertion replaces selection with image paragraphs and returns the Unicode cursor', () => {
    assert.deepEqual(images.insertImages('😀text', [], [asset()], 1, 1), {
        text: `😀\n${marker}\ntext`, images: [ref(2)], cursor: 4,
    });
    assert.deepEqual(images.insertImages('one\ntwo', [], [asset(), asset('b')], 4, 7), {
        text: `one\n${marker}\n${marker}\n`, images: [ref(4), ref(6, 'b')], cursor: 8,
    });
    assert.deepEqual(images.insertImages('', [], [asset()], 0, 0), {text: `${marker}\n`, images: [ref(0)], cursor: 2});
    assert.deepEqual(images.insertImages('a\nb', [], [asset()], 2, 2), {
        text: `a\n${marker}\nb`, images: [ref(2)], cursor: 4,
    });
    assert.deepEqual(images.insertImages('a\nb', [], [asset()], 1, 1), {
        text: `a\n${marker}\nb`, images: [ref(2)], cursor: 3,
    });
});

test('insertion at document end puts the caret on a paragraph below the last image', () => {
    assert.deepEqual(images.insertImages('😀', [], [asset()], 1, 1), {
        text: `😀\n${marker}\n`, images: [ref(2)], cursor: 4,
    });
    assert.deepEqual(images.insertImages('text\n', [], [asset()], 5, 5), {
        text: `text\n${marker}\n`, images: [ref(5)], cursor: 7,
    });
});

test('structural edits retain marker order when text changes on both sides of images', () => {
    const before = `first\n${marker}\n😀last\n${marker}`;
    const after = `• first\n${marker}\n• 😀last\n${marker}`;
    assert.deepEqual(images.remapImages(before, after, [ref(6), ref(14, 'b')]), [ref(8), ref(18, 'b')]);
    assert.deepEqual(images.remapImages(after, before, [ref(8), ref(18, 'b')]), [ref(6), ref(14, 'b')]);
    assert.throws(() => images.remapImages(`a${marker}b`, `x${marker}y`, [ref(1)], {start: 0, end: 3}));
});

test('insertion retains surrounding references and removes selected attachments', () => {
    const before = `${marker}\n😀a\n${marker}`;
    const refs = [ref(0), ref(5, 'b')];
    assert.deepEqual(images.insertImages(before, refs, [asset('c')], 3, 4), {
        text: `${marker}\n😀\n${marker}\n${marker}`, images: [ref(0), ref(4, 'c'), ref(6, 'b')], cursor: 5,
    });
    assert.deepEqual(images.insertImages(before, refs, [asset('c')], 0, 2), {
        text: `${marker}\n😀a\n${marker}`, images: [ref(0, 'c'), ref(5, 'b')], cursor: 2,
    });
    assert.throws(() => images.insertImages('abc', [], [asset()], 1, 4));
    assert.throws(() => images.insertImages('abc', [], [asset()], 2, 1));
    assert.throws(() => images.insertImages('', [], [asset()], 0.5, 0.5));
    assert.throws(() => images.insertImages('', [], [{...asset(), mime: 'text/plain'}], 0, 0));
    assert.throws(() => images.insertImages('', [], Array.from({length: 21}, () => asset()), 0, 0));
    assert.throws(() => images.insertImages('abc', [], [], 0, 0));
});

test('the attachment limit counts retained references and insertion errors leave inputs unchanged', () => {
    const text = Array.from({length: 20}, () => marker).join('\n');
    const refs = Array.from({length: 20}, (_, index) => ref(index * 2));
    const snapshot = structuredClone(refs);
    assert.throws(() => images.insertImages(text, refs, [asset('b')], 0, 0));
    assert.deepEqual(refs, snapshot);
    const replaced = images.insertImages(text, refs, [asset('b')], 0, 1);
    assert.equal(replaced.images.length, 20);
    assert.equal(replaced.images[0].id, 'b'.repeat(64));
    assert.deepEqual(refs, snapshot);
});
