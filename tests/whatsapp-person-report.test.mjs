import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTodayWork } from '../lib/wa/format.mjs';
import { formatPersonFullReport } from '../lib/wa/person-report.mjs';
import { reportChunkChars } from '../lib/wa/daily-report.mjs';

const items = [{ who: 'Varun', title: 'GST report', status: 'overdue', due: 'Nov 2 · 10:00 AM', checklist: false }];

test('person report 1: one person with older overdue work gets the offer instead of "see Tasks in the app"', () => {
  const text = formatTodayWork({ items, statuses: ['overdue', 'pending'], person: 'Varun', earlierOverdue: 3, offerFullReport: true });
  assert.match(text, /\nAlso 3 overdue from earlier days\.\n\nShow Varun's full report here \(overdue, pending, completed\)\? Reply 1 for yes, 2 for no\.$/);
  assert.doesNotMatch(text, /see Tasks in the app/);
});

test('person report 2: no offer without older overdue work, for the team view, or when the caller cannot take an offer', () => {
  assert.doesNotMatch(formatTodayWork({ items, statuses: ['overdue'], person: 'Varun', earlierOverdue: 0, offerFullReport: true }), /Reply 1/);
  const team = formatTodayWork({ items, statuses: ['overdue'], earlierOverdue: 3, offerFullReport: true });
  assert.match(team, /Also 3 overdue from earlier days \(see Tasks in the app\)\./);
  assert.doesNotMatch(team, /Reply 1/);
  assert.match(formatTodayWork({ items, statuses: ['overdue'], person: 'Varun', earlierOverdue: 3 }), /\(see Tasks in the app\)/);
  const pendingOnly = formatTodayWork({ items: [], statuses: ['pending'], person: 'Varun', earlierOverdue: 3, offerFullReport: true });
  assert.doesNotMatch(pendingOnly, /Reply 1|earlier days/, 'a pending-only view never mentions overdue');
});

const entry = (title, extra = {}) => ({ title, checklist: false, due: 'Oct 29 · 4:30 PM', done: '3:10 PM', ...extra });

test('person report 3: overdue, pending and completed sections with counts, dates and 12-hour times', () => {
  const [text, ...rest] = formatPersonFullReport({
    person: 'Varun',
    date: '2026-11-02',
    overdue: [entry('GST report'), entry('Cash report', { checklist: true, due: 'Nov 1 · 10:00 AM' })],
    pending: [entry('Bank visit', { due: 'Nov 3 · 11:00 AM' })],
    completed: [entry('Stock count', { checklist: true })],
  });
  assert.deepEqual(rest, []);
  assert.equal(text, [
    '📋 Full report — Varun · Nov 2',
    'Overdue 2 · Pending 1 · Completed today 1',
    '',
    '*Overdue (2)*',
    '• GST report — Oct 29 · 4:30 PM',
    '• Cash report (checklist) — Nov 1 · 10:00 AM',
    '',
    '*Pending (1)*',
    '• Bank visit — Nov 3 · 11:00 AM',
    '',
    '*Completed today (1)*',
    '• Stock count (checklist) — done 3:10 PM',
  ].join('\n'));
  assert.doesNotMatch(text, /\b(1[3-9]|2[0-3]):\d{2}\b/);
});

test('person report 4: empty sections are left out, and an empty report says so', () => {
  const [onlyDone] = formatPersonFullReport({ person: 'Asha', date: '2026-11-02', overdue: [], pending: [], completed: [entry('Call')] });
  assert.doesNotMatch(onlyDone, /Overdue \(|Pending \(/);
  assert.match(onlyDone, /\*Completed today \(1\)\*/);
  const [empty] = formatPersonFullReport({ person: 'Asha', date: '2026-11-02', overdue: [], pending: [], completed: [] });
  assert.match(empty, /Nothing overdue, pending or completed today\.$/);
});

test('person report 5: a long report splits into messages that fit, each section continuation is titled, and the list is capped', () => {
  const many = (count, prefix) => Array.from({ length: count }, (_, index) => entry(`${prefix}${index} ${'long title '.repeat(10)}`));
  const chunks = formatPersonFullReport({ person: 'Varun', date: '2026-11-02', overdue: many(45, 'O'), pending: many(30, 'P'), completed: many(2, 'C') });
  assert.ok(chunks.length >= 2);
  chunks.forEach((chunk) => assert.ok(chunk.length <= reportChunkChars + 200, `chunk of ${chunk.length} chars`));
  assert.match(chunks[0], /^📋 Full report — Varun/);
  assert.match(chunks[1], /^\*Overdue \(cont\.\)\*\n• O/);
  assert.match(chunks.join('\n'), /\+5 more \(see Tasks in the app\)/, 'only 40 overdue are listed');
  assert.match(chunks[0], /Overdue 45 · Pending 30 · Completed today 2/, 'the header still counts everything');
});

test('person report 6: no message starts blank or ends on a lone section title, and huge titles are clipped', () => {
  const many = (count, prefix, size = 10) => Array.from({ length: count }, (_, index) => entry(`${prefix}${index} ${'long title '.repeat(size)}`));
  for (let overdue = 20; overdue <= 40; overdue += 1) {
    const chunks = formatPersonFullReport({ person: 'Varun', date: '2026-11-02', overdue: many(overdue, 'O'), pending: many(8, 'P'), completed: many(3, 'C') });
    chunks.forEach((chunk) => {
      assert.ok(chunk.length <= reportChunkChars, `chunk of ${chunk.length} chars`);
      assert.doesNotMatch(chunk, /^\s/, 'no leading blank line');
      assert.doesNotMatch(chunk, /\*[^*\n]+\*$/, 'does not end on a section title');
    });
  }
  const [huge] = formatPersonFullReport({ person: 'Varun', date: '2026-11-02', overdue: [entry('x'.repeat(5000))], pending: [], completed: [] });
  assert.ok(huge.length < 600);
  assert.match(huge, /x…/);
});
