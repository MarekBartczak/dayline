// Image references share Clutter.Text's Unicode code-point coordinates.
export const IMAGE_MARKER = '\uFFFC';
const MAX_IMAGES = 20;
const ASSET_KEYS = ['id', 'name', 'mime', 'width', 'height', 'size'];
const MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

function characters(text) {
    if (typeof text !== 'string')
        throw new Error('Images require plain text.');
    return Array.from(text);
}

function validateAsset(asset, withOffset) {
    const keys = withOffset ? [...ASSET_KEYS, 'offset'] : ASSET_KEYS;
    if (!asset || typeof asset !== 'object' || Array.isArray(asset) ||
        Object.keys(asset).length !== keys.length || keys.some(key => !Object.hasOwn(asset, key)) ||
        typeof asset.id !== 'string' || !/^[a-f0-9]{64}$/.test(asset.id) ||
        typeof asset.name !== 'string' || !asset.name.trim() || asset.name.length > 255 ||
        !MIME_TYPES.includes(asset.mime) || !Number.isInteger(asset.width) || !Number.isInteger(asset.height) ||
        asset.width < 1 || asset.height < 1 || asset.width > 32768 || asset.height > 32768 ||
        asset.width * asset.height > 64000000 || !Number.isInteger(asset.size) ||
        asset.size < 1 || asset.size > 25 * 1024 * 1024)
        throw new Error('Invalid image metadata.');
}

export function validateImages(text, images = []) {
    const chars = characters(text);
    if (!Array.isArray(images) || images.length > MAX_IMAGES)
        throw new Error('Invalid image references (limit: 20 images per task).');
    const offsets = new Set();
    for (const image of images) {
        validateAsset(image, true);
        if (!Number.isInteger(image.offset) || image.offset < 0 || image.offset >= chars.length ||
            chars[image.offset] !== IMAGE_MARKER || offsets.has(image.offset))
            throw new Error('Invalid image position.');
        offsets.add(image.offset);
    }
    if (chars.some((char, offset) => char === IMAGE_MARKER && !offsets.has(offset)))
        throw new Error('An image marker has no attachment.');
    return images.map(image => ({...image})).sort((a, b) => a.offset - b.offset);
}

function editBounds(before, after, hint) {
    if (hint && Number.isInteger(hint.start) && Number.isInteger(hint.end) &&
        hint.start >= 0 && hint.start <= hint.end && hint.end <= before.length) {
        const inserted = after.length - hint.start - (before.length - hint.end);
        if (inserted >= 0 &&
            before.slice(0, hint.start).every((char, index) => char === after[index]) &&
            before.slice(hint.end).every((char, index) => char === after[hint.start + inserted + index]))
            return {start: hint.start, end: hint.end, inserted, verifiedHint: true};
    }
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start])
        start++;
    let end = before.length;
    let afterEnd = after.length;
    while (end > start && afterEnd > start && before[end - 1] === after[afterEnd - 1]) {
        end--;
        afterEnd--;
    }
    return {start, end, inserted: afterEnd - start};
}

function moveReferences(images, start, end, inserted) {
    const delta = inserted - (end - start);
    return images.filter(image => image.offset < start || image.offset >= end)
        .map(image => ({...image, offset: image.offset >= end ? image.offset + delta : image.offset}));
}

export function remapImages(before, after, images, hint = undefined) {
    const validated = validateImages(before, images);
    const afterChars = characters(after);
    const edit = editBounds(characters(before), afterChars, hint);
    // Lists and other structural operations can edit several text paragraphs
    // at once. If no verified selection removed markers and their count is
    // unchanged, their document order preserves attachment identity.
    const offsets = afterChars.flatMap((char, offset) => char === IMAGE_MARKER ? [offset] : []);
    if (!edit.verifiedHint && offsets.length === validated.length)
        return validateImages(after, validated.map((image, index) => ({...image, offset: offsets[index]})));
    return validateImages(after, moveReferences(validated, edit.start, edit.end, edit.inserted));
}

export function insertImages(text, images, assets, start, end) {
    const chars = characters(text);
    const validated = validateImages(text, images);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || end > chars.length)
        throw new Error('Invalid text selection.');
    if (!Array.isArray(assets) || !assets.length || assets.length > MAX_IMAGES)
        throw new Error('Choose between 1 and 20 images.');
    for (const asset of assets)
        validateAsset(asset, false);
    const prefix = start > 0 && chars[start - 1] !== '\n' ? '\n' : '';
    const suffix = end === chars.length || chars[end] !== '\n' ? '\n' : '';
    const inserted = `${prefix}${assets.map(() => IMAGE_MARKER).join('\n')}${suffix}`;
    const insertedLength = inserted.length;
    const resultText = [...chars.slice(0, start), ...inserted, ...chars.slice(end)].join('');
    const retained = moveReferences(validated, start, end, insertedLength);
    const added = assets.map((asset, index) => ({...asset, offset: start + prefix.length + index * 2}));
    return {text: resultText, images: validateImages(resultText, [...retained, ...added]), cursor: start + insertedLength};
}
