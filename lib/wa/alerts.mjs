import { formatChecklistDueAt, getChecklistBusinessDate, getDateTimeParts } from '../checklist-time.js';
import { describeRecurrence } from './format.mjs';

// Timed WhatsApp alerts about tasks. Pure planning and wording only; lib/wa/alerts-run.js does the I/O.
export const directorRoles = new Set(['super_admin', 'assigner']);
// Older work is left alone so a first run (or a long outage) never floods the EA with stale alerts.
export const assignedLookbackMs = 30 * 60 * 1000;
export const reminderLookbackMs = 60 * 60 * 1000;
export const reminderLookaheadMs = 5 * 60 * 1000;
export const summaryTime = '18:00';
const descriptionChars = 300;
const blocksPerSection = 10;

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
 * @param {{ id: string, title: string, description?: string | null, eta: string, created_at: string, assigneeName: string, director: { name: string, chatId: string | null } | null }[]} tasks
 */
export function planTaskAlerts(tasks, now) {
  const alerts = [];
  for (const task of tasks) {
    const base = { taskId: task.id, title: task.title, description: task.description, eta: task.eta, assigneeName: task.assigneeName, director: task.director };
    if (task.director && now.getTime() - Date.parse(task.created_at) <= assignedLookbackMs) alerts.push({ ...base, stage: 'assigned', anchor: task.created_at });
    const stage = reminderStage(task.eta, now);
    if (stage) alerts.push({ ...base, stage, anchor: task.eta });
  }
  return alerts;
}

/**
 * Notices for recurring checklist tasks a director added recently; they have no ETA, so no reminders.
 * @param {{ id: string, task: string, created_at: string, assigneeName: string, director: { name: string, chatId: string | null } | null }[]} templates
 */
export function planChecklistAlerts(templates, now) {
  return templates
    .filter((template) => template.director && now.getTime() - Date.parse(template.created_at) <= assignedLookbackMs)
    .map((template) => ({ templateId: template.id, stage: 'checklist_assigned', title: template.task, schedule: describeRecurrence(template), assigneeName: template.assigneeName, director: template.director }));
}

const headers = {
  due_soon: '⏰ Due in 5 minutes, overdue after the ETA',
  overdue: '⚠️ Overdue: 5 minutes past the ETA',
  escalated: '🚨 Still not done 15 minutes after the ETA',
};
const stageOrder = ['assigned', 'checklist_assigned', 'due_soon', 'overdue', 'escalated'];

function clip(text) {
  const chars = Array.from(String(text || '').trim());
  return chars.length > descriptionChars ? `${chars.slice(0, descriptionChars - 1).join('')}…` : chars.join('');
}

// Person, task, description and due time on their own lines, so the EA can act on it without opening the app.
function detailBlock(alert, { withDirector = false } = {}) {
  const lines = [`Person: ${alert.assigneeName}`, `Task: ${alert.title}`];
  const description = clip(alert.description);
  if (description) lines.push(`Description: ${description}`);
  lines.push(alert.schedule ? `Repeats: ${alert.schedule}` : `Due: ${formatChecklistDueAt(alert.eta)}`);
  if (withDirector && alert.director) lines.push(`Assigned by: ${alert.director.name}`);
  return lines.join('\n');
}

function section(header, alerts, options) {
  const blocks = alerts.slice(0, blocksPerSection).map((alert) => detailBlock(alert, options));
  if (alerts.length > blocksPerSection) blocks.push(`+${alerts.length - blocksPerSection} more in the app`);
  return `${header}\n\n${blocks.join('\n\n')}`;
}

function assignedSections(alerts, noun) {
  const byDirector = new Map();
  for (const alert of alerts) byDirector.set(alert.director.name, [...(byDirector.get(alert.director.name) || []), alert]);
  return [...byDirector.entries()].map(([name, items]) => {
    const what = items.length === 1 ? `a ${noun}` : `${items.length} ${noun}s`;
    return section(noun === 'task' ? `📌 ${name} assigned ${what}` : `📋 ${name} added ${what}`, items);
  });
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
    text: stageOrder.filter((stage) => stages.has(stage)).flatMap((stage) => {
      if (stage === 'assigned') return assignedSections(stages.get(stage), 'task');
      if (stage === 'checklist_assigned') return assignedSections(stages.get(stage), 'checklist task');
      return [section(headers[stage], stages.get(stage), { withDirector: stage === 'escalated' })];
    }).join('\n\n'),
  }));
}

/** The India-time date whose 6 PM summary is due at `now`, or null before 6 PM. */
export function dueSummaryDate(now) {
  const { hour, minute } = getDateTimeParts(now);
  return `${hour}:${minute}` >= summaryTime ? getChecklistBusinessDate(now) : null;
}
