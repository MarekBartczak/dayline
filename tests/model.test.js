import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../model.js';

const timestamp = '2026-10-12T08:00:00.000Z';
const task = (id, date, done = false, inProgress = false) => ({id, text: `Task ${id}`, date, done, inProgress, createdAt: timestamp});
const empty = () => ({version: 3, tasks: [], notes: []});

test('local dates use local timezone, with leap-day and strict date validation', () => {
    assert.equal(m.localDate(new Date(2026, 9, 12, 23, 59)), '2026-10-12');
    for (const date of ['2024-02-29', '2026-10-12', '2000-02-29'])
        assert.equal(m.isDate(date), true);
    for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'x', null, '1900-02-29'])
        assert.equal(m.isDate(date), false);
});

test('day navigation survives DST boundaries and year changes', () => {
    assert.equal(m.shiftDate('2026-03-28', 1), '2026-03-29');
    assert.equal(m.shiftDate('2026-03-29', 1), '2026-03-30');
    assert.equal(m.shiftDate('2026-10-25', -1), '2026-10-24');
    assert.equal(m.shiftDate('2026-12-31', 1), '2027-01-01');
    assert.equal(m.shiftDate('2024-03-01', -1), '2024-02-29');
    assert.throws(() => m.shiftDate('2026-02-31', 1));
});

test('month grid starts Monday and contains the complete month', () => {
    const days = m.monthDays('2026-10-12');
    assert.equal(days.length, 42);
    assert.equal(days[0], '2026-09-28');
    assert.equal(days.at(-1), '2026-11-08');
    assert.equal(new Set(days).size, 42);
});

test('today count excludes overdue, completed, undated notes and future tasks', () => {
    const data = {...empty(), tasks: [task('a', '2026-10-12'), task('b', '2026-10-12', true), task('c', '2026-10-11'), task('d', '2026-10-13')]};
    assert.deepEqual(m.todaySummary(data, '2026-10-12'), {remaining: 1, total: 2, done: 1, inProgress: 0, waiting: 1});
    assert.deepEqual(m.overdueTasks(data, '2026-10-12').map(t => t.id), ['c']);
    assert.deepEqual(m.tasksForDate(data, '2026-10-12').map(t => t.id), ['a', 'b']);
    assert.equal(m.todaySummary(data, '2026-10-13').remaining, 1);
    assert.deepEqual(m.overdueTasks(data, '2026-10-13').map(t => t.id), ['c', 'a']);
});

test('task CRUD is immutable, trims text, supports reopen and reschedule', () => {
    const data = empty();
    const added = m.addTask(data, {id: 'a', text: '  Zadzwonić do klienta  ', date: '2026-10-12', createdAt: timestamp});
    assert.equal(data.tasks.length, 0);
    assert.equal(added.tasks[0].text, 'Zadzwonić do klienta');
    const edited = m.updateTask(added, 'a', {text: 'Nowy tekst', done: true, date: '2026-10-13'});
    assert.equal(added.tasks[0].done, false);
    assert.equal(edited.tasks[0].date, '2026-10-13');
    assert.equal(m.updateTask(edited, 'a', {done: false}).tasks[0].done, false);
    assert.equal(m.removeItem(edited, 'tasks', 'a').tasks.length, 0);
    assert.throws(() => m.updateTask(added, 'a', {date: '2026-02-30'}));
    assert.throws(() => m.updateTask(added, 'a', {text: '   '}));
    assert.throws(() => m.updateTask(added, 'missing', {text: 'test'}));
    assert.throws(() => m.addTask(added, {id: 'a', text: 'duplicate', date: '2026-10-12', createdAt: timestamp}));
});

test('long tasks preserve complete text when added, edited and reloaded', () => {
    const text = 'Integration detail.\n'.repeat(2000);
    const added = m.addTask(empty(), {id: 'long', text, date: '2026-10-12', createdAt: timestamp});
    const changed = `${text}End of the description.`;
    const edited = m.updateTask(added, 'long', {text: changed});
    assert.equal(m.validateDocument(JSON.parse(JSON.stringify(edited))).tasks[0].text, changed);
    assert.throws(() => m.updateTask(edited, 'long', {text: 'x'.repeat(m.MAX_TASK_TEXT + 1)}));
});

