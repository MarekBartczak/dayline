// Pure domain logic shared by GNOME Shell, preferences and Node tests.
export const MAX_TASK_TEXT = 2000;
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
        throw new Error('Wybierz prawidłową datę (RRRR-MM-DD).');
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
}

export function shiftDate(value, days) {
    const date = parseDate(value);
    date.setDate(date.getDate() + days);
    const result = localDate(date);
    if (!isDate(result))
        throw new Error('Data poza obsługiwanym zakresem.');
    return result;
}

export function shiftMonth(value, months) {
    const date = parseDate(value);
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const result = localDate(date);
    if (!isDate(result))
        throw new Error('Data poza obsługiwanym zakresem.');
    return result;
}

export function monthDays(value) {
    const first = parseDate(value);
    first.setDate(1);
    first.setDate(1 - (first.getDay() + 6) % 7);
    return Array.from({length: 42}, (_, i) => shiftDate(localDate(first), i));
}

export function emptyDocument() {
    return {version: 1, tasks: [], notes: []};
}

function exactKeys(object, keys) {
    if (!object || typeof object !== 'object' || Array.isArray(object) ||
        Object.keys(object).length !== keys.length || keys.some(key => !Object.hasOwn(object, key)))
        throw new Error('Nieprawidłowy format danych Dayline.');
}

function cleanText(text, limit) {
    if (typeof text !== 'string' || !text.trim())
        throw new Error('Wpisz treść przed zapisaniem.');
    if (text.length > limit)
        throw new Error(`Treść może mieć najwyżej ${limit} znaków.`);
    return text.trim();
}

export function validateDocument(document) {
    exactKeys(document, ['version', 'tasks', 'notes']);
    if (document.version !== 1 || !Array.isArray(document.tasks) || !Array.isArray(document.notes))
        throw new Error('Nieobsługiwana wersja lub format pliku Dayline.');
    if (document.tasks.length + document.notes.length > 10000)
        throw new Error('Plik zawiera zbyt wiele wpisów (limit: 10 000).');
    const ids = new Set();
    const validate = (item, kind) => {
        exactKeys(item, kind === 'tasks' ? ['id', 'text', 'date', 'done', 'createdAt'] : ['id', 'text', 'createdAt']);
        if (typeof item.id !== 'string' || !item.id || item.id.length > 128 || ids.has(item.id))
            throw new Error('Nieprawidłowy lub powtórzony identyfikator wpisu.');
        ids.add(item.id);
        if (typeof item.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(item.createdAt) || !Number.isFinite(Date.parse(item.createdAt)))
            throw new Error('Nieprawidłowa data utworzenia wpisu.');
        if (kind === 'tasks' && (!isDate(item.date) || typeof item.done !== 'boolean'))
            throw new Error('Nieprawidłowa data lub status zadania.');
        return {...item, text: cleanText(item.text, kind === 'tasks' ? MAX_TASK_TEXT : MAX_NOTE_TEXT)};
    };
    return {version: 1, tasks: document.tasks.map(item => validate(item, 'tasks')), notes: document.notes.map(item => validate(item, 'notes'))};
}

export function addTask(data, item) {
    return validateDocument({...data, tasks: [...data.tasks, {...item, done: false}]});
}

export function addNote(data, item) {
    return validateDocument({...data, notes: [...data.notes, item]});
}

function update(data, kind, id, patch) {
    if (!data[kind].some(item => item.id === id))
        throw new Error('Ten wpis już nie istnieje.');
    const allowed = kind === 'tasks' ? ['text', 'date', 'done'] : ['text'];
    if (Object.keys(patch).some(key => !allowed.includes(key)))
        throw new Error('Nieprawidłowe pola aktualizacji.');
    return validateDocument({...data, [kind]: data[kind].map(item => item.id === id ? {...item, ...patch} : item)});
}

export const updateTask = (data, id, patch) => update(data, 'tasks', id, patch);
export const updateNote = (data, id, patch) => update(data, 'notes', id, patch);

export function removeItem(data, kind, id) {
    if (!['tasks', 'notes'].includes(kind))
        throw new Error('Nieprawidłowy rodzaj wpisu.');
    return validateDocument({...data, [kind]: data[kind].filter(item => item.id !== id)});
}

export function restoreItem(data, kind, item) {
    if (!['tasks', 'notes'].includes(kind))
        throw new Error('Nieprawidłowy rodzaj wpisu.');
    return validateDocument({...data, [kind]: [...data[kind], item]});
}

export function tasksForDate(data, date) {
    return data.tasks.filter(item => item.date === date)
        .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt.localeCompare(b.createdAt));
}

export function overdueTasks(data, today = localDate()) {
    return data.tasks.filter(item => !item.done && item.date < today)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

export function todaySummary(data, today = localDate()) {
    const tasks = tasksForDate(data, today);
    const done = tasks.filter(item => item.done).length;
    return {remaining: tasks.length - done, total: tasks.length, done};
}
