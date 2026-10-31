import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDailyReport, reportChunkChars } from '../lib/wa/daily-report.mjs';

const now = new Date('2026-10-31T12:30:00.000Z'); // 6 PM India time
const employees = [{ id: 'e1', name: 'Varun' }, { id: 'e2', name: 'Asha' }, { id: 'e3', name: 'Zoya' }];
const task = (overrides) => ({ assignee_id: 'e1', title: 'GST report', description: 'File the October\nGST returns', status: 'pending', eta: '2026-10-31T11:00:00.000Z', ...overrides });
const item = (overrides) => ({ employee_id: 'e1', task: 'Cash report', status: 'pending', due_date: '2026-10-31', due_at: '2026-10-31T04:30:00.000Z', ...overrides });

test('wa daily report 1: every person with tasks (title, description, due, status) and checklist done or not', () => {
  const [text, ...rest] = formatDailyReport({
    date: '2026-10-31',
    now,
    employees,
    tasks: [
      task(),
      task({ title: 'Bank visit', description: null, status: 'closed', completed_at: '2026-10-31T09:00:00.000Z', eta: '2026-10-31T10:00:00.000Z' }),
      task({ assignee_id: 'e2', title: 'Vendor call', status: 'submitted', original_eta: '2026-10-30T11:00:00.000Z', eta: '2026-11-01T05:30:00.000Z' }),
    ],
    checklist: [item(), item({ task: 'Stock count', status: 'completed', completed_at: '2026-10-31T05:00:00.000Z' })],
    olderChecklistOpen: new Map([['e1', 2]]),
  });
  assert.deepEqual(rest, [], 'a small team fits in one message');
  assert.match(text, /^🕕 Daily report · Oct 31 \(6 PM\)\nTasks 1\/3 done · Checklist 1\/2 done\n\n/);
  assert.match(text, /\*Varun\* — Tasks 1\/2 done · Checklist 1\/2 done\nTasks:\n❌ GST report\n {3}File the October GST returns\n {3}Due: Oct 31 · 4:30 PM\n {3}❌ Not done \(overdue\)\n✅ Bank visit\n {3}Due: Oct 31 · 3:30 PM\n {3}✅ Completed\nChecklist:\n❌ Cash report · 10:00 AM \(not done\)\n✅ Stock count · 10:00 AM\n⚠️ 2 checklist items from earlier days still not done/);
  assert.match(text, /\*Asha\* — Tasks 0\/1 done\nTasks:\n❌ Vendor call\n.*\n {3}Due: Oct 30 · 4:30 PM\n {3}Revised ETA: Nov 1 · 11:00 AM\n {3}🟡 Submitted, awaiting approval/);
  assert.ok(text.indexOf('*Asha*') < text.indexOf('*Varun*'), 'people in name order');
  assert.match(text, /No tasks or checklist today: Zoya$/);
  assert.doesNotMatch(text, /\b(1[3-9]|2[0-3]):\d{2}\b/, '12-hour times only');
});

test('wa daily report 2: a long report is split between people, never inside one', () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, name: `Person ${String(index).padStart(2, '0')}` }));
  const tasks = many.flatMap((employee) => [1, 2, 3].map((n) => task({ assignee_id: employee.id, title: `Task ${n}`, description: 'd'.repeat(250) })));
  const chunks = formatDailyReport({ date: '2026-10-31', now, employees: many, tasks, checklist: [] });
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= reportChunkChars));
  assert.ok(chunks.slice(1).every((chunk) => chunk.startsWith('*Person ')), 'each later message starts with a person');
  assert.equal(chunks.join('\n\n').match(/\*Person \d+\*/g).length, 30);
  assert.match(chunks[0], /d{199}…/, 'descriptions are clipped');
});
