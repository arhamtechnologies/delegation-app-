import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDailyUpdate, parseQuickCommand, resolveUpdateDate } from '../lib/wa/updates.mjs';

test('wa updates 1: "updates for today" style messages map to today', () => {
  for (const text of ['updates', 'Updates for today', 'update today.', 'send me the updates for today', 'daily report', 'Aaj ka update', 'status', 'summary today']) {
    assert.deepEqual(parseQuickCommand(text), { kind: 'updates', day: 'today' }, text);
  }
});

test('wa updates 2: yesterday and Hinglish "kal ka update" map to yesterday', () => {
  for (const text of ['updates yesterday', 'updates for yesterday', 'kal ka update', 'report kal']) {
    assert.deepEqual(parseQuickCommand(text), { kind: 'updates', day: 'yesterday' }, text);
  }
});

test('wa updates 3: help commands, and free text still goes to the assistant', () => {
  assert.deepEqual(parseQuickCommand('help'), { kind: 'help' });
  assert.deepEqual(parseQuickCommand('?'), { kind: 'help' });
  for (const text of ['updates for Varun', 'assign GST filing to Varun by Friday', 'update #12 due tomorrow', 'status of #12', '1', '']) {
    assert.equal(parseQuickCommand(text), null, text);
  }
});

test('wa updates 4: dates resolve in India time', () => {
  const lateNightUtc = new Date('2026-10-27T20:00:00.000Z'); // 28 Oct, 01:30 IST
  assert.equal(resolveUpdateDate('today', lateNightUtc), '2026-10-28');
  assert.equal(resolveUpdateDate('yesterday', lateNightUtc), '2026-10-27');
});

test('wa updates 5: report lists each section with task numbers and assignees', () => {
  const varun = { name: 'Varun' };
  const text = formatDailyUpdate({
    date: '2026-10-27',
    isToday: true,
    created: [{ short_code: 41, title: 'GST filing', assignee: varun, eta: '2026-10-30T11:30:00.000Z' }],
    completed: [{ short_code: 7, title: 'Vendor payment', assignee: varun, eta: '2026-10-27T05:00:00.000Z', completed_at: '2026-10-27T09:00:00.000Z' }],
    dueOpen: [],
    overdue: [{ short_code: 3, title: 'Stock audit', assignee: { name: 'Monika' }, eta: '2026-10-25T13:00:00.000Z' }],
    followup: [],
    remarks: [{ task: { short_code: 3, title: 'Stock audit' }, authorName: 'Monika', remark: 'Waiting for store keys' }],
  });
  assert.match(text, /^📋 Updates for today, Tue, Oct 27/);
  assert.match(text, /Assigned 1 · Completed 1 · Due & open 0 · Overdue 1 · Follow-up 0/);
  assert.match(text, /• GST filing → Varun, due Oct 30 · 5:00 PM/);
  assert.match(text, /• Vendor payment — Varun \(late\)/);
  assert.match(text, /• Monika on Stock audit: "Waiting for store keys"/);
  assert.doesNotMatch(text, /Due today, still open|In follow-up/);
});

test('wa updates 6: long sections are capped and empty days say so', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ short_code: index + 1, title: `Task ${index + 1}`, assignee: { name: 'A' }, eta: '2026-10-27T13:00:00.000Z' }));
  const capped = formatDailyUpdate({ date: '2026-10-27', isToday: true, created: many, completed: [], dueOpen: [], overdue: [], followup: [], remarks: [] });
  assert.match(capped, /…and 4 more/);
  assert.doesNotMatch(capped, /Task 9\b/);
  assert.doesNotMatch(capped, /#\d/);
  const empty = formatDailyUpdate({ date: '2026-10-26', isToday: false, created: [], completed: [], dueOpen: [], overdue: [], followup: [], remarks: [] });
  assert.match(empty, /^📋 Updates for Mon, Oct 26[\s\S]*No activity yet\.$/);
});
