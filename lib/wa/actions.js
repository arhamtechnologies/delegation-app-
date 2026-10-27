import { z } from 'zod';
import { taskManagerRoles } from '../task-server';
import { formatChecklistDueAt, getChecklistBusinessDate, getDateTimeParts, localDateTimeToIso } from '../checklist-time';
import { buildDailyUpdate, findTasks, getSummary, getTaskDetails } from './reads';

export { buildDailyUpdate };

// Server-side mirror of lib/task-data.js (createTask / setTaskCompletion / isEligibleTaskAssignee), which is browser-only.
const taskSelect = 'id,short_code,title,status,priority,eta,original_eta,completed_at,proof_required,assignee_id,assignee:employees!tasks_assignee_id_fkey(name)';
const defaultDueTime = '18:30';
const maxProposals = 5;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD, India time');
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/).describe('HH:MM 24-hour, India time');
const taskRef = z.number().int().positive().describe('Task number shown as #N (number only)');
const assigneeRef = z.string().trim().min(1).max(80).describe('Employee name (partial ok) or id');
const prioritySchema = z.enum(['normal', 'high', 'critical']).describe('Map "urgent"/"ASAP" to critical');

const schemas = {
  find_tasks: z.object({
    text: z.string().max(100).optional().describe('Words in the task title'),
    assignee: assigneeRef.optional(),
    status: z.enum(['open', 'overdue', 'followup', 'delayed', 'submitted', 'completed', 'cancelled', 'all']).optional().describe('Default open. followup/delayed/submitted = open tasks with that status'),
    due_on: dateSchema.optional(),
    limit: z.number().int().min(1).max(15).optional(),
  }),
  get_summary: z.object({ assignee: assigneeRef.optional() }),
  get_updates: z.object({ date: dateSchema.optional().describe('Day to report on, YYYY-MM-DD India time; default today'), assignee: assigneeRef.optional() }),
  get_task: z.object({ task: taskRef }),
  create_task: z.object({
    title: z.string().trim().min(3).max(200),
    assignee: assigneeRef,
    due_date: dateSchema,
    due_time: timeSchema.optional().describe(`HH:MM 24-hour, India time; default ${defaultDueTime}`),
    priority: prioritySchema.optional(),
    description: z.string().max(2000).optional(),
  }),
  update_task: z.object({
    task: taskRef,
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().max(2000).optional(),
    priority: prioritySchema.optional(),
    due_date: dateSchema.optional(),
    due_time: timeSchema.optional(),
  }),
  reassign_task: z.object({ task: taskRef, assignee: assigneeRef }),
  set_status: z.object({ task: taskRef, status: z.enum(['pending', 'followup', 'delayed', 'submitted', 'closed']).describe('closed = completed') }),
  cancel_task: z.object({ task: taskRef, reason: z.string().max(500).optional() }),
  add_remark: z.object({ task: taskRef, remark: z.string().trim().min(2).max(1000) }),
};

const descriptions = {
  find_tasks: 'Search tasks. Returns up to 15 lines: #N title | assignee | status | priority | due.',
  get_summary: 'Counts of open, overdue, due-today and recently completed tasks, optionally for one employee.',
  get_updates: 'Daily update report for one day: tasks assigned, completed, due, overdue, in follow-up, and remarks posted. Use for "updates", "report", "what happened today/yesterday".',
  get_task: 'Full details of one task including description, ETA history and the latest remarks. Use to check follow-up progress.',
  create_task: 'PROPOSE a new task (not saved until the user confirms).',
  update_task: 'PROPOSE changing title, description, priority or due date/time of a task.',
  reassign_task: 'PROPOSE assigning a task to another employee.',
  set_status: 'PROPOSE a status change (closed marks the task completed).',
  cancel_task: 'PROPOSE cancelling a task (status not_required).',
  add_remark: 'PROPOSE posting a remark / follow-up note on a task (shown in the task activity in the app).',
};

const writeTools = new Set(['create_task', 'update_task', 'reassign_task', 'set_status', 'cancel_task', 'add_remark']);

export const toolDefinitions = Object.entries(schemas).map(([name, schema]) => {
  const inputSchema = z.toJSONSchema(schema, { io: 'input' });
  delete inputSchema.$schema;
  return { name, description: descriptions[name], input_schema: inputSchema };
});

export async function loadAssignees(admin) {
  const { data, error } = await admin
    .from('employees')
    .select('id,name,role,active')
    .eq('active', true)
    .not('role', 'in', '("super_admin","assigner","ea")')
    .order('name');
  if (error) throw error;
  return (data || []).filter((employee) => employee.active === true && !taskManagerRoles.has(employee.role));
}

