import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAlertMessages, dueSummaryDate, planChecklistAlerts, planTaskAlerts, reminderStage } from '../lib/wa/alerts.mjs';

const eta = '2026-10-29T12:00:00.000Z'; // 5:30 PM India time
const at = (minutesFromEta) => new Date(Date.parse(eta) + minutesFromEta * 60000);
const anekant = { name: 'Anekant Jain', chatId: '919575000000@c.us' };
const ea = '919800000000@c.us';
const task = (overrides = {}) => ({ id: 't1', title: 'GST report', description: 'File the October GST returns', eta, created_at: at(-120).toISOString(), assigneeName: 'Varun', director: anekant, ...overrides });

test('wa alerts 1: reminder windows are 5 min before, 5 min after and 15 min after the ETA', () => {
  assert.equal(reminderStage(eta, at(-6)), null);
  assert.equal(reminderStage(eta, at(-5)), null);
  assert.equal(reminderStage(eta, at(-4)), 'due_soon');
  assert.equal(reminderStage(eta, at(0)), 'due_soon');
  assert.equal(reminderStage(eta, at(3)), null);
  assert.equal(reminderStage(eta, at(5)), 'overdue');
  assert.equal(reminderStage(eta, at(14)), 'overdue');
  assert.equal(reminderStage(eta, at(15)), 'escalated');
  assert.equal(reminderStage(eta, at(59)), 'escalated');
  assert.equal(reminderStage(eta, at(60)), null, 'old overdue work is not re-announced');
});

test('wa alerts 2: only a fresh director task gets an assignment notice; the ETA keys reminders', () => {
  const now = at(-30);
  const fresh = planTaskAlerts([task({ created_at: at(-31).toISOString() })], now);
  assert.deepEqual(fresh.map((alert) => alert.stage), ['assigned']);
  assert.deepEqual(planTaskAlerts([task({ created_at: at(-31).toISOString(), director: null })], now), []);
  assert.deepEqual(planTaskAlerts([task()], now), [], 'created two hours ago: no notice');
  const [reminder] = planTaskAlerts([task()], at(16));
  assert.equal(reminder.stage, 'escalated');
  assert.equal(reminder.anchor, eta);
});

test('wa alerts 3: the EA hears about every stage with person, task, description and due time; the director only at 15 minutes', () => {
  const alerts = [
    { ...task(), taskId: 't1', stage: 'assigned', anchor: eta },
    { ...task({ assigneeName: 'Vipul', title: 'Stock count', description: null }), taskId: 't2', stage: 'due_soon', anchor: eta },
    { ...task({ assigneeName: 'Tanisha', title: 'Bank visit', director: null }), taskId: 't3', stage: 'overdue', anchor: eta },
  ];
  const messages = buildAlertMessages(alerts, [ea]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].chatId, ea);
  assert.match(messages[0].text, /📌 Anekant Jain assigned a task\n\nPerson: Varun\nTask: GST report\nDescription: File the October GST returns\nDue: Oct 29 · 5:30 PM/);
  assert.match(messages[0].text, /⏰ Due in 5 minutes.*\n\nPerson: Vipul\nTask: Stock count\nDue: Oct 29 · 5:30 PM/, 'no empty description line');
  assert.match(messages[0].text, /⚠️ Overdue.*\n\nPerson: Tanisha\nTask: Bank visit/);
  assert.doesNotMatch(messages[0].text, /#\d|t1|t2/, 'no internal ids');

  const escalated = buildAlertMessages([{ ...task(), taskId: 't1', stage: 'escalated', anchor: eta }], [ea]);
  assert.deepEqual(escalated.map((message) => message.chatId), [ea, anekant.chatId]);
  assert.ok(escalated.every((message) => /🚨 Still not done 15 minutes after the ETA\n\nPerson: Varun\nTask: GST report\nDescription: File the October GST returns\nDue: Oct 29 · 5:30 PM\nAssigned by: Anekant Jain/.test(message.text)));
});

