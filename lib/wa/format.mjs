import { formatChecklistDueAt } from '../checklist-time.js';
import { getUnifiedWorkItemStatus } from '../work-summary.mjs';

// Compact one-line renderings shared by the read handlers and proposals. Numbers come from data, never from the model.
const maxListRows = 15;
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatList(lines, max = maxListRows) {
  if (!lines.length) return 'Nothing found.';
  if (lines.length <= max) return lines.join('\n');
  return [...lines.slice(0, max), `+${lines.length - max} more`].join('\n');
}

export function resolveAssigneeName(value, assignees) {
  const needle = value.trim().toLowerCase();
  const byId = assignees.filter((employee) => employee.id === value.trim());
  const exact = byId.length ? byId : assignees.filter((employee) => employee.name.toLowerCase() === needle);
  const matches = exact.length ? exact : assignees.filter((employee) => employee.name.toLowerCase().includes(needle));
  if (matches.length === 1) return { employee: matches[0] };
  if (!matches.length) return { error: `No assignable employee matches "${value}". Ask the user who they meant.` };
  return { error: `"${value}" matches several employees: ${matches.slice(0, 5).map((employee) => employee.name).join(', ')}. Ask the user which one.` };
}

// Same pending/overdue/completed derivation as the dashboard; raw status kept for open tasks.
export function displayTaskStatus(task, now) {
  if (task.status === 'not_required') return 'cancelled';
  const status = getUnifiedWorkItemStatus(task, now, 'task');
  return status === 'pending' ? task.status : status;
}

// User-facing lines are short bullets with no internal numbers; pass { ids: true } for text the model reads.
export function formatTaskLine(task, now, { ids = false } = {}) {
  const flag = ['high', 'critical'].includes(task.priority) ? `, ${task.priority}` : '';
  return `• ${ids ? `#${task.short_code} ` : ''}${task.title} — ${task.assignee?.name || '-'}, ${displayTaskStatus(task, now)}${flag}, due ${formatChecklistDueAt(task.eta)}`;
}

export function formatChecklistLine(item, now, { ids = false } = {}) {
  const status = getUnifiedWorkItemStatus({ ...item, kind: 'checklist' }, now, 'checklist');
  return `• ${ids ? `C${item.short_code} ` : ''}${item.task} — ${item.employee?.name || '-'}, ${status}, ${item.due_at ? formatChecklistDueAt(item.due_at) : item.due_date}`;
}

function describeRecurrence(template) {
  const time = String(template.due_time || '').slice(0, 5);
  const when = {
    daily: 'daily',
    weekly: `weekly ${weekdays[template.weekday] ?? '?'}`,
    every_15_days: `every 15 days from ${template.start_date}`,
    monthly: `monthly ${(template.monthly_days?.length ? template.monthly_days : [template.day_of_month]).join(',')}`,
  }[template.frequency] || template.frequency;
  return `${when} at ${time}`;
}

export function formatTemplateLine(template, { ids = false } = {}) {
  return `• ${ids ? `R${template.short_code} ` : ''}${template.task} — ${template.employee?.name || '-'}, ${describeRecurrence(template)}${template.active ? '' : ' (paused)'}`;
}

function formatShortDate(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatMisReport({ from, to, summary, rows }) {
  const range = from && to ? `${formatShortDate(from)} – ${formatShortDate(to)}` : 'all time';
  const header = `📊 MIS ${range}\n${summary.completed}/${summary.total} done · ${summary.pending} pending · ${summary.overdue} overdue`;
  const sorted = [...rows].sort((left, right) => right.overdue_work - left.overdue_work || right.total_work - left.total_work);
  const lines = sorted.map((row) => `• ${row.employee_name}: ${row.completed_work}/${row.total_work} done (${row.on_time_work} on time) · ${row.overdue_work} overdue · ${row.pending_work} pending`);
  return [header, formatList(lines)].join('\n\n');
}