function resolveAssignee(value, assignees) {
  const needle = value.trim().toLowerCase();
  const byId = assignees.filter((employee) => employee.id === value.trim());
  const exact = byId.length ? byId : assignees.filter((employee) => employee.name.toLowerCase() === needle);
  const matches = exact.length ? exact : assignees.filter((employee) => employee.name.toLowerCase().includes(needle));
  if (matches.length === 1) return { employee: matches[0] };
  if (!matches.length) return { error: `No assignable employee matches "${value}". Ask the user who they meant.` };
  return { error: `"${value}" matches several employees: ${matches.slice(0, 5).map((employee) => employee.name).join(', ')}. Ask the user which one.` };
}

function dueToIso(dateValue, timeValue) {
  const iso = localDateTimeToIso(dateValue, timeValue);
  return iso && getChecklistBusinessDate(new Date(iso)) === dateValue ? iso : null;
}

async function loadTask(admin, shortCode) {
  const { data, error } = await admin.from('tasks').select(taskSelect).eq('short_code', shortCode).maybeSingle();
  if (error) throw error;
  return data;
}

function propose(ctx, proposal) {
  if (ctx.proposals.length >= maxProposals) return `At most ${maxProposals} changes per confirmation. Ask the user to confirm these first.`;
  ctx.proposals.push(proposal);
  return `Proposed, awaiting user confirmation: ${proposal.label}`;
}

const handlers = {
  find_tasks: (input, { admin, assignees }) => findTasks(admin, assignees, input),
  get_summary: (input, { admin, assignees }) => getSummary(admin, assignees, input),
  async get_updates(input, { admin, assignees }) {
    const resolved = input.assignee ? resolveAssignee(input.assignee, assignees) : {};
    return resolved.error || buildDailyUpdate(admin, { date: input.date, employee: resolved.employee });
  },
  get_task: (input, { admin }) => getTaskDetails(admin, input.task),

  async create_task(input, ctx) {
    const { employee, error } = resolveAssignee(input.assignee, ctx.assignees);
    if (error) return error;
    const eta = dueToIso(input.due_date, input.due_time || defaultDueTime);
    if (!eta) return 'Invalid due date or time. Use a real calendar date (YYYY-MM-DD) and HH:MM.';
    const priority = input.priority || 'normal';
    return propose(ctx, {
      kind: 'create',
      label: `Create "${input.title}" for ${employee.name}, due ${formatChecklistDueAt(eta)}, ${priority} priority`,
      record: {
        title: input.title,
        description: input.description?.trim() || null,
        priority,
        assignee_id: employee.id,
        eta,
        created_by: ctx.actor.auth_user_id,
        status: 'pending',
        category: 'General',
        attachments: [],
      },
    });
  },

  async update_task(input, ctx) {
    const task = await loadTask(ctx.admin, input.task);
    if (!task) return `Task #${input.task} was not found.`;
    const patch = {};
    const changes = [];
    if (input.title && input.title !== task.title) { patch.title = input.title; changes.push(`title "${input.title}"`); }
    if (input.description !== undefined) { patch.description = input.description.trim() || null; changes.push('description'); }
    if (input.priority && input.priority !== task.priority) { patch.priority = input.priority; changes.push(`${input.priority} priority`); }
    if (input.due_date || input.due_time) {
      const current = getDateTimeParts(new Date(task.eta));
      const eta = dueToIso(input.due_date || `${current.year}-${current.month}-${current.day}`, input.due_time || `${current.hour}:${current.minute}`);
      if (!eta) return 'Invalid due date or time. Use a real calendar date (YYYY-MM-DD) and HH:MM.';
      if (eta !== new Date(task.eta).toISOString()) {
        Object.assign(patch, { eta, eta_revised: true, original_eta: task.original_eta || task.eta });
        changes.push(`due ${formatChecklistDueAt(eta)}`);
      }
    }
    if (!changes.length) return `Nothing to change on #${task.short_code}.`;
    return propose(ctx, { kind: 'update', taskId: task.id, shortCode: task.short_code, label: `Update #${task.short_code} "${task.title}": ${changes.join(', ')}`, patch });
  },

  async reassign_task(input, ctx) {
    const task = await loadTask(ctx.admin, input.task);
    if (!task) return `Task #${input.task} was not found.`;
    const { employee, error } = resolveAssignee(input.assignee, ctx.assignees);
    if (error) return error;
    if (employee.id === task.assignee_id) return `#${task.short_code} is already assigned to ${employee.name}.`;
    return propose(ctx, {
      kind: 'reassign',
      taskId: task.id,
      shortCode: task.short_code,
      assigneeId: employee.id,
      label: `Reassign #${task.short_code} "${task.title}" from ${task.assignee?.name || '-'} to ${employee.name}`,
      patch: { assignee_id: employee.id },
    });
  },

  async set_status(input, ctx) {
    const task = await loadTask(ctx.admin, input.task);
    if (!task) return `Task #${input.task} was not found.`;
    if (task.status === input.status && (input.status !== 'closed' || task.completed_at)) return `#${task.short_code} is already ${input.status}.`;
    if (input.status === 'closed' && task.proof_required) {
      const { count, error } = await ctx.admin.from('task_updates').select('id', { count: 'exact', head: true }).eq('task_id', task.id).not('proof_url', 'is', null);
      if (error) throw error;
      if (!count) return `#${task.short_code} requires completion proof and none is attached. It can be set to submitted, or completed in the app once proof is added.`;
    }
    const label = input.status === 'closed' ? 'Mark completed' : `Set status ${input.status}`;
    return propose(ctx, { kind: 'status', taskId: task.id, shortCode: task.short_code, label: `${label}: #${task.short_code} "${task.title}"`, patch: { status: input.status } });
  },

  async cancel_task(input, ctx) {
    const task = await loadTask(ctx.admin, input.task);
    if (!task) return `Task #${input.task} was not found.`;
    if (task.status === 'not_required') return `#${task.short_code} is already cancelled.`;
    return propose(ctx, {
      kind: 'cancel',
      taskId: task.id,
      shortCode: task.short_code,
      label: `Cancel #${task.short_code} "${task.title}"${input.reason ? ` (${input.reason})` : ''}`,
      patch: { status: 'not_required', cancel_reason: input.reason?.trim() || null },
    });
  },

  async add_remark(input, ctx) {
    const task = await loadTask(ctx.admin, input.task);
    if (!task) return `Task #${input.task} was not found.`;
    return propose(ctx, {
      kind: 'remark',
      taskId: task.id,
      shortCode: task.short_code,
      label: `Add remark on #${task.short_code} "${task.title}": "${input.remark}"`,
      remark: input.remark,
    });
  },
};

