import assert from 'node:assert/strict';
import test from 'node:test';
import { formatChecklistDate, getNextChecklistDueDate } from '../lib/checklist-time.js';
import { toAssignedChecklists } from '../lib/server/assigned-checklists.mjs';

const weekly = (weekday, overrides = {}) => ({ id: `weekly-${weekday}`, task: 'Weekly', frequency: 'weekly', weekday, start_date: '2026-11-06', due_time: '11:00:00', ...overrides });
const monthly = (days, overrides = {}) => ({ id: 'monthly', task: 'Monthly', frequency: 'monthly', day_of_month: days[0], monthly_days: days, start_date: '2026-11-06', due_time: '11:00:00', ...overrides });

test('finds the next weekly and monthly dates after the assignment day', () => {
  assert.equal(getNextChecklistDueDate(weekly(1), '2026-11-06'), '2026-11-09');
  assert.equal(getNextChecklistDueDate(monthly([2]), '2026-11-06'), '2026-12-02');
});

test('counts today when the checklist is due today', () => {
  assert.equal(getNextChecklistDueDate(weekly(5), '2026-11-06'), '2026-11-06');
});

test('waits for a future start date', () => {
  assert.equal(getNextChecklistDueDate({ frequency: 'daily', start_date: '2026-11-20' }, '2026-11-06'), '2026-11-20');
});

test('skips Sundays because generation deactivates them', () => {
  assert.equal(getNextChecklistDueDate({ frequency: 'daily', start_date: '2026-11-01' }, '2026-11-08'), '2026-11-09');
  assert.equal(getNextChecklistDueDate(monthly([1], { start_date: '2026-11-01' }), '2026-11-01'), '2026-12-01');
});

test('skips holidays and leave', () => {
  assert.equal(getNextChecklistDueDate(weekly(1), '2026-11-06', new Set(['2026-11-09'])), '2026-11-16');
});

test('returns null for a schedule that can never become an open item', () => {
  assert.equal(getNextChecklistDueDate(weekly(0), '2026-11-06'), null);
});

test('formats due dates relative to today', () => {
  assert.equal(formatChecklistDate('2026-11-06', '2026-11-06'), 'Today');
  assert.equal(formatChecklistDate('2026-11-07', '2026-11-06'), 'Tomorrow');
  assert.equal(formatChecklistDate('2026-11-09', '2026-11-06'), 'Mon, 9 Nov');
  assert.equal(formatChecklistDate(null, '2026-11-06'), 'No upcoming date');
});

test('sorts soonest first, keeps undated checklists last and moves past a finished item', () => {
  const rows = toAssignedChecklists({
    templates: [monthly([2]), weekly(0, { id: 'sunday-only' }), weekly(5, { id: 'finished-today' }), weekly(1)],
    today: '2026-11-06',
    nonWorkingDates: new Set(),
    finishedTodayIds: new Set(['finished-today']),
  });
  assert.deepEqual(rows.map((row) => [row.id, row.next_due_date]), [
    ['weekly-1', '2026-11-09'],
    ['finished-today', '2026-11-13'],
    ['monthly', '2026-12-02'],
    ['sunday-only', null],
  ]);
});
