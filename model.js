// Pure domain logic shared by GNOME Shell, preferences and Node tests.
export const MAX_TASK_TEXT = 50000;
export const MAX_NOTE_TEXT = 10000;
const pad = number => String(number).padStart(2, '0');

export function localDate(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isDate(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))
        return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseDate(value) {
    if (!isDate(value))
        throw new Error('Choose a valid date (YYYY-MM-DD).');
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
}

export function shiftDate(value, days) {
    const date = parseDate(value);
    date.setDate(date.getDate() + days);
    const result = localDate(date);
    if (!isDate(result))
        throw new Error('Date is outside the supported range.');
    return result;
}

export function shiftMonth(value, months) {
    const date = parseDate(value);
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const result = localDate(date);
    if (!isDate(result))
        throw new Error('Date is outside the supported range.');
    return result;
}

export function monthDays(value) {
    const first = parseDate(value);
    first.setDate(1);
    first.setDate(1 - (first.getDay() + 6) % 7);
    return Array.from({length: 42}, (_, i) => shiftDate(localDate(first), i));
}

export function emptyDocument() {
    return {version: 2, tasks: [], notes: []};
}

function exactKeys(object, keys) {
    if (!object || typeof object !== 'object' || Array.isArray(object) ||
        Object.keys(object).length !== keys.length || keys.some(key => !Object.hasOwn(object, key)))
        throw new Error('Invalid Dayline data format.');
}

function cleanText(text, limit) {
    if (typeof text !== 'string' || !text.trim())
        throw new Error('Enter text before saving.');
    if (text.length > limit)
        throw new Error(`Text must be no longer than ${limit} characters.`);
    return text.trim();
}

export function validateDocument(document) {
    exactKeys(document, ['version', 'tasks', 'notes']);
    if (![1, 2].includes(document.version) || !Array.isArray(document.tasks) || !Array.isArray(document.notes))
        throw new Error('Unsupported Dayline file version or format.');
    if (document.tasks.length + document.notes.length > 10000)
        throw new Error('File contains too many entries (limit: 10,000).');
    const ids = new Set();
    const validate = (item, kind) => {
        const taskKeys = ['id', 'text', 'date', 'done', 'createdAt'];
        if (document.version === 2)
            taskKeys.push('inProgress');
        exactKeys(item, kind === 'tasks' ? taskKeys : ['id', 'text', 'createdAt']);
        if (typeof item.id !== 'string' || !item.id || item.id.length > 128 || ids.has(item.id))
            throw new Error('Invalid or duplicate entry ID.');
        ids.add(item.id);
        if (typeof item.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(item.createdAt) || !Number.isFinite(Date.parse(item.createdAt)))
            throw new Error('Invalid entry creation date.');
        if (kind === 'tasks' && (!isDate(item.date) || typeof item.done !== 'boolean'))
            throw new Error('Invalid task date or status.');
        if (kind === 'tasks' && document.version === 2 &&
            (typeof item.inProgress !== 'boolean' || item.done && item.inProgress))
            throw new Error('Invalid task status. Completed tasks cannot be in progress.');
        // Validate existing text without altering data imported from either version.
        cleanText(item.text, kind === 'tasks' ? MAX_TASK_TEXT : MAX_NOTE_TEXT);
        return kind === 'tasks' ? {...item, inProgress: document.version === 1 ? false : item.inProgress} : {...item};
    };
    return {version: 2, tasks: document.tasks.map(item => validate(item, 'tasks')), notes: document.notes.map(item => validate(item, 'notes'))};
}

export function addTask(data, item) {
    const document = validateDocument(data);
    return validateDocument({...document, tasks: [...document.tasks, {...item, text: cleanText(item.text, MAX_TASK_TEXT), done: false, inProgress: false}]});
}

export function addNote(data, item) {
    const document = validateDocument(data);
    return validateDocument({...document, notes: [...document.notes, {...item, text: cleanText(item.text, MAX_NOTE_TEXT)}]});
}

function update(data, kind, id, patch) {
    data = validateDocument(data);
    if (!data[kind].some(item => item.id === id))
        throw new Error('This entry no longer exists.');
    const allowed = kind === 'tasks' ? ['text', 'date', 'done', 'inProgress'] : ['text'];
    if (Object.keys(patch).some(key => !allowed.includes(key)))
        throw new Error('Invalid update fields.');
    patch = {...patch};
    if (Object.hasOwn(patch, 'text'))
        patch.text = cleanText(patch.text, kind === 'tasks' ? MAX_TASK_TEXT : MAX_NOTE_TEXT);
    if (kind === 'tasks' && patch.done === true)
        patch.inProgress = false;
    return validateDocument({...data, [kind]: data[kind].map(item => item.id === id ? {...item, ...patch} : item)});
}

export const updateTask = (data, id, patch) => update(data, 'tasks', id, patch);
export const updateNote = (data, id, patch) => update(data, 'notes', id, patch);

export function removeItem(data, kind, id) {
    if (!['tasks', 'notes'].includes(kind))
        throw new Error('Invalid entry type.');
    data = validateDocument(data);
    return validateDocument({...data, [kind]: data[kind].filter(item => item.id !== id)});
}

export function restoreItem(data, kind, item) {
    if (!['tasks', 'notes'].includes(kind))
        throw new Error('Invalid entry type.');
    data = validateDocument(data);
    return validateDocument({...data, [kind]: [...data[kind], item]});
}

export function tasksForDate(data, date) {
    const statusOrder = task => task.done ? 2 : task.inProgress ? 0 : 1;
    return data.tasks.filter(item => item.date === date)
        .sort((a, b) => statusOrder(a) - statusOrder(b) || a.createdAt.localeCompare(b.createdAt));
}

export function overdueTasks(data, today = localDate()) {
    return data.tasks.filter(item => !item.done && item.date < today)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

export function todaySummary(data, today = localDate()) {
    const tasks = tasksForDate(data, today);
    const done = tasks.filter(item => item.done).length;
    const inProgress = tasks.filter(item => !item.done && item.inProgress).length;
    const remaining = tasks.length - done;
    return {remaining, total: tasks.length, done, inProgress, waiting: remaining - inProgress};
}
