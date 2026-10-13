import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../formatting.js';
const span = (type, start, end) => ({type, start, end});

test('formatting API is portable and validates cloned Unicode ranges', () => {
    assert.equal(typeof f.validateFormat, 'function');
    const input = [span('bold', 2, 4), span('italic', 1, 2), span('bold', 0, 2)];
    const result = f.validateFormat('A😀bc', input);
    assert.deepEqual(result, [span('bold', 0, 4), span('italic', 1, 2)]);
    result[0].end = 1;
    assert.equal(input[0].end, 4);
    assert.deepEqual(f.validateFormat('plain'), []);
    assert.deepEqual(f.byteOffsets('a😀é\n'), [0, 1, 5, 7, 8]);
});

test('invalid metadata is rejected before normalization', () => {
    const invalid = [null, {}, 'bold', [null], [span('unknown', 0, 1)],
        [span('bold', -1, 1)], [span('bold', 1, 1)], [span('bold', 0, 5)],
        [span('bold', 0.5, 1)], [{type: 'bold', start: 0, end: 1, extra: true}],
        [{type: 'bold', start: 0}], Array.from({length: 2001}, () => span('bold', 0, 1))];
    for (const value of invalid)
        assert.throws(() => f.validateFormat('A😀bc', value));
});

test('single diff remapping handles Unicode insertions, deletions and replacements', () => {
    const format = [span('bold', 1, 4), span('italic', 4, 5)];
    assert.deepEqual(f.remapFormat('a😀bcd', 'Xa😀bcd', format), [span('bold', 2, 5), span('italic', 5, 6)]);
    assert.deepEqual(f.remapFormat('a😀bcd', 'a😀ZZbcd', format), [span('bold', 1, 6), span('italic', 6, 7)]);
    assert.deepEqual(f.remapFormat('a😀bcd', 'ad', format), [span('italic', 1, 2)]);
    assert.deepEqual(f.remapFormat('a😀bcd', 'aXd', format), [span('bold', 1, 2), span('italic', 2, 3)]);
    assert.deepEqual(f.remapFormat('a😀bcd', 'a😀bc!d', format), [span('bold', 1, 5), span('italic', 5, 6)]);
    assert.deepEqual(f.remapFormat('a😀bcd', 'a😀bcd!', format), [span('bold', 1, 4), span('italic', 4, 6)]);
});

test('edit hints locate insertions and deletions among repeated characters', () => {
    assert.deepEqual(f.remapFormat('aaaa', 'aaaaa', [span('bold', 1, 2)], {start: 2, end: 2}),
        [span('bold', 1, 3)]);
    assert.deepEqual(f.remapFormat('aaaa', 'aaa', [span('italic', 2, 3)], {start: 1, end: 2}),
        [span('italic', 1, 2)]);
    assert.deepEqual(f.remapFormat('aaaa', 'aaaa', [span('code', 2, 3)], {start: 1, end: 3}),
        [span('code', 1, 3)]);
    assert.deepEqual(f.remapFormat('😀😀😀', '😀😀😀😀', [span('bold', 0, 1)], {start: 1, end: 1}),
        [span('bold', 0, 2)]);
});

test('edit hints preserve style location during indentation edits', () => {
    const format = [span('code', 2, 4)];
    assert.deepEqual(f.remapFormat('    x', '     x', format, {start: 1, end: 1}),
        [span('code', 3, 5)]);
    assert.deepEqual(f.remapFormat('    x', '   x', format, {start: 1, end: 2}),
        [span('code', 1, 3)]);
    assert.deepEqual(f.remapFormat('    x', '  \t  x', format, {start: 1, end: 3}),
        [span('code', 1, 5)]);
});

