import assert from 'node:assert/strict';
import test from 'node:test';
import { formatChecklistLine, formatList, formatMisReport, formatDashboardStats, formatTodayWork, formatTaskLine, formatTemplateLine, resolveAssigneeName } from '../lib/wa/format.mjs';
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

test('wa today work: team view groups by person, person view groups by status', () => {
  const items = [
    { who: 'Varun', title: 'GST filing', status: 'overdue', due: 'Today, 10:00 AM', checklist: false },
    { who: 'Varun', title: 'Bin audit', status: 'pending', due: 'Today, 5:00 PM', checklist: true },
    { who: 'Monika', title: 'Call vendor', status: 'pending', due: 'Today, 4:00 PM', checklist: false },
  ];
  const team = formatTodayWork({ items, statuses: ['overdue', 'pending'] });
  assert.match(team, /Overdue & pending today\n1 overdue · 2 pending/);
  assert.ok(team.indexOf('*Varun (2)*') < team.indexOf('*Monika (1)*'));
  assert.match(team, /Bin audit \(checklist\) — pending, Today, 5:00 PM/);
  const person = formatTodayWork({ items: items.slice(0, 2), statuses: ['overdue', 'pending'], person: 'Varun' });
  assert.match(person, /— Varun/);
  assert.match(formatTodayWork({ items: [items[0]], statuses: ['overdue'], earlierOverdue: 135 }), /Also 135 overdue from earlier days/);
  assert.match(person, /\*Overdue \(1\)\*\n• GST filing — Today, 10:00 AM/);
  assert.match(formatTodayWork({ items: [], statuses: ['overdue'] }), /Nothing overdue today\./);
});

test('wa dashboard stats: totals, per person, assigned today', () => {
  const text = formatDashboardStats({
    date: '2026-10-28',
    summary: { total: 52, pending: 17, overdue: 1, completed: 34, tasks: 1, checklist: 51 },
    rows: [{ employee_name: 'Gulshan', total_work: 5, completed_work: 3, pending_work: 1, overdue_work: 1 }, { employee_name: 'Monika', total_work: 4, completed_work: 4, pending_work: 0, overdue_work: 0 }],
    assigned: { total: 3, byPerson: [['Varun', 2], ['Monika', 1]] },
    earlierOverdue: 135,
  });
  assert.match(text, /Total 52 · Pending 17 · Overdue 1 · Completed 34/);
  assert.ok(text.indexOf('Gulshan') < text.indexOf('Monika'));
  assert.match(text, /Assigned today \(3\)\*\n• Varun: 2/);
  assert.match(text, /Also 135 overdue from earlier days/);
  assert.match(formatDashboardStats({ date: '2026-10-28', summary: { total: 0, pending: 0, overdue: 0, completed: 0, tasks: 0, checklist: 0 }, rows: [], assigned: { total: 0, byPerson: [] } }), /No new tasks assigned today/);
});
