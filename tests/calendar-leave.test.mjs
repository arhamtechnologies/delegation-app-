import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEmployeeLeave, getSavedLeaveDates } from '../lib/calendar-leave.mjs';
import { getTodayInIndia } from '../lib/checklist-time.js';

const today = '2026-09-23';
const baseGroups = [
  { employeeId: 'employee-a', dates: ['2026-09-19'] },
  { employeeId: 'employee-b', dates: ['2026-09-23'] },
];

function replaceDates(groups, employeeId, dates) {
  const remaining = groups.filter((group) => group.employeeId !== employeeId);
  return [...remaining, { employeeId, dates }];
}

test('calendar leave: today includes only dates equal to the India business date', () => {
  assert.deepEqual(classifyEmployeeLeave(baseGroups, today).today.map(({ dateValue }) => dateValue), ['2026-09-23']);
});

test('calendar leave: earlier includes only dates before today', () => {
  assert.deepEqual(classifyEmployeeLeave(baseGroups, today).earlier.map(({ dateValue }) => dateValue), ['2026-09-19']);
});

test('calendar leave: a multi-day selection spanning today is split correctly', () => {
  const result = classifyEmployeeLeave([{ employeeId: 'employee-a', dates: ['2026-09-22', '2026-09-23', '2026-09-24'] }], today);
  assert.deepEqual({ earlier: result.earlier.length, today: result.today.length, future: result.future.length }, { earlier: 1, today: 1, future: 1 });
});

test('calendar leave: adding today preserves earlier dates', () => {
  const dates = getSavedLeaveDates(['2026-09-19'], [today]);
  const result = classifyEmployeeLeave(replaceDates([], 'employee-a', dates), today);
  assert.deepEqual({ earlier: result.earlier.length, today: result.today.length }, { earlier: 1, today: 1 });
});

test('calendar leave: adding an earlier date preserves today', () => {
  const dates = getSavedLeaveDates([today], ['2026-09-19']);
  const result = classifyEmployeeLeave(replaceDates([], 'employee-a', dates), today);
  assert.deepEqual({ earlier: result.earlier.length, today: result.today.length }, { earlier: 1, today: 1 });
});

test('calendar leave: editing earlier into today moves classifications', () => {
  const dates = getSavedLeaveDates(['2026-09-19'], [today], { editing: true });
  const result = classifyEmployeeLeave(replaceDates([], 'employee-a', dates), today);
  assert.deepEqual({ earlier: result.earlier.length, today: result.today.length }, { earlier: 0, today: 1 });
});

test('calendar leave: editing today into earlier moves classifications', () => {
  const dates = getSavedLeaveDates([today], ['2026-09-19'], { editing: true });
  const result = classifyEmployeeLeave(replaceDates([], 'employee-a', dates), today);
  assert.deepEqual({ earlier: result.earlier.length, today: result.today.length }, { earlier: 1, today: 0 });
});

test('calendar leave: removing today does not remove earlier dates', () => {
  const result = classifyEmployeeLeave(replaceDates([], 'employee-a', ['2026-09-19']), today);
  assert.deepEqual({ earlier: result.earlier.length, today: result.today.length }, { earlier: 1, today: 0 });
});

test('calendar leave: removing earlier does not remove today', () => {
  const result = classifyEmployeeLeave(replaceDates([], 'employee-a', [today]), today);
  assert.deepEqual({ earlier: result.earlier.length, today: result.today.length }, { earlier: 0, today: 1 });
});

test('calendar leave: Asia/Kolkata advances the date before UTC midnight', () => {
  assert.equal(getTodayInIndia(new Date('2026-09-22T18:29:59.999Z')), '2026-09-22');
  assert.equal(getTodayInIndia(new Date('2026-09-22T18:30:00.000Z')), '2026-09-23');
});
