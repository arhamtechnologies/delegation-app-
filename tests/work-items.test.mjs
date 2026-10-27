import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeWorkItems, getWorkItemStatus, sortWorkItemsChronologically, toChecklistWorkItem, toTaskWorkItem } from '../lib/work-items.mjs';

test('work items 1: checklist rows map to the unified shape', () => {
  const item = toChecklistWorkItem({ id: 'a', task: 'Petty cash', employee_id: 'e1', due_date: '2026-10-27', status: 'pending' });
  assert.equal(item.kind, 'checklist');
  assert.equal(item.title, 'Petty cash');
  assert.equal(item.employeeId, 'e1');
});

test('work items 2: duplicates of the same source row are dropped', () => {
  const rows = dedupeWorkItems([{ sourceType: 'task', id: '1' }, { sourceType: 'task', id: '1' }, { sourceType: 'checklist', id: '1' }]);
  assert.equal(rows.length, 2);
});

test('work items 3: status and chronological order match the app', () => {
  const now = new Date('2026-10-27T06:00:00.000Z');
  const overdue = toTaskWorkItem({ id: 't1', title: 'Old', status: 'pending', eta: '2026-10-26T13:00:00.000Z' });
  const today = toTaskWorkItem({ id: 't2', title: 'Today', status: 'pending', eta: '2026-10-27T13:00:00.000Z' });
  assert.equal(getWorkItemStatus(overdue, now), 'overdue');
  assert.equal(getWorkItemStatus(today, now), 'pending');
  assert.deepEqual(sortWorkItemsChronologically([overdue, today], now).map((item) => item.id), ['t2', 't1']);
});
