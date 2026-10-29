import { formatChecklistDueAt, getChecklistBusinessDate, getDateTimeParts } from '../checklist-time.js';

// Timed WhatsApp alerts about tasks. Pure planning and wording only; lib/wa/alerts-run.js does the I/O.
export const directorRoles = new Set(['super_admin', 'assigner']);
// Older work is left alone so a first run (or a long outage) never floods the EA with stale alerts.
export const assignedLookbackMs = 30 * 60 * 1000;
export const reminderLookbackMs = 60 * 60 * 1000;
export const reminderLookaheadMs = 5 * 60 * 1000;
export const summaryTime = '18:00';

/** The reminder a task is due for at `now`: 5 min before its ETA, 5 min after, then 15 min after. */
export function reminderStage(eta, now) {
  const minutes = (now.getTime() - Date.parse(eta)) / 60000;
  if (Number.isNaN(minutes)) return null;
  if (minutes > -5 && minutes <= 0) return 'due_soon';
  if (minutes >= 5 && minutes < 15) return 'overdue';
  if (minutes >= 15 && minutes < 60) return 'escalated';
  return null;
}

/**
 * Alerts owed at `now`, before de-duplication. `director` is who assigned the task (null when an EA
 * or the employee did); `anchor` keys the alert so a revised ETA earns fresh reminders.
 * @param {{ id: string, title: string, eta: string, created_at: string, assigneeName: string, director: { name: string, chatId: string | null } | null }[]} tasks
 */
export function planTaskAlerts(tasks, now) {
  const alerts = [];
  for (const task of tasks) {
    const base = { taskId: task.id, title: task.title, eta: task.eta, assigneeName: task.assigneeName, director: task.director };
    if (task.director && now.getTime() - Date.parse(task.created_at) <= assignedLookbackMs) alerts.push({ ...base, stage: 'assigned', anchor: task.created_at });
    const stage = reminderStage(task.eta, now);
    if (stage) alerts.push({ ...base, stage, anchor: task.eta });
  }
  return alerts;
}

const headers = {
  due_soon: '⏰ Due in 5 minutes, overdue after the ETA',
  overdue: '⚠️ Overdue: 5 minutes past the ETA',
  escalated: '🚨 Still not done 15 minutes after the ETA',
};
const stageOrder = ['assigned', 'due_soon', 'overdue', 'escalated'];

function taskLine(alert, { withDirector = false } = {}) {
  const by = withDirector && alert.director ? ` · by ${alert.director.name}` : '';
  return `• ${alert.assigneeName}: ${alert.title} (ETA ${formatChecklistDueAt(alert.eta)})${by}`;
}

function assignedBlocks(alerts) {
  const byDirector = new Map();
  for (const alert of alerts) byDirector.set(alert.director.name, [...(byDirector.get(alert.director.name) || []), alert]);
  return [...byDirector.entries()].map(([name, items]) => `📌 ${name} assigned ${items.length === 1 ? 'a task' : `${items.length} tasks`}\n${items.map((alert) => taskLine(alert)).join('\n')}`);
}

/**
 * One WhatsApp message per recipient. EAs hear about everything; the assigning director is added
 * only for the 15-minute escalation.
 * @returns {{ chatId: string, text: string }[]}
 */
export function buildAlertMessages(alerts, eaChatIds) {
  const inbox = new Map();
  const add = (chatId, stage, alert) => {
    if (!chatId) return;
    const stages = inbox.get(chatId) || new Map();
    stages.set(stage, [...(stages.get(stage) || []), alert]);
    inbox.set(chatId, stages);
  };
  for (const alert of alerts) {
    for (const chatId of eaChatIds) add(chatId, alert.stage, alert);
    if (alert.stage === 'escalated' && alert.director?.chatId && !eaChatIds.includes(alert.director.chatId)) add(alert.director.chatId, alert.stage, alert);
  }
  return [...inbox.entries()].map(([chatId, stages]) => ({
    chatId,
    text: stageOrder.filter((stage) => stages.has(stage)).flatMap((stage) => (stage === 'assigned'
      ? assignedBlocks(stages.get(stage))
      : [`${headers[stage]}\n${stages.get(stage).map((alert) => taskLine(alert, { withDirector: stage === 'escalated' })).join('\n')}`])).join('\n\n'),
  }));
}

/** The India-time date whose 6 PM summary is due at `now`, or null before 6 PM. */
export function dueSummaryDate(now) {
  const { hour, minute } = getDateTimeParts(now);
  return `${hour}:${minute}` >= summaryTime ? getChecklistBusinessDate(now) : null;
}

export function formatDailySummary(dashboardText) {
  return `🕕 Daily summary (6 PM)\n\n${dashboardText}`;
}
