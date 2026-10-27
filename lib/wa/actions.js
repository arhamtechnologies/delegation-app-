import { z } from 'zod';
import { taskManagerRoles } from '../task-server';
import { formatChecklistDueAt, getChecklistBusinessDate, getDateTimeParts, localDateTimeToIso } from '../checklist-time';
import { getUnifiedWorkItemStatus } from '../work-summary.mjs';
import { formatDailyUpdate } from './updates.mjs';

// Server-side mirror of lib/task-data.js (createTask / setTaskCompletion / isEligibleTaskAssignee), which is browser-only.
const taskSelect = 'id,short_code,title,status,priority,eta,original_eta,completed_at,proof_required,assignee_id,assignee:employees!tasks_assignee_id_fkey(name)';
const openStatusFilter = '(closed,not_required)';
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

// Same pending/overdue/completed derivation as the dashboard; raw status kept for open tasks.
function displayStatus(task, now) {
  if (task.status === 'not_required') return 'cancelled';
  const status = getUnifiedWorkItemStatus(task, now, 'task');
  return status === 'pending' ? task.status : status;
}

function formatTaskLine(task, now) {
  return `#${task.short_code} ${task.title} | ${task.assignee?.name || '-'} | ${displayStatus(task, now)} | ${task.priority} | due ${formatChecklistDueAt(task.eta)}`;
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
  async find_tasks(input, { admin, assignees }) {
    const now = new Date();
    const nowIso = now.toISOString();
    const status = input.status || 'open';
    let query = admin.from('tasks').select(taskSelect).order('eta', { ascending: status !== 'completed' }).limit(input.limit || 10);
    const text = input.text?.replace(/[%_,()]/g, ' ').trim();
    if (text) query = query.ilike('title', `%${text}%`);
    if (input.assignee) {
      const { employee, error } = resolveAssignee(input.assignee, assignees);
      if (error) return error;
      query = query.eq('assignee_id', employee.id);
    }
    if (['open', 'overdue', 'followup', 'delayed', 'submitted'].includes(status)) query = query.not('status', 'in', openStatusFilter).is('completed_at', null);
    if (status === 'overdue') query = query.lt('eta', nowIso);
    if (['followup', 'delayed', 'submitted'].includes(status)) query = query.eq('status', status);
    if (status === 'completed') query = query.or('status.eq.closed,completed_at.not.is.null');
    if (status === 'cancelled') query = query.eq('status', 'not_required');
    if (input.due_on) {
      const start = dueToIso(input.due_on, '00:00');
      if (!start) return 'Invalid due_on date.';
      query = query.gte('eta', start).lt('eta', new Date(Date.parse(start) + 86400000).toISOString());
    }
    const { data, error } = await query;
    if (error) throw error;
    return data?.length ? data.map((task) => formatTaskLine(task, now)).join('\n') : 'No matching tasks.';
  },

  async get_summary(input, { admin, assignees }) {
    const now = new Date();
    let employee = null;
    if (input.assignee) {
      const resolved = resolveAssignee(input.assignee, assignees);
      if (resolved.error) return resolved.error;
      employee = resolved.employee;
    }
    let openQuery = admin.from('tasks').select('status,eta,completed_at,assignee_id').not('status', 'in', openStatusFilter).is('completed_at', null).limit(5000);
    let doneQuery = admin.from('tasks').select('id', { count: 'exact', head: true }).gte('completed_at', new Date(now.getTime() - 7 * 86400000).toISOString());
    if (employee) {
      openQuery = openQuery.eq('assignee_id', employee.id);
      doneQuery = doneQuery.eq('assignee_id', employee.id);
    }
    const [openResult, doneResult] = await Promise.all([openQuery, doneQuery]);
    if (openResult.error) throw openResult.error;
    if (doneResult.error) throw doneResult.error;
    const open = openResult.data || [];
    const today = getChecklistBusinessDate(now);
    const overdue = open.filter((task) => getUnifiedWorkItemStatus(task, now, 'task') === 'overdue');
    const dueToday = open.filter((task) => getChecklistBusinessDate(new Date(task.eta)) === today);
    const lines = [
      `${employee ? employee.name : 'All employees'}: ${open.length} open, ${overdue.length} overdue, ${dueToday.length} due today, ${doneResult.count || 0} completed in last 7 days.`,
    ];
    if (!employee && overdue.length) {
      const names = new Map(assignees.map((item) => [item.id, item.name]));
      const counts = new Map();
      overdue.forEach((task) => counts.set(task.assignee_id, (counts.get(task.assignee_id) || 0) + 1));
      const top = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
      lines.push(`Most overdue: ${top.map(([id, count]) => `${names.get(id) || 'Unknown'} ${count}`).join(', ')}`);
    }
    return lines.join('\n');
  },

  async get_updates(input, { admin, assignees }) {
    let employee = null;
    if (input.assignee) {
      const resolved = resolveAssignee(input.assignee, assignees);
      if (resolved.error) return resolved.error;
      employee = resolved.employee;
    }
    return buildDailyUpdate(admin, { date: input.date, employee });
  },

  async get_task(input, { admin }) {
    const { data: task, error } = await admin
      .from('tasks')
      .select(`${taskSelect},description,created_at,eta_revised,cancel_reason`)
      .eq('short_code', input.task)
      .maybeSingle();
    if (error) throw error;
    if (!task) return `Task #${input.task} was not found.`;
    const remarks = await loadRemarks(admin, (query) => query.eq('task_id', task.id).order('created_at', { ascending: false }).limit(5));
    const lines = [
      formatTaskLine(task, new Date()),
      `Created ${formatChecklistDueAt(task.created_at)}${task.eta_revised && task.original_eta ? ` | ETA revised from ${formatChecklistDueAt(task.original_eta)}` : ''}${task.completed_at ? ` | completed ${formatChecklistDueAt(task.completed_at)}` : ''}`,
    ];
    if (task.description) lines.push(`Description: ${task.description.slice(0, 500)}`);
    if (task.cancel_reason) lines.push(`Cancel reason: ${task.cancel_reason}`);
    lines.push(remarks.length
      ? `Latest remarks:\n${remarks.map((remark) => `- ${formatChecklistDueAt(remark.created_at)} ${remark.authorName || 'Someone'}: ${String(remark.remark || remark.update_type).slice(0, 300)}`).join('\n')}`
      : 'No remarks yet.');
    return lines.join('\n');
  },

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

// task_updates.author_user_id is an auth user; names come from the matching employee row.
async function loadRemarks(admin, scope, select = 'id,task_id,update_type,remark,created_at,author_user_id') {
  const { data, error } = await scope(admin.from('task_updates').select(select));
  if (error) throw error;
  const authorIds = [...new Set((data || []).map((remark) => remark.author_user_id).filter(Boolean))];
  if (!authorIds.length) return data || [];
  const { data: authors, error: authorError } = await admin.from('employees').select('auth_user_id,name').in('auth_user_id', authorIds);
  if (authorError) throw authorError;
  const names = new Map((authors || []).map((author) => [author.auth_user_id, author.name]));
  return (data || []).map((remark) => ({ ...remark, authorName: names.get(remark.author_user_id) }));
}

export async function buildDailyUpdate(admin, { date, employee } = {}) {
  const now = new Date();
  const today = getChecklistBusinessDate(now);
  const day = date || today;
  const start = dueToIso(day, '00:00');
  if (!start) return 'Invalid date.';
  const end = new Date(Date.parse(start) + 86400000).toISOString();
  const nowIso = now.toISOString();
  const forEmployee = (query) => (employee ? query.eq('assignee_id', employee.id) : query);
  const openTasks = (scope) => scope(forEmployee(admin.from('tasks').select(taskSelect).not('status', 'in', openStatusFilter).is('completed_at', null))).order('eta').limit(100);

  const [created, completed, dueOpen, overdue, followup, remarks] = await Promise.all([
    forEmployee(admin.from('tasks').select(taskSelect).gte('created_at', start).lt('created_at', end)).order('created_at').limit(100),
    forEmployee(admin.from('tasks').select(taskSelect).gte('completed_at', start).lt('completed_at', end)).order('completed_at').limit(100),
    openTasks((query) => query.gte('eta', day === today ? nowIso : start).lt('eta', end)),
    openTasks((query) => query.lt('eta', nowIso)),
    openTasks((query) => query.eq('status', 'followup')),
    loadRemarks(
      admin,
      (query) => (employee ? query.eq('task.assignee_id', employee.id) : query).gte('created_at', start).lt('created_at', end).order('created_at').limit(100),
      'id,remark,update_type,created_at,author_user_id,task:tasks!inner(short_code,title,assignee_id)',
    ),
  ]);
  for (const result of [created, completed, dueOpen, overdue, followup]) if (result.error) throw result.error;

  return formatDailyUpdate({
    date: day,
    isToday: day === today,
    employeeName: employee?.name,
    created: created.data || [],
    completed: completed.data || [],
    dueOpen: dueOpen.data || [],
    overdue: overdue.data || [],
    followup: followup.data || [],
    remarks: remarks.filter((remark) => remark.remark),
  });
}

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