test('notes preserve literal markup and multiline text without a task date', () => {
    const data = m.addNote(empty(), {id: 'note', text: '<b>Not markup</b>\nSecond line', createdAt: timestamp});
    assert.equal(data.notes[0].text, '<b>Not markup</b>\nSecond line');
    assert.equal(data.notes[0].date, undefined);
    const edited = m.updateNote(data, 'note', {text: 'Updated\nText'});
    assert.equal(edited.notes[0].text, 'Updated\nText');
    assert.equal(m.removeItem(edited, 'notes', 'note').notes.length, 0);
    assert.equal(m.restoreItem(empty(), 'notes', edited.notes[0]).notes.length, 1);
});

test('import validates whole document and rejects destructive invalid data', () => {
    const valid = {...empty(), tasks: [task('a', '2026-10-12')]};
    assert.deepEqual(m.validateDocument(valid), valid);
    const invalid = [null, [], {}, {...valid, version: 4}, {...valid, tasks: [task('a', '2026-02-30')]},
        {...valid, tasks: [{...task('a', '2026-10-12'), done: 'yes'}]},
        {...valid, tasks: [task('a', '2026-10-12'), task('a', '2026-10-13')]},
        {...valid, notes: [{id: 'a', text: 'collision', createdAt: timestamp}]},
        {...valid, tasks: [{...task('a', '2026-10-12'), text: ''}]},
        {...valid, tasks: [{...task('a', '2026-10-12'), createdAt: 'bad'}]},
        {...valid, notes: [{id: 'n', text: 'x', createdAt: timestamp, date: '2026-10-12'}]}];
    for (const value of invalid)
        assert.throws(() => m.validateDocument(value));
});

test('validated output is detached and never silently drops fields', () => {
    const original = {...empty(), tasks: [task('a', '2026-10-12')]};
    const copy = m.validateDocument(original);
    copy.tasks[0].text = 'changed';
    assert.equal(original.tasks[0].text, 'Task a');
    assert.throws(() => m.validateDocument({...original, unexpected: 'value'}));
});

test('v1 imports migrate every task to v3 without changing original records or notes', () => {
    const legacyTask = (id, done) => ({id, text: `  Task ${id}  `, date: '2026-10-12', done, createdAt: timestamp});
    const original = {version: 1, tasks: [legacyTask('waiting', false), legacyTask('done', true)],
        notes: [{id: 'n', text: '  First line\n<b>literal markup</b>\n', createdAt: timestamp}]};
    const snapshot = structuredClone(original);
    const migrated = m.validateDocument(original);
    assert.deepEqual(migrated, {version: 3, tasks: original.tasks.map(item => ({...item, inProgress: false})), notes: original.notes});
    assert.deepEqual(original, snapshot);
    assert.deepEqual(m.validateDocument(JSON.parse(JSON.stringify(migrated))), migrated);
    assert.notEqual(migrated.tasks[0], original.tasks[0]);
    assert.notEqual(migrated.notes[0], original.notes[0]);
    migrated.notes[0].text = 'edited';
    assert.deepEqual(original, snapshot);
    assert.deepEqual(m.emptyDocument(), empty());
});

test('all document versions enforce exact status fields and reject contradictory status', () => {
    const valid = {...empty(), tasks: [task('a', '2026-10-12', false, true)]};
    assert.deepEqual(m.validateDocument(valid), valid);
    const missingStatus = {...valid.tasks[0]};
    delete missingStatus.inProgress;
    for (const document of [
        {...valid, version: 1},
        {...valid, tasks: [missingStatus]},
        {...valid, tasks: [{...valid.tasks[0], inProgress: 'yes'}]},
        {...valid, tasks: [{...valid.tasks[0], done: true}]},
        {...valid, tasks: [{...valid.tasks[0], status: 'active'}]},
        {...valid, version: 2, tasks: [missingStatus]},
        {...valid, version: 2, tasks: [{...valid.tasks[0], done: true}]},
    ])
        assert.throws(() => m.validateDocument(document));
});

