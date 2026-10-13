// Portable character-range formatting. Offsets count Unicode code points, as
// Clutter.Text does, rather than UTF-16 code units or UTF-8 bytes.
const TYPES = ['bold', 'italic', 'code'];
const MAX_RANGES = 2000;

function characters(text) {
    if (typeof text !== 'string')
        throw new Error('Formatting requires plain text.');
    return Array.from(text);
}

function normalize(ranges) {
    const merged = [];
    for (const type of TYPES) {
        const ordered = ranges.filter(range => range.type === type)
            .sort((a, b) => a.start - b.start || a.end - b.end);
        let previous = null;
        for (const range of ordered) {
            if (previous && range.start <= previous.end)
                previous.end = Math.max(previous.end, range.end);
            else {
                previous = {...range};
                merged.push(previous);
            }
        }
    }
    if (merged.length > MAX_RANGES)
        throw new Error('Too many formatting ranges (limit: 2,000).');
    return merged.sort((a, b) => a.start - b.start || TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.end - b.end);
}

export function validateFormat(text, format = undefined) {
    const length = characters(text).length;
    if (format === undefined)
        return [];
    if (!Array.isArray(format) || format.length > MAX_RANGES)
        throw new Error('Invalid formatting ranges.');
    for (const range of format) {
        if (!range || typeof range !== 'object' || Array.isArray(range) ||
            Object.keys(range).length !== 3 ||
            !['type', 'start', 'end'].every(key => Object.hasOwn(range, key)) ||
            !TYPES.includes(range.type) || !Number.isInteger(range.start) ||
            !Number.isInteger(range.end) || range.start < 0 ||
            range.start >= range.end || range.end > length)
            throw new Error('Invalid formatting range.');
    }
    return normalize(format);
}

function selection(length, start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || end > length)
        throw new Error('Invalid text selection.');
}

// Text typed at a range's end inherits its style; structural prefixes and
// separators use endAffinity=false so they remain outside the content.
function editRanges(format, start, end, inserted, endAffinity = true) {
    const delta = inserted - (end - start);
    return normalize(format.map(range => {
        if (start === end) {
            if (range.start >= start)
                return {...range, start: range.start + delta, end: range.end + delta};
            if (range.end > start || endAffinity && range.end === start)
                return {...range, end: range.end + delta};
            return {...range};
        }
        if (range.start >= end)
            return {...range, start: range.start + delta, end: range.end + delta};
        if (range.end <= start)
            return {...range};
        return {...range, start: Math.min(range.start, start),
            end: range.end > end ? range.end + delta : start + inserted};
    }).filter(range => range.start < range.end));
}

export function remapFormat(oldText, newText, format, hint = undefined) {
    const oldChars = characters(oldText);
    const newChars = characters(newText);
    const validated = validateFormat(oldText, format);
    // Repeated characters can make the minimal string diff choose a different
    // edit location. Trust a captured selection only when its untouched prefix
    // and suffix match the new text without overlapping.
    if (hint && Number.isInteger(hint.start) && Number.isInteger(hint.end) &&
        hint.start >= 0 && hint.start <= hint.end && hint.end <= oldChars.length) {
        const suffixLength = oldChars.length - hint.end;
        const inserted = newChars.length - hint.start - suffixLength;
        if (inserted >= 0 &&
            oldChars.slice(0, hint.start).every((character, index) => character === newChars[index]) &&
            oldChars.slice(hint.end).every((character, index) => character === newChars[hint.start + inserted + index]))
            return editRanges(validated, hint.start, hint.end, inserted);
    }
    let start = 0;
    while (start < oldChars.length && start < newChars.length && oldChars[start] === newChars[start])
        start++;
    let oldEnd = oldChars.length;
    let newEnd = newChars.length;
    while (oldEnd > start && newEnd > start && oldChars[oldEnd - 1] === newChars[newEnd - 1]) {
        oldEnd--;
        newEnd--;
    }
    return editRanges(validated, start, oldEnd, newEnd - start);
}

