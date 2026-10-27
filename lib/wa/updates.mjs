import { formatChecklistDueAt, getChecklistBusinessDate } from '../checklist-time.js';

// Pure parsing/formatting for the WhatsApp daily update; queries live in actions.js.
const maxLinesPerSection = 8;
const updatesPattern = /^(?:(?:send|show|get|give)\s+(?:me\s+)?)?(?:the\s+)?(?:daily\s+)?(?:updates?|report|status|summary)(?:\s+(?:for|of))?(?:\s+(today|aaj|yesterday|kal))?$/;
const hinglishPattern = /^(aaj|kal)\s+ka\s+(?:update|report|status)$/;
const helpPattern = /^(help|menu|commands|hi|hello)$/;

export function parseQuickCommand(text) {
  const raw = String(text || '').trim();
  const normalized = raw.toLowerCase().replace(/[.!?\s]+$/, '').replace(/\s+/g, ' ');
  if (raw === '?' || helpPattern.test(normalized)) return { kind: 'help' };
  const match = normalized.match(updatesPattern) || normalized.match(hinglishPattern);
  if (!match) return null;
  // "kal" is ambiguous in Hindi; in a status request it means yesterday.
  return { kind: 'updates', day: match[1] === 'yesterday' || match[1] === 'kal' ? 'yesterday' : 'today' };
}

export function resolveUpdateDate(day, now = new Date()) {
  return getChecklistBusinessDate(day === 'yesterday' ? new Date(now.getTime() - 86400000) : now);
}

function formatDay(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function section(title, items, render) {
  if (!items.length) return null;
  const lines = items.slice(0, maxLinesPerSection).map(render);
  if (items.length > maxLinesPerSection) lines.push(`  …and ${items.length - maxLinesPerSection} more`);
  return [`*${title} (${items.length})*`, ...lines].join('\n');
}

function who(task) {
  return task.assignee?.name || '-';
}

function clip(text, length = 120) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

/**
 * @param {{ date: string, isToday: boolean, employeeName?: string, created: any[], completed: any[], dueOpen: any[], overdue: any[], followup: any[], remarks: any[], checklist?: { done: number, pending: number, overdue: number } }} data
 */
export function formatDailyUpdate({ date, isToday, employeeName, created, completed, dueOpen, overdue, followup, remarks, checklist }) {
  const header = `📋 Updates for ${isToday ? 'today, ' : ''}${formatDay(date)}${employeeName ? ` — ${employeeName}` : ''}`;
  const totals = `Assigned ${created.length} · Completed ${completed.length} · Due & open ${dueOpen.length} · Overdue ${overdue.length} · Follow-up ${followup.length}`;
  const checklistLine = checklist ? `Checklist: done ${checklist.done} · pending ${checklist.pending} · overdue ${checklist.overdue}` : null;
  const sections = [
    section('Assigned', created, (task) => `• #${task.short_code} ${clip(task.title, 60)} → ${who(task)}, due ${formatChecklistDueAt(task.eta)}`),
    section('Completed', completed, (task) => `• #${task.short_code} ${clip(task.title, 60)} — ${who(task)}${task.eta && Date.parse(task.completed_at) > Date.parse(task.eta) ? ' (late)' : ''}`),
    section(isToday ? 'Due today, still open' : 'Was due, still open', dueOpen, (task) => `• #${task.short_code} ${clip(task.title, 60)} — ${who(task)}, ${formatChecklistDueAt(task.eta)}`),
    section('Overdue now', overdue, (task) => `• #${task.short_code} ${clip(task.title, 60)} — ${who(task)}, was due ${formatChecklistDueAt(task.eta)}`),
    section('In follow-up', followup, (task) => `• #${task.short_code} ${clip(task.title, 60)} — ${who(task)}, due ${formatChecklistDueAt(task.eta)}`),
    section('Remarks', remarks, (update) => `• #${update.task?.short_code ?? '?'} ${update.authorName || 'Someone'}: "${clip(update.remark)}"`),
  ].filter(Boolean);
  return [header, totals, ...(checklistLine ? [checklistLine] : []), ...sections].join('\n\n') + (sections.length ? '' : '\n\nNo activity yet.');
}

export const helpText = [
  'You can message me in English or Hinglish. For example:',
  '• "Assign GST filing to Varun by Friday 5pm, urgent"',
  '• "Change ETA of #12 to tomorrow 11am"',
  '• "Reassign #12 to Monika"',
  '• "Mark #12 as follow-up" / "Close #12" / "Cancel #12"',
  '• "Add remark on #12: called vendor, awaiting quote"',
  '• "Show #12" (details + latest remarks)',
  '• "Varun ke pending tasks" / "Overdue tasks" / "Follow-up tasks"',
  '• "updates" or "updates for today" (daily report), "updates yesterday"',
  'Changes need your confirmation: reply 1 to confirm, 2 to cancel.',
].join('\n');