test('tasks transition between waiting, in progress and done without mutating input', () => {
    const added = m.addTask(empty(), {id: 'a', text: 'Start', date: '2026-10-12', createdAt: timestamp});
    assert.equal(added.tasks[0].inProgress, false);
    const active = m.updateTask(added, 'a', {inProgress: true});
    assert.equal(active.tasks[0].inProgress, true);
    assert.equal(added.tasks[0].inProgress, false);
    assert.equal(m.updateTask(active, 'a', {text: 'Renamed'}).tasks[0].inProgress, true);
    assert.equal(m.updateTask(active, 'a', {inProgress: false}).tasks[0].inProgress, false);
    const done = m.updateTask(active, 'a', {done: true});
    assert.equal(done.tasks[0].done, true);
    assert.equal(done.tasks[0].inProgress, false);
    assert.equal(m.updateTask(active, 'a', {done: true, inProgress: true}).tasks[0].inProgress, false);
    const reopened = m.updateTask(done, 'a', {done: false});
    assert.equal(reopened.tasks[0].done, false);
    assert.equal(reopened.tasks[0].inProgress, false);
    assert.equal(m.updateTask(done, 'a', {done: false, inProgress: true}).tasks[0].inProgress, true);
    assert.throws(() => m.updateTask(done, 'a', {inProgress: true}));
    assert.throws(() => m.updateTask(active, 'a', {inProgress: 1}));
});

test('today separates active and waiting tasks and orders active, waiting, then completed', () => {
    const data = {...empty(), tasks: [
        task('waiting', '2026-10-12'),
        task('done', '2026-10-12', true),
        {...task('active-later', '2026-10-12', false, true), createdAt: '2026-10-12T09:00:00.000Z'},
        task('active-first', '2026-10-12', false, true),
        task('overdue-active', '2026-10-11', false, true),
        task('future-waiting', '2026-10-13'),
    ]};
    assert.deepEqual(m.todaySummary(data, '2026-10-12'), {remaining: 3, total: 4, done: 1, inProgress: 2, waiting: 1});
    assert.deepEqual(m.tasksForDate(data, '2026-10-12').map(item => item.id), ['active-first', 'active-later', 'waiting', 'done']);
    assert.equal(data.tasks[0].id, 'waiting');
    assert.deepEqual(m.todaySummary(data, '2026-10-14'), {remaining: 0, total: 0, done: 0, inProgress: 0, waiting: 0});
    assert.deepEqual(m.overdueTasks(data, '2026-10-12').map(item => item.id), ['overdue-active']);
});

test('formatted public entries preserve exact whitespace and detached annotations', () => {
    const format = [{type: 'code', start: 0, end: 9}];
    const added = m.addTask(empty(), {id: 'code', text: '  a\n\tb  \n', format, date: '2026-10-12', createdAt: timestamp});
    assert.equal(added.tasks[0].text, '  a\n\tb  \n');
    assert.deepEqual(added.tasks[0].format, format);
    added.tasks[0].format[0].start = 1;
    assert.equal(format[0].start, 0);
    const note = m.addNote(empty(), {id: 'n', text: '  text\n', format: [], createdAt: timestamp});
    assert.equal(note.notes[0].text, '  text\n');
    assert.deepEqual(note.notes[0].format, []);
    assert.equal(m.updateNote(note, 'n', {text: '\t edited \n', format: []}).notes[0].text, '\t edited \n');
});