test('wa alerts 3b: long descriptions are clipped and big batches point to the app', () => {
  const [message] = buildAlertMessages([{ ...task({ description: 'x'.repeat(400) }), taskId: 't1', stage: 'overdue', anchor: eta }], [ea]);
  assert.match(message.text, /Description: x{299}…\n/);
  const many = Array.from({ length: 12 }, (_, index) => ({ ...task({ title: `Task ${index}` }), taskId: `t${index}`, stage: 'assigned', anchor: eta }));
  const [batch] = buildAlertMessages(many, [ea]);
  assert.match(batch.text, /^📌 Anekant Jain assigned 12 tasks/);
  assert.equal(batch.text.match(/Person: /g).length, 10);
  assert.match(batch.text, /\+2 more in the app$/);
});

test('wa alerts 3c: a recurring checklist task a director adds is copied to the EA only', () => {
  const template = { id: 'r1', task: 'Daily cash report', frequency: 'daily', due_time: '18:30:00', created_at: at(-10).toISOString(), assigneeName: 'Varun', director: anekant };
  const planned = planChecklistAlerts([template, { ...template, id: 'r2', director: null }, { ...template, id: 'r3', created_at: at(-31).toISOString() }], at(0));
  assert.deepEqual(planned.map((alert) => alert.templateId), ['r1'], 'not EA-made, not older than 30 minutes');
  const messages = buildAlertMessages(planned, [ea]);
  assert.deepEqual(messages.map((message) => message.chatId), [ea]);
  assert.equal(messages[0].text, '📋 Anekant Jain added a checklist task\n\nPerson: Varun\nTask: Daily cash report\nRepeats: daily at 6:30 PM');
});

test('wa alerts 4: no EA number and no director means nothing to send', () => {
  assert.deepEqual(buildAlertMessages([{ ...task({ director: null }), taskId: 't1', stage: 'escalated', anchor: eta }], []), []);
});

test('wa alerts 5: the daily summary is due from 6 PM India time', () => {
  assert.equal(dueSummaryDate(new Date('2026-10-29T12:29:00.000Z')), null);
  assert.equal(dueSummaryDate(new Date('2026-10-29T12:30:00.000Z')), '2026-10-29');
  assert.equal(dueSummaryDate(new Date('2026-10-29T18:00:00.000Z')), '2026-10-29');
  assert.equal(dueSummaryDate(new Date('2026-10-29T18:31:00.000Z')), null, 'past midnight it is a new day');
});

test('wa alerts 6: bot messages show 12-hour times', async () => {
  const { formatClock } = await import('../lib/wa/format.mjs');
  assert.equal(formatClock('18:30'), '6:30 PM');
  assert.equal(formatClock('09:05:00'), '9:05 AM');
  assert.equal(formatClock('00:15'), '12:15 AM');
  assert.equal(formatClock('12:00'), '12:00 PM');
  const [message] = buildAlertMessages([{ ...task(), taskId: 't1', stage: 'overdue', anchor: eta }], [ea]);
  assert.doesNotMatch(message.text, /\b(1[3-9]|2[0-3]):\d{2}\b/);
});

test('wa alerts 7: a task missing details gets a fixed question naming only what is missing', async () => {
  const { missingFields, missingTaskQuestion } = await import('../lib/wa/tools.mjs');
  assert.equal(missingTaskQuestion([]), null);
  assert.equal(
    missingTaskQuestion(missingFields('task_change', { action: 'create', assignee: 'Varun' })),
    'To create this task, please send:\n• Task title\n• Task description\n• ETA (date and time, e.g. 30 Oct 5:30 PM)',
  );
  assert.equal(
    missingTaskQuestion(missingFields('task_change', { action: 'create', assignee: 'Varun', title: 'GST', description: 'File returns', due_date: '2026-10-30' })),
    'To create this task, please send:\n• ETA time (e.g. 5:30 PM)',
  );
  assert.match(missingTaskQuestion(['assignee']), /Whom to assign/);
});

test('wa alerts 8: a checklist task missing details gets a fixed question, including the time', async () => {
  const { missingChecklistQuestion, missingFields } = await import('../lib/wa/tools.mjs');
  assert.equal(missingChecklistQuestion([]), null);
  assert.equal(
    missingChecklistQuestion(missingFields('checklist', { action: 'template_create', assignee: 'Varun', task: 'Cash report', frequency: 'daily' }), 'Cash report'),
    'To add "Cash report", please send:\n• Time (e.g. 6:30 PM)',
  );
  assert.match(missingChecklistQuestion(missingFields('checklist', { action: 'template_create' })), /Whom to assign\n• Checklist task.*\n• How often.*\n• Time/);
});
