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

const maxTodayLines = 30;

/**
 * Today's overdue / pending work. `items` are { who, title, status, due, checklist }.
 * Whole team: grouped by person. One person: grouped by status.
 */
export function formatTodayWork({ items, statuses, person, earlierOverdue = 0 }) {
  const label = statuses.length === 2 ? 'Overdue & pending today' : statuses[0] === 'overdue' ? 'Overdue today' : 'Pending today';
  const counts = statuses.map((status) => `${items.filter((item) => item.status === status).length} ${status}`).join(' · ');
  const header = `📌 ${label}${person ? ` — ${person}` : ''}\n${counts}`;
  const older = earlierOverdue && statuses.includes('overdue') ? `\n\nAlso ${earlierOverdue} overdue from earlier days (see Tasks in the app).` : '';
  if (!items.length) return `${header}\n\nNothing ${statuses.length === 2 ? 'overdue or pending' : statuses[0]} today.${older}`;
  const line = (item, showStatus) => `• ${item.title}${item.checklist ? ' (checklist)' : ''} — ${showStatus ? `${item.status}, ` : ''}${item.due}`;
  const blocks = [];
  if (person) {
    statuses.forEach((status) => {
      const rows = items.filter((item) => item.status === status);
      if (rows.length) blocks.push({ title: `${status === 'overdue' ? 'Overdue' : 'Pending'} (${rows.length})`, lines: rows.map((item) => line(item, false)) });
    });
  } else {
    const byPerson = new Map();
    items.forEach((item) => byPerson.set(item.who, [...(byPerson.get(item.who) || []), item]));
    [...byPerson.entries()].sort((left, right) => right[1].filter((item) => item.status === 'overdue').length - left[1].filter((item) => item.status === 'overdue').length || right[1].length - left[1].length).forEach(([name, rows]) => {
      blocks.push({ title: `${name} (${rows.length})`, lines: rows.map((item) => line(item, statuses.length === 2)) });
    });
  }
  let remaining = maxTodayLines;
  let hidden = 0;
  const text = blocks.map((block) => {
    const shown = block.lines.slice(0, Math.max(0, remaining));
    remaining -= shown.length;
    hidden += block.lines.length - shown.length;
    return shown.length ? [`*${block.title}*`, ...shown].join('\n') : null;
  }).filter(Boolean).join('\n\n');
  return `${header}\n\n${text}${hidden ? `\n\n+${hidden} more` : ''}${older}`;
}

/** The dashboard in one message: today's totals, who has what, and what was assigned today. */
export function formatDashboardStats({ date, summary, rows, assigned, earlierOverdue = 0, person }) {
  const header = `📊 Dashboard${person ? ` — ${person}` : ''} · ${formatShortDate(date)}`;
  const totals = `Total ${summary.total} · Pending ${summary.pending} · Overdue ${summary.overdue} · Completed ${summary.completed}\nTasks ${summary.tasks} · Checklist ${summary.checklist}`;
  const sorted = [...rows].sort((left, right) => right.overdue_work - left.overdue_work || right.pending_work - left.pending_work);
  const people = !person && sorted.length ? `*By person*\n${formatList(sorted.map((row) => `• ${row.employee_name}: ${row.completed_work}/${row.total_work} done · ${row.pending_work} pending · ${row.overdue_work} overdue`), 12)}` : null;
  const assignedLine = assigned.total
    ? `*Assigned today (${assigned.total})*\n${assigned.byPerson.slice(0, 8).map(([name, count]) => `• ${name}: ${count}`).join('\n')}`
    : 'No new tasks assigned today.';
  const older = earlierOverdue ? `Also ${earlierOverdue} overdue from earlier days.` : null;
  return [header, totals, people, assignedLine, older].filter(Boolean).join('\n\n');
}