test('editing annotations implicitly remaps ranges while explicit formats replace them', () => {
    const added = m.addTask(empty(), {id: 'a', text: 'a😀bc', format: [{type: 'bold', start: 1, end: 3}], date: '2026-10-12', createdAt: timestamp});
    const edited = m.updateTask(added, 'a', {text: 'Xa😀bc'});
    assert.deepEqual(edited.tasks[0].format, [{type: 'bold', start: 2, end: 4}]);
    assert.deepEqual(m.updateTask(edited, 'a', {format: []}).tasks[0].format, []);
    assert.deepEqual(m.updateTask(edited, 'a', {done: true}).tasks[0].format, edited.tasks[0].format);
    assert.equal(Object.hasOwn(m.addNote(empty(), {id: 'p', text: 'plain', createdAt: timestamp}).notes[0], 'format'), false);
});

test('implicit edits of formatted entries preserve indentation and trailing newlines', () => {
    const format = [{type: 'code', start: 0, end: 7}];
    const added = m.addNote(empty(), {id: 'code', text: '  code\n', format, createdAt: timestamp});
    const edited = m.updateNote(added, 'code', {text: '  code!\n'});
    assert.equal(edited.notes[0].text, '  code!\n');
    assert.deepEqual(edited.notes[0].format, [{type: 'code', start: 0, end: 8}]);
    assert.equal(added.notes[0].text, '  code\n');
    const task = m.addTask(empty(), {id: 'formatted', text: '  text\n', format: [], date: '2026-10-12', createdAt: timestamp});
    assert.equal(m.updateTask(task, 'formatted', {text: '\t changed \n'}).tasks[0].text, '\t changed \n');
    const plain = m.addNote(empty(), {id: 'plain', text: 'plain', createdAt: timestamp});
    assert.equal(m.updateNote(plain, 'plain', {text: '\t changed \n'}).notes[0].text, 'changed');
});

test('document validation rejects invalid optional formats and keeps legacy formatting', () => {
    const original = {...empty(), tasks: [{...task('a', '2026-10-12'), text: 'A😀b', format: [{type: 'bold', start: 1, end: 2}]}]};
    assert.deepEqual(m.validateDocument(original), original);
    const copy = m.validateDocument(original);
    copy.tasks[0].format[0].end = 3;
    assert.equal(original.tasks[0].format[0].end, 2);
    for (const format of [null, undefined, {}, [{type: 'code', start: 0, end: 4}], [{type: 'color', start: 0, end: 1}], [{type: 'bold', start: 0, end: 1, markup: 'x'}]])
        assert.throws(() => m.validateDocument({...original, tasks: [{...original.tasks[0], format}]}));
    const legacy = {...original.tasks[0]};
    delete legacy.inProgress;
    assert.deepEqual(m.validateDocument({version: 1, tasks: [legacy], notes: []}).tasks[0].format, legacy.format);
});

test('formatted 50k task documents round trip and reject oversized text', () => {
    const text = ` ${'x'.repeat(m.MAX_TASK_TEXT - 3)}\t\n`;
    const format = [{type: 'code', start: 0, end: text.length}];
    const added = m.addTask(empty(), {id: 'long-format', text, format, date: '2026-10-12', createdAt: timestamp});
    assert.equal(m.validateDocument(JSON.parse(JSON.stringify(added))).tasks[0].text, text);
    assert.throws(() => m.updateTask(added, 'long-format', {text: `${text}x`, format: []}));
});

const imageMarker = '\uFFFC';
const image = offset => ({id: 'a'.repeat(64), name: 'photo.png', mime: 'image/png', width: 640, height: 480, size: 1200, offset});

test('v2 documents migrate to v3 without changing text, statuses, formatting or input bytes', () => {
    const original = {version: 2, tasks: [{...task('a', '2026-10-12', false, true), text: '  task\n', format: []}],
        notes: [{id: 'n', text: '  note\n', createdAt: timestamp}]};
    const bytes = JSON.stringify(original);
    assert.deepEqual(m.validateDocument(original), {...original, version: 3});
    assert.equal(JSON.stringify(original), bytes);
});

