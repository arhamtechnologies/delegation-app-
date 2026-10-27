import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCommand } from '../lib/wa/commands.mjs';

function expectAll(texts, expected) {
  for (const text of texts) assert.deepEqual(parseCommand(text), expected, text);
}

test('wa commands 1: remove/delete means permanent delete', () => {
  expectAll(['remove #12', 'delete #12', '#12 remove', 'Delete task #12', 'delete #12.'], { kind: 'task_delete', ref: 12 });
});

test('wa commands 2: done/close/complete closes a task', () => {
  expectAll(['#12 done', 'close #12', 'complete #12', '#12 ho gaya', 'Mark #12 done'], { kind: 'task_close', ref: 12 });
  expectAll(['cancel #12'], { kind: 'task_cancel', ref: 12 });
  expectAll(['#12', 'show #12', 'Task #12'], { kind: 'task', ref: 12 });
});

test('wa commands 3: checklist items use C<n>, any case', () => {
  expectAll(['c45 done', 'C45 done', 'done C45', 'C45 ho gaya'], { kind: 'checklist_done', ref: 45 });
  expectAll(['reopen C45', 'c45 reopen'], { kind: 'checklist_reopen', ref: 45 });
});

test('wa commands 4: checklist and person lists', () => {
  expectAll(['checklist', 'checklist today', "today's checklist", 'aaj ka checklist'], { kind: 'checklist', day: 'today' });
  expectAll(['checklist overdue', 'overdue checklist'], { kind: 'checklist', status: 'overdue', day: 'today' });
  expectAll(['checklist yesterday'], { kind: 'checklist', day: 'yesterday' });
  expectAll(['checklist vipul'], { kind: 'checklist', name: 'vipul', day: 'today' });
  expectAll(['vipul tasks', 'tasks of vipul', 'vipul ke tasks', 'Vipul ke pending tasks'], { kind: 'person_tasks', name: 'vipul' });
  expectAll(['Vipul Kumar tasks'], { kind: 'person_tasks', name: 'vipul kumar' });
});

test('wa commands 5: status lists and MIS', () => {
  expectAll(['overdue', 'overdue tasks'], { kind: 'list', status: 'overdue' });
  expectAll(['pending', 'pending tasks'], { kind: 'list', status: 'pending' });
  expectAll(['follow up', 'followup', 'follow-up tasks'], { kind: 'list', status: 'followup' });
  expectAll(['mis', 'MIS this month', 'mis report'], { kind: 'mis', period: 'this_month' });
  expectAll(['mis last month'], { kind: 'mis', period: 'last_month' });
  expectAll(['mis today'], { kind: 'mis', period: 'today' });
  expectAll(['mis this week'], { kind: 'mis', period: 'this_week' });
});

test('wa commands 6: sentences with command words go to the assistant', () => {
  for (const text of [
    "remove the GST line from #12's description",
    "don't delete #12, just mark it done",
    'delete #12 and #13',
    'remove vipul from #12',
    '#12 done?',
    'assign GST filing to Varun by Friday',
    'is #12 done',
    'checklist for vipul every monday 10am',
    'overdue tasks of vipul for last week',
    '1',
    '',
  ]) assert.equal(parseCommand(text), null, text);
});

test('wa commands 7: help and updates keep working', () => {
  expectAll(['help', '?'], { kind: 'help' });
  expectAll(['updates', 'aaj ka update'], { kind: 'updates', day: 'today' });
  expectAll(['updates yesterday'], { kind: 'updates', day: 'yesterday' });
});
