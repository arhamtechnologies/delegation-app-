import { z } from 'zod';
import { getChecklistBusinessDate } from '../checklist-time.js';

// Tool schemas and prompts for the WhatsApp agent. The tool list and static prompt are frozen
// (no dates, names or history) so prompt caching can reuse them across messages.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD');
const time = z.string().regex(/^\d{2}:\d{2}$/).describe('HH:MM 24h');
const name = z.string().trim().min(1).max(80).describe('employee name');
const priority = z.enum(['normal', 'high', 'critical']);

const fields = {
  tasks: {
    action: z.enum(['find', 'get', 'summary']),
    task: z.number().int().positive().describe('task #N'),
    text: z.string().max(100).describe('words in title'),
    assignee: name,
    status: z.enum(['open', 'overdue', 'followup', 'delayed', 'submitted', 'completed', 'cancelled', 'all']),
    due_on: date,
    limit: z.number().int().min(1).max(15),
  },
  task_change: {
    action: z.enum(['create', 'update', 'reassign', 'status', 'cancel', 'delete', 'remark']),
    task: z.number().int().positive().describe('task #N'),
    title: z.string().trim().min(3).max(200),
    description: z.string().max(2000),
    instructions: z.string().max(2000),
    category: z.string().max(60),
    assignee: name,
    priority,
    due_date: date,
    due_time: time,
    start_date: date,
    proof_required: z.boolean(),
    status: z.enum(['pending', 'followup', 'delayed', 'submitted', 'closed']).describe('closed = completed'),
    reason: z.string().max(500),
    remark: z.string().trim().min(2).max(1000),
  },
  checklist: {
    action: z.enum(['find', 'templates', 'done', 'reopen', 'remark', 'template_create', 'template_update', 'template_pause', 'template_resume', 'template_delete']),
    item: z.number().int().positive().describe('checklist item C<n>'),
    template: z.number().int().positive().describe('recurring task R<n>'),
    assignee: name,
    status: z.enum(['pending', 'overdue', 'completed']),
    date,
    task: z.string().trim().min(1).max(240),
    frequency: z.enum(['daily', 'weekly', 'every_15_days', 'monthly']),
    weekday: z.number().int().min(0).max(6).describe('Sun=0..Sat=6'),
    monthly_days: z.array(z.number().int().min(1).max(31)),
    start_date: date,
    due_time: time,
    remark: z.string().trim().min(2).max(1000),
    active: z.boolean(),
  },
  reports: {
    action: z.enum(['updates', 'mis', 'followup']),
    date,
    assignee: name,
    period: z.enum(['today', 'this_week', 'this_month', 'last_month']),
  },
  leave: {
    action: z.enum(['list', 'add', 'remove', 'holiday_add', 'holiday_remove']),
    assignee: name,
    dates: z.array(date).min(1).max(31),
    date,
    name: z.string().trim().min(1).max(160).describe('holiday name'),
  },
};

const descriptions = {
  tasks: 'Read tasks: find (filter), get (one task + remarks), summary (counts).',
  task_change: 'PROPOSE a task change; user confirms after. delete = permanent delete.',
  checklist: 'Checklist items C<n> and recurring tasks R<n>: read, or PROPOSE done/reopen/remark/template changes.',
  reports: 'Ready reports sent as-is: updates (daily), mis (per-employee), followup.',
  leave: 'List leaves/holidays, or PROPOSE adding/removing them.',
};

const required = {
  'tasks.get': ['task'],
  'task_change.create': ['title', 'assignee', 'due_date'],
  'task_change.update': ['task'],
  'task_change.reassign': ['task', 'assignee'],
  'task_change.status': ['task', 'status'],
  'task_change.cancel': ['task'],
  'task_change.delete': ['task'],
  'task_change.remark': ['task', 'remark'],
  'checklist.done': ['item'],
  'checklist.reopen': ['item'],
  'checklist.remark': ['item', 'remark'],
  'checklist.template_create': ['assignee', 'task', 'frequency'],
  'checklist.template_update': ['template'],
  'checklist.template_pause': ['template'],
  'checklist.template_resume': ['template'],
  'checklist.template_delete': ['template'],
  'leave.add': ['assignee', 'dates'],
  'leave.remove': ['assignee', 'dates'],
  'leave.holiday_add': ['name', 'dates'],
  'leave.holiday_remove': ['date'],
};

export const toolSchemas = Object.fromEntries(Object.entries(fields).map(([tool, shape]) => [tool, z.object(
  Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, key === 'action' ? schema : schema.optional()])),
)]));

export function missingFields(tool, input) {
  return (required[`${tool}.${input.action}`] || []).filter((key) => input[key] === undefined);
}

export const toolDefinitions = Object.keys(fields).map((tool) => {
  const inputSchema = z.toJSONSchema(toolSchemas[tool], { io: 'input' });
  delete inputSchema.$schema;
  return { name: tool, description: descriptions[tool], input_schema: inputSchema };
});

export const staticSystemPrompt = [
  'You are the WhatsApp assistant of a task delegation app, talking to its directors and EA.',
  "Reply in the user's language (English, Hindi or Hinglish) as plain WhatsApp text, at most 2 short lines, no markdown headings or tables.",
  'Look things up with tasks, checklist (find/templates) and reports. Tasks are #N, checklist items C<n>, recurring checklist tasks R<n>.',
  'Anything that changes data only PROPOSES: the app lists the proposals and asks the user to reply 1 to confirm or 2 to cancel. Never say a change is done and never repeat the proposal text.',
  'Word mapping: remove/delete/hata do = task_change delete (permanent). cancel = cancel. done/complete/ho gaya = task_change status closed for #N, checklist done for C<n>. ETA or deadline = due date/time. "Follow up on #N" = tasks get (latest remarks), or add a remark if asked.',
  'Results of reports are sent to the user as they are, so do not retype them. Quote numbers from tool output and never calculate them.',
  'Priority is normal, high or critical; urgent, ASAP or turant = critical. Convert relative dates (today, kal, parso, Friday) to YYYY-MM-DD in India time. Weekdays: Sun=0 to Sat=6. Default due time 18:30.',
  'If a tool returns an error or the request is ambiguous, ask one short question instead of guessing.',
].join('\n');

/** Render order is tools, then system: one marker on the static block caches both. 1h because messages arrive sporadically. */
export function buildSystem(dynamicContext) {
  return [
    { type: 'text', text: staticSystemPrompt, cache_control: { type: 'ephemeral', ttl: '1h' } },
    { type: 'text', text: dynamicContext },
  ];
}

const roleLabels = { super_admin: 'Director', assigner: 'Director', ea: 'EA' };
const historyLimit = 4;
const historyChars = 200;

function clipHistory(entry) {
  const body = String(entry.body || '');
  const text = entry.direction === 'in' ? body.replace(/\s+/g, ' ') : body.split('\n')[0];
  return `${entry.direction === 'in' ? 'User' : 'Bot'}: ${text.slice(0, historyChars)}`;
}

/** The part of the prompt that changes per message; sent after the cached prefix. */
export function buildDynamicContext({ actor, assigneeNames, history, now }) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(now);
  return [
    `Today is ${weekday}, ${getChecklistBusinessDate(now)} (India time). User: ${actor.name} (${roleLabels[actor.role] || actor.role}).`,
    `Employees: ${assigneeNames.join(', ') || 'none'}`,
    history.length ? `Recent messages:\n${history.slice(-historyLimit).map(clipHistory).join('\n')}` : null,
  ].filter(Boolean).join('\n');
}
