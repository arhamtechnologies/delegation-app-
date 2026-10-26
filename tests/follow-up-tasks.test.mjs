import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { addFollowUpMetadata, getNextWorkingDate, isFollowUpEligible } from '../lib/follow-up-tasks.mjs';
import { getUnifiedWorkItemStatus, getWorkSummary } from '../lib/work-summary.mjs';

const weeklySunday = {
  id: 'weekly-sunday',
  kind: 'checklist',
  employee_id: 'employee-a',
  due_date: '2026-09-20',
  due_at: '2026-09-20T04:30:00.000Z',
  status: 'deactivated',
  template: { frequency: 'weekly', start_date: '2026-09-06' },
};

test('follow-up 1: weekly Sunday occurrence moves to Monday', () => {
  const item = addFollowUpMetadata(weeklySunday, []);
  assert.equal(item.followUpDate, '2026-09-21');
  assert.equal(item.originalScheduledDate, '2026-09-20');
});

test('follow-up 2: monthly holiday occurrence moves to next working day', () => {
  const item = addFollowUpMetadata({ ...weeklySunday, id: 'monthly-holiday', due_date: '2026-10-02', template: { frequency: 'monthly' } }, ['2026-10-02']);
  assert.equal(item.followUpDate, '2026-10-03');
});

test('follow-up 3: every-15-days occurrence keeps its identity and recurrence anchor', () => {
  const source = { ...weeklySunday, id: 'fortnightly', due_date: '2026-10-02', template: { frequency: 'every_15_days', start_date: '2026-09-17' } };
  const item = addFollowUpMetadata(source, ['2026-10-02']);
  assert.equal(item.id, source.id);
  assert.equal(item.due_date, source.due_date);
  assert.equal(item.template.start_date, source.template.start_date);
});

test('follow-up 4: consecutive holidays and Sunday are skipped', () => {
  assert.equal(getNextWorkingDate('2026-10-23', ['2026-10-24', '2026-10-26']), '2026-10-27');
});

test('follow-up 5: daily checklist behavior remains excluded', () => {
  assert.equal(isFollowUpEligible({ ...weeklySunday, template: { frequency: 'daily' } }, []), false);
});

test('follow-up 6: ordinary overdue working-day task is not classified as follow-up', () => {
  assert.equal(isFollowUpEligible({ id: 'ordinary', kind: 'task', eta: '2026-09-22T04:30:00.000Z' }, []), false);
});

test('follow-up 7: incomplete follow-up remains visible with effective overdue status', () => {
  const item = addFollowUpMetadata(weeklySunday, []);
  assert.equal(getUnifiedWorkItemStatus(item, new Date('2026-09-22T00:00:00.000Z')), 'overdue');
  assert.deepEqual(getWorkSummary([item], new Date('2026-09-22T00:00:00.000Z')), { total: 1, pending: 0, overdue: 1, completed: 0 });
});

test('follow-up 7a: deactivated eligible follow-up remains actionable after filtering', async () => {
  const source = await readFile(new URL('../lib/work-data.js', import.meta.url), 'utf8');
  assert.match(source, /itemStatus !== 'deactivated' \|\| workItem\.isFollowUp/);
});

test('follow-up 7b: checklist details allow only decorated eligible follow-ups', async () => {
  const source = await readFile(new URL('../app/tasks/checklist/[id]/page.js', import.meta.url), 'utf8');
  assert.match(source, /addFollowUpMetadata\(\{ \.\.\.data, kind: 'checklist', sourceType: 'checklist' \}/);
  assert.match(source, /currentStatus === 'deactivated' && !item\.isFollowUp/);
});

test('follow-up 7c: database work list keeps ordinary deactivated rows excluded', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261026080000_include_follow_up_work_items.sql', import.meta.url), 'utf8');
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /i\.status <> 'deactivated'/);
  assert.match(migration, /template\.frequency in \('weekly', 'every_15_days', 'monthly'\)/);
  assert.match(migration, /extract\(dow from i\.due_date\) = 0 or holiday\.id is not null/);
});

test('follow-up 8: generation preserves one occurrence per template and original date', async () => {
  const [generator, migration] = await Promise.all([
    readFile(new URL('../app/api/checklist/generate/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/003_checklist.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(generator, /onConflict: 'template_id,due_date', ignoreDuplicates: true/);
  assert.match(migration, /unique index[\s\S]*checklist_items_template_due_date_key[\s\S]*template_id, due_date/i);
});

test('follow-up 9: completed follow-up keeps completion precedence in all totals', () => {
  const completed = addFollowUpMetadata({ ...weeklySunday, status: 'completed', completed_at: '2026-09-21T06:00:00.000Z' }, []);
  assert.equal(getUnifiedWorkItemStatus(completed, new Date('2026-09-22T00:00:00.000Z')), 'completed');
  assert.deepEqual(getWorkSummary([completed], new Date('2026-09-22T00:00:00.000Z')), { total: 1, pending: 0, overdue: 0, completed: 1 });
});

test('follow-up 10: decorating an occurrence never changes its stable identity', () => {
  const first = addFollowUpMetadata(weeklySunday, []);
  const second = addFollowUpMetadata(weeklySunday, []);
  assert.equal(`${first.kind}:${first.id}`, `${second.kind}:${second.id}`);
  assert.equal(first.followUpDate, second.followUpDate);
});
