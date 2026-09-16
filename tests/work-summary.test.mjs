import test from 'node:test';
import assert from 'node:assert/strict';
import { filterWorkItems, getUnifiedWorkItemStatus, getWorkSummary } from '../lib/work-summary.mjs';

const now = new Date('2026-09-16T06:30:00.000Z');
const pendingTask = { id: 'task-pending', kind: 'task', assignee_id: 'employee-a', status: 'pending', eta: '2026-09-16T07:30:00.000Z' };
const overdueTask = { id: 'task-overdue', kind: 'task', assignee_id: 'employee-b', status: 'pending', eta: '2026-09-16T05:30:00.000Z' };
const completedLateTask = { id: 'task-completed', kind: 'task', assignee_id: 'employee-a', status: 'closed', eta: '2026-09-15T05:30:00.000Z', completed_at: '2026-09-16T06:00:00.000Z' };
const activeChecklist = { id: 'checklist-active', kind: 'checklist', employee_id: 'employee-a', status: 'pending', due_date: '2026-09-16', due_at: '2026-09-16T08:30:00.000Z' };
const holidayChecklist = { id: 'checklist-holiday', kind: 'checklist', employee_id: 'employee-b', status: 'deactivated', due_date: '2026-09-15', due_at: '2026-09-15T05:30:00.000Z' };

const mixedItems = [pendingTask, overdueTask, completedLateTask, activeChecklist, holidayChecklist];

test('1. pending item', () => assert.equal(getUnifiedWorkItemStatus(pendingTask, now), 'pending'));
test('2. overdue item', () => assert.equal(getUnifiedWorkItemStatus(overdueTask, now), 'overdue'));
test('3. completed past-due item keeps completion precedence', () => assert.equal(getUnifiedWorkItemStatus(completedLateTask, now), 'completed'));
test('4. deactivated checklist item is not counted', () => assert.deepEqual(getWorkSummary([holidayChecklist], now), { total: 0, pending: 0, overdue: 0, completed: 0 }));
test('5. active checklist item is classified', () => assert.equal(getUnifiedWorkItemStatus(activeChecklist, now), 'pending'));
test('6. regular task is classified', () => assert.equal(getWorkSummary([overdueTask], now).overdue, 1));
test('7. checklist occurrence is classified', () => assert.equal(getWorkSummary([activeChecklist], now).pending, 1));
test('8. mixed regular-task and checklist dataset is summarized', () => assert.deepEqual(getWorkSummary(mixedItems, now), { total: 4, pending: 2, overdue: 1, completed: 1 }));
test('9. total equals pending plus overdue plus completed', () => {
  const summary = getWorkSummary(mixedItems, now);
  assert.equal(summary.total, summary.pending + summary.overdue + summary.completed);
});
test('10. Dashboard and MIS receive the same summary for the same dataset', () => assert.deepEqual(getWorkSummary(mixedItems, now), getWorkSummary(mixedItems, now)));
test('11. MIS date filtering uses inclusive Asia/Kolkata business dates', () => assert.deepEqual(filterWorkItems(mixedItems, { from: '2026-09-16', to: '2026-09-16' }, now).map((item) => item.id), ['task-pending', 'task-overdue', 'checklist-active']));
test('12. employee filtering uses the normalized employee identity', () => assert.deepEqual(filterWorkItems(mixedItems, { employeeId: 'employee-a' }, now).map((item) => item.id), ['task-pending', 'task-completed', 'checklist-active']));
test('13. holiday-deactivated checklist work is excluded', () => assert.equal(getUnifiedWorkItemStatus(holidayChecklist, now), 'deactivated'));
test('14. Sunday-deactivated checklist work is excluded', () => {
  const sundayChecklist = { ...holidayChecklist, id: 'checklist-sunday', due_date: '2026-09-13' };
  assert.equal(getUnifiedWorkItemStatus(sundayChecklist, now), 'deactivated');
});
test('15. completed checklist history remains completed on a non-working day', () => {
  const completedSunday = { ...holidayChecklist, status: 'deactivated', due_date: '2026-09-13', completed_at: '2026-09-13T06:00:00.000Z' };
  assert.equal(getUnifiedWorkItemStatus(completedSunday, now), 'completed');
  assert.deepEqual(getWorkSummary([completedSunday], now), { total: 1, pending: 0, overdue: 0, completed: 1 });
});