test('invalid or unmatched edit hints fall back to the string diff', () => {
    const format = [span('bold', 1, 3)];
    const expected = f.remapFormat('aaaa', 'aXaaa', format);
    for (const hint of [null, false, {}, {start: -1, end: 1}, {start: 1.5, end: 2},
        {start: 0, end: 5}, {start: 2, end: 1}, {start: 3, end: 3}, {start: 0, end: 0}])
        assert.deepEqual(f.remapFormat('aaaa', 'aXaaa', format, hint), expected);
    // Prefix and suffix must not overlap in the replacement string.
    assert.deepEqual(f.remapFormat('aaaa', 'a', format, {start: 2, end: 2}),
        f.remapFormat('aaaa', 'a', format));
});

test('overlapping style toggles merge coverage and remove only a covered selection', () => {
    const text = 'abcdefgh';
    let format = f.toggleFormat(text, [span('italic', 0, 8), span('bold', 0, 3)], 'bold', 2, 6);
    assert.deepEqual(format, [span('bold', 0, 6), span('italic', 0, 8)]);
    format = f.toggleFormat(text, format, 'bold', 2, 4);
    assert.deepEqual(format, [span('bold', 0, 2), span('italic', 0, 8), span('bold', 4, 6)]);
    assert.deepEqual(f.toggleFormat(text, format, 'bold', 3, 3), format);
    assert.throws(() => f.toggleFormat(text, format, 'underline', 0, 2));
});

test('lists transform complete selected lines and preserve formatted content offsets', () => {
    const result = f.listSelection('😀one\n  two\nthree', [span('bold', 0, 4)], 1, 9);
    assert.equal(result.text, '• 😀one\n•   two\nthree');
    assert.deepEqual(result.format, [span('bold', 2, 6)]);
    assert.equal(result.start, 0);
    assert.equal(result.end, 14);
    const removed = f.listSelection(result.text, result.format, result.start, result.end);
    assert.equal(removed.text, '😀one\n  two\nthree');
    assert.deepEqual(removed.format, [span('bold', 0, 4)]);
    assert.equal(f.listSelection('a\nb\nc', [], 0, 3, true).text, '1. a\n2. b\nc');
    assert.equal(f.listSelection('1. a\n2. b\nc', [], 0, 9, true).text, 'a\nb\nc');
});

test('list prefixes do not change whitespace inside code blocks', () => {
    const text = 'intro\n  x\n\ty\noutro';
    const result = f.listSelection(text, [span('code', 6, 12)], 0, Array.from(text).length);
    assert.equal(result.text, '• intro\n  x\n\ty\n• outro');
    const code = result.format.find(range => range.type === 'code');
    assert.equal(Array.from(result.text).slice(code.start, code.end).join(''), '  x\n\ty');
});

test('code selections retain exact whitespace and separate neighboring prose', () => {
    const text = 'before  x\n\ty  after';
    const selected = '  x\n\ty  ';
    const start = 6;
    const end = start + selected.length;
    const result = f.codeSelection(text, [span('bold', 0, 6)], start, end);
    assert.equal(result.text, `before\n\n${selected}\n\nafter`);
    assert.deepEqual(result.format, [span('bold', 0, 6), span('code', 8, 16)]);
    assert.equal(Array.from(result.text).slice(result.start, result.end).join(''), selected);
    const removed = f.codeSelection(result.text, result.format, result.start, result.end);
    assert.deepEqual(removed.format, [span('bold', 0, 6)]);
    assert.equal(removed.text, result.text);
});

test('code uses existing blank lines and keeps Unicode selection boundaries', () => {
    const text = 'a\n\n  😀\t\n\nb';
    const result = f.codeSelection(text, [], 3, 7);
    assert.equal(result.text, text);
    assert.deepEqual(result.format, [span('code', 3, 7)]);
    assert.deepEqual(f.codeSelection(text, [], 3, 3), {text, format: [], start: 3, end: 3});
});

test('list selection keeps inline image paragraphs intact', () => {
    const value = 'before\n\uFFFC\nafter';
    assert.equal(f.listSelection(value, [], 0, Array.from(value).length).text, '• before\n\uFFFC\n• after');
    assert.throws(() => f.codeSelection(value, [], 0, Array.from(value).length), /outside the image/);
});