test('image tasks preserve exact whitespace and allow image-only tasks', () => {
    const text = ` \n${imageMarker}\n `;
    const images = [image(2)];
    const added = m.addTask(empty(), {id: 'picture', text, images, date: '2026-10-12', createdAt: timestamp});
    assert.equal(added.tasks[0].text, text);
    assert.deepEqual(added.tasks[0].images, images);
    added.tasks[0].images[0].name = 'changed';
    assert.equal(images[0].name, 'photo.png');
    const only = m.addTask(empty(), {id: 'only', text: imageMarker, images: [image(0)], date: '2026-10-12', createdAt: timestamp});
    assert.equal(m.todaySummary(only, '2026-10-12').remaining, 1);
    assert.equal(m.validateDocument(JSON.parse(JSON.stringify(only))).tasks[0].text, imageMarker);
    assert.equal(m.addTask(empty(), {id: 'empty-images', text: '  text\n', images: [], date: '2026-10-12', createdAt: timestamp}).tasks[0].text, '  text\n');
});

test('task text edits remap images while explicit images replace references', () => {
    const added = m.addTask(empty(), {id: 'picture', text: `😀${imageMarker}\n`, images: [image(1)], format: [], date: '2026-10-12', createdAt: timestamp});
    const moved = m.updateTask(added, 'picture', {text: ` X😀${imageMarker}\n`});
    assert.equal(moved.tasks[0].text, ` X😀${imageMarker}\n`);
    assert.deepEqual(moved.tasks[0].images, [image(3)]);
    assert.deepEqual(added.tasks[0].images, [image(1)]);
    assert.deepEqual(m.updateTask(moved, 'picture', {text: 'plain'}).tasks[0].images, []);
    const changed = m.updateTask(moved, 'picture', {text: imageMarker, images: [image(0)]});
    assert.deepEqual(changed.tasks[0].images, [image(0)]);
    assert.deepEqual(m.updateTask(changed, 'picture', {done: true}).tasks[0].images, [image(0)]);
    const removed = m.removeItem(changed, 'tasks', 'picture');
    assert.deepEqual(m.restoreItem(removed, 'tasks', changed.tasks[0]).tasks[0], changed.tasks[0]);
});

test('image references are task-only, require v3 and cover every image marker', () => {
    const picture = {...task('a', '2026-10-12'), text: imageMarker, images: [image(0)]};
    for (const version of [1, 2]) {
        const legacy = {...picture};
        if (version === 1)
            delete legacy.inProgress;
        assert.throws(() => m.validateDocument({version, tasks: [legacy], notes: []}));
    }
    assert.throws(() => m.validateDocument({...empty(), tasks: [{...picture, images: []}]}));
    assert.throws(() => m.validateDocument({...empty(), tasks: [{...picture, images: undefined}]}));
    assert.throws(() => m.validateDocument({...empty(), notes: [{id: 'n', text: imageMarker, createdAt: timestamp, images: [image(0)]}]}));
    assert.throws(() => m.addNote(empty(), {id: 'n', text: imageMarker, createdAt: timestamp, images: [image(0)]}));
    const note = m.addNote(empty(), {id: 'n', text: 'note', createdAt: timestamp});
    assert.throws(() => m.updateNote(note, 'n', {images: []}));
    const legacyMarker = {...task('legacy', '2026-10-12'), text: `literal ${imageMarker}`};
    assert.equal(m.validateDocument({version: 2, tasks: [legacyMarker], notes: []}).tasks[0].text, legacyMarker.text);
});

test('image tasks keep the existing UTF-16 50k text limit', () => {
    const text = `${'😀'.repeat(24999)}x${imageMarker}`;
    assert.equal(text.length, m.MAX_TASK_TEXT);
    const added = m.addTask(empty(), {id: 'large', text, images: [image(25000)], date: '2026-10-12', createdAt: timestamp});
    assert.equal(added.tasks[0].text, text);
    assert.throws(() => m.updateTask(added, 'large', {text: `${text}x`}));
});