export function toggleFormat(text, format, type, start, end) {
    const validated = validateFormat(text, format);
    selection(characters(text).length, start, end);
    if (!TYPES.includes(type))
        throw new Error('Unsupported formatting type.');
    if (start === end)
        return validated;
    const covered = validated.some(range => range.type === type && range.start <= start && range.end >= end);
    if (!covered)
        return normalize([...validated, {type, start, end}]);
    return normalize(validated.flatMap(range => {
        if (range.type !== type || range.end <= start || range.start >= end)
            return [range];
        const parts = [];
        if (range.start < start)
            parts.push({...range, end: start});
        if (range.end > end)
            parts.push({...range, start: end});
        return parts;
    }));
}

export function listSelection(text, format, start, end, ordered = false) {
    const chars = characters(text);
    let ranges = validateFormat(text, format);
    selection(chars.length, start, end);
    let first = start;
    while (first > 0 && chars[first - 1] !== '\n')
        first--;
    let last = end > start ? end - 1 : end;
    while (last < chars.length && chars[last] !== '\n')
        last++;
    const lines = [];
    for (let offset = first; offset <= last;) {
        let lineEnd = offset;
        while (lineEnd < last && chars[lineEnd] !== '\n')
            lineEnd++;
        // A list operation never inserts into or removes bytes from code.
        if (!chars.slice(offset, lineEnd).includes('\uFFFC') && !ranges.some(range => range.type === 'code' && range.start <= lineEnd && range.end > offset))
            lines.push({start: offset, text: chars.slice(offset, lineEnd).join('')});
        offset = lineEnd + 1;
    }
    const prefixPattern = ordered ? /^\d+\. / : /^• /;
    const remove = lines.length > 0 && lines.every(line => prefixPattern.test(line.text));
    const edits = lines.map((line, index) => {
        const existing = line.text.match(/^(?:• |\d+\. )/);
        const previous = existing ? Array.from(existing[0]).length : 0;
        return {start: line.start, end: line.start + previous,
            text: remove ? '' : ordered ? `${index + 1}. ` : '• '};
    });
    let totalDelta = 0;
    for (const edit of edits.reverse()) {
        const inserted = Array.from(edit.text);
        ranges = editRanges(ranges, edit.start, edit.end, inserted.length, false);
        chars.splice(edit.start, edit.end - edit.start, ...inserted);
        totalDelta += inserted.length - (edit.end - edit.start);
    }
    return {text: chars.join(''), format: ranges, start: first, end: last + totalDelta};
}

export function codeSelection(text, format, start, end) {
    const chars = characters(text);
    let ranges = validateFormat(text, format);
    selection(chars.length, start, end);
    if (chars.slice(start, end).includes('\uFFFC'))
        throw new Error('Select text outside the image block to format as code.');
    if (start === end)
        return {text, format: ranges, start, end};
    if (ranges.some(range => range.type === 'code' && range.start === start && range.end === end))
        return {text, format: toggleFormat(text, ranges, 'code', start, end), start, end};
    // Count only newlines outside the selection. Its complete original content,
    // including leading/trailing whitespace, remains within the code range.
    let before = 0;
    while (before < 2 && start - before > 0 && chars[start - before - 1] === '\n')
        before++;
    let after = 0;
    while (after < 2 && end + after < chars.length && chars[end + after] === '\n')
        after++;
    const prefix = start > 0 ? '\n'.repeat(2 - before) : '';
    const suffix = end < chars.length ? '\n'.repeat(2 - after) : '';
    if (suffix) {
        ranges = editRanges(ranges, end, end, suffix.length, false);
        chars.splice(end, 0, ...suffix);
    }
    if (prefix) {
        ranges = editRanges(ranges, start, start, prefix.length, false);
        chars.splice(start, 0, ...prefix);
    }
    start += prefix.length;
    end += prefix.length;
    return {text: chars.join(''), format: normalize([...ranges, {type: 'code', start, end}]), start, end};
}

export function byteOffsets(text) {
    const offsets = [0];
    let bytes = 0;
    for (const character of characters(text)) {
        const point = character.codePointAt(0);
        bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
        offsets.push(bytes);
    }
    return offsets;
}
