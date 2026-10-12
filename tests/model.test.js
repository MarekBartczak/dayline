import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../model.js';

const timestamp = '2026-10-12T08:00:00.000Z';
const task = (id, date, done = false) => ({id, text: `Task ${id}`, date, done, createdAt: timestamp});
const empty = () => ({version: 1, tasks: [], notes: []});

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
    assert.deepEqual(m.todaySummary(data, '2026-10-12'), {remaining: 1, total: 2, done: 1});
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
    const invalid = [null, [], {}, {...valid, version: 2}, {...valid, tasks: [task('a', '2026-02-30')]},
        {...valid, tasks: [{...task('a', '2026-10-12'), done: 'yes'}]},
        {...valid, tasks: [task('a', '2026-10-12'), task('a', '2026-10-13')]},
        {...valid, notes: [{id: 'a', text: 'collision', createdAt: timestamp}]},
        {...valid, tasks: [{...task('a', '2026-10-12'), text: ''}]},
        {...valid, tasks: [{...task('a', '2026-10-12'), createdAt: 'bad'}]},
        {...valid, notes: [{id: 'n', text: 'x', createdAt: timestamp, date: '2026-10-12'}]}];
    for (const value of invalid)
        assert.throws(() => m.validateDocument(value));
});

test('backup output is normalized, detached and never silently drops fields', () => {
    const original = {...empty(), tasks: [task('a', '2026-10-12')]};
    const copy = m.validateDocument(original);
    copy.tasks[0].text = 'changed';
    assert.equal(original.tasks[0].text, 'Task a');
    assert.throws(() => m.validateDocument({...original, unexpected: 'value'}));
});