export async function runTool(name, rawInput, ctx) {
  const schema = schemas[name];
  if (!schema) return `Unknown tool ${name}.`;
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) return `Invalid input: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`;
  if (writeTools.has(name) && !taskManagerRoles.has(ctx.actor.role)) return 'This user does not have permission to change tasks.';
  try {
    return await handlers[name](parsed.data, ctx);
  } catch (error) {
    console.error('WhatsApp tool failed.', { tool: name, code: error?.code, message: error?.message });
    return 'Server error while running this tool. Apologise briefly and suggest trying again.';
  }
}

async function isAssignable(admin, employeeId) {
  const { data, error } = await admin.from('employees').select('id,active,role').eq('id', employeeId).maybeSingle();
  if (error) throw error;
  return data?.active === true && !taskManagerRoles.has(data.role);
}

// Mirrors setTaskCompletion: closing stamps completed_at, any other status clears it.
function statusFields(status, nowIso) {
  if (status === 'closed') return { completed_at: nowIso };
  if (status === 'submitted') return { submitted_at: nowIso, completed_at: null };
  if (status === 'not_required') return {};
  return { completed_at: null };
}

export async function executeProposals(admin, actor, proposals) {
  const lines = [];
  for (const proposal of proposals) {
    try {
      if (!taskManagerRoles.has(actor.role)) throw new Error('Actor is not a task manager.');
      const nowIso = new Date().toISOString();
      const assigneeId = proposal.kind === 'create' ? proposal.record.assignee_id : proposal.assigneeId;
      if (assigneeId && !(await isAssignable(admin, assigneeId))) {
        lines.push(`❌ ${proposal.label}: employee can no longer receive tasks.`);
        continue;
      }
      if (proposal.kind === 'create') {
        const { data, error } = await admin.from('tasks').insert(proposal.record).select('short_code').single();
        if (error) throw error;
        lines.push(`✅ Created #${data.short_code} "${proposal.record.title}"`);
        continue;
      }
      if (proposal.kind === 'remark') {
        // Same row the task page writes for a remark.
        const { error } = await admin.from('task_updates').insert({ task_id: proposal.taskId, author_user_id: actor.auth_user_id, update_type: 'remark', remark: proposal.remark });
        if (error?.code === '23503') { lines.push(`❌ #${proposal.shortCode} no longer exists.`); continue; }
        if (error) throw error;
        lines.push(`✅ ${proposal.label}`);
        continue;
      }
      const patch = { ...proposal.patch, ...(proposal.patch.status ? statusFields(proposal.patch.status, nowIso) : {}), updated_at: nowIso };
      const { data, error } = await admin.from('tasks').update(patch).eq('id', proposal.taskId).select('short_code').maybeSingle();
      if (error) throw error;
      lines.push(data ? `✅ ${proposal.label}` : `❌ #${proposal.shortCode} no longer exists.`);
    } catch (error) {
      console.error('WhatsApp action failed.', { kind: proposal.kind, code: error?.code, message: error?.message });
      lines.push(`❌ Failed: ${proposal.label}`);
    }
  }
  return lines;
}
