import assert from 'node:assert/strict';
import test from 'node:test';
import { formatChecklistLine, formatList, formatMisReport, formatTaskLine, formatTemplateLine, resolveAssigneeName } from '../lib/wa/format.mjs';
import { formatDailyUpdate } from '../lib/wa/updates.mjs';

test('wa format 1: long lists are cut at 15 rows and stay under the WhatsApp cap', () => {
  const lines = Array.from({ length: 20 }, (_, index) => `#${index} ${'x'.repeat(60)}`);
  const text = formatList(lines);
  assert.equal(text.split('\n').length, 16);
  assert.ok(text.endsWith('+5 more'));
  assert.ok(text.length < 4000);
  assert.equal(formatList(lines.slice(0, 3)), lines.slice(0, 3).join('\n'));
  assert.equal(formatList([]), 'Nothing found.');
});

test('wa format 2: an ambiguous name asks, an exact name wins', () => {
  const people = [{ id: '1', name: 'Vipul Kumar' }, { id: '2', name: 'Vipul (MIS)' }];
  const ambiguous = resolveAssigneeName('vipul', people);
  assert.match(ambiguous.error, /matches several/);
  assert.match(ambiguous.error, /Vipul Kumar/);
  assert.match(ambiguous.error, /Vipul \(MIS\)/);
  assert.equal(resolveAssigneeName('vipul kumar', people).employee.id, '1');
  assert.match(resolveAssigneeName('zed', people).error, /No assignable employee/);
});

test('wa format 3: lines are short bullets without numbers; model text adds them', () => {
  const now = new Date('2026-10-27T06:00:00.000Z');
  const task = { short_code: 12, title: 'GST', status: 'pending', priority: 'high', eta: '2026-10-26T13:00:00.000Z', assignee: { name: 'Vipul' } };
  assert.match(formatTaskLine(task, now), /^• GST — Vipul, overdue, high, due /);
  assert.match(formatTaskLine(task, now, { ids: true }), /^• #12 GST — Vipul/);
  const item = { short_code: 45, task: 'Petty cash', status: 'pending', due_date: '2026-10-27', due_at: '2026-10-27T13:00:00.000Z', employee: { name: 'Varun' } };
  assert.match(formatChecklistLine(item, now), /^• Petty cash — Varun, pending, /);
  assert.match(formatChecklistLine(item, now, { ids: true }), /^• C45 Petty cash — Varun/);
  const weekly = { short_code: 7, task: 'Petty cash', frequency: 'weekly', weekday: 1, due_time: '10:00:00', active: true, employee: { name: 'Varun' } };
  assert.equal(formatTemplateLine(weekly), '• Petty cash — Varun, weekly Mon at 10:00');
  assert.match(formatTemplateLine(weekly, { ids: true }), /^• R7 /);
  assert.match(formatTemplateLine({ short_code: 8, task: 'Rent', frequency: 'monthly', monthly_days: [1, 15], due_time: '09:30', active: false, employee: { name: 'Varun' } }), /monthly 1,15 at 09:30 \(paused\)$/);
});

test('wa format 4: MIS lists employees by overdue count', () => {
  const text = formatMisReport({
    from: '2026-10-01',
    to: '2026-10-31',
    summary: { total: 10, pending: 4, overdue: 2, completed: 4 },
    rows: [
      { employee_name: 'A', total_work: 4, pending_work: 3, overdue_work: 0, completed_work: 1, on_time_work: 1 },
      { employee_name: 'B', total_work: 6, pending_work: 1, overdue_work: 2, completed_work: 3, on_time_work: 2 },
    ],
  });
  assert.match(text, /MIS Oct 1 – Oct 31/);
  assert.match(text, /4\/10 done · 4 pending · 2 overdue/);
  assert.ok(text.indexOf('• B:') < text.indexOf('• A:'));
  assert.match(text, /• B: 3\/6 done \(2 on time\) · 2 overdue · 1 pending/);
});

test('wa format 5: daily update shows checklist counts when given', () => {
  const base = { date: '2026-10-27', isToday: true, created: [], completed: [], dueOpen: [], overdue: [], followup: [], remarks: [] };
  assert.match(formatDailyUpdate({ ...base, checklist: { done: 3, pending: 2, overdue: 1 } }), /Checklist: done 3 · pending 2 · overdue 1/);
  assert.doesNotMatch(formatDailyUpdate(base), /Checklist:/);
});
