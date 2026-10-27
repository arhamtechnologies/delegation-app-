import { formatChecklistDueAt, getChecklistBusinessDate, getDateTimeParts } from '../checklist-time';
import { normalizeTemplateRecord } from '../checklist-template-record.mjs';
import { defaultDueTime, dueToIso, taskSelect } from './common';
import { resolveAssigneeName } from './format.mjs';
import { canPropose, deleteTaskLabel, deleteTemplateLabel } from './permissions.mjs';

// Proposal builders. Each one validates against live data and pushes a proposal (or returns a short
// error string for the model to relay). Nothing is written until the user confirms.
const maxProposals = 5;
const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const checklistItemSelect = 'id,short_code,task,status,due_date,employee_id,employee:employees!checklist_items_employee_id_fkey(name)';
const templateSelect = 'id,short_code,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active,employee:employees!checklist_templates_employee_id_fkey(name)';

function propose(ctx, proposal) {
  if (ctx.proposals.length >= maxProposals) return `At most ${maxProposals} changes per confirmation. Ask the user to confirm these first.`;
  const refusal = canPropose(ctx.actor.role, proposal.kind, { ownEmployeeId: ctx.actor.id, targetEmployeeId: proposal.targetEmployeeId });
  if (refusal) return refusal;
  ctx.proposals.push(proposal);
  return `Proposed, awaiting user confirmation: ${proposal.label}`;
}

async function loadTask(admin, shortCode) {
  const { data, error } = await admin.from('tasks').select(taskSelect).eq('short_code', shortCode).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadChecklistItem(admin, shortCode) {
  const { data, error } = await admin.from('checklist_items').select(checklistItemSelect).eq('short_code', shortCode).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadTemplate(admin, shortCode) {
  const { data, error } = await admin.from('checklist_templates').select(templateSelect).eq('short_code', shortCode).maybeSingle();
  if (error) throw error;
  return data;
}

function validDay(value) {
  return typeof value === 'string' && Boolean(dueToIso(value, '00:00'));
}

function formatDay(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, day)));
}

// ---- tasks ----

export async function proposeTaskCreate(ctx, input) {
  const { employee, error } = resolveAssigneeName(input.assignee, ctx.assignees);
  if (error) return error;
  const eta = dueToIso(input.due_date, input.due_time || defaultDueTime);
  if (!eta) return 'Invalid due date or time. Use a real calendar date (YYYY-MM-DD) and HH:MM.';
  if (input.start_date && !validDay(input.start_date)) return 'Invalid start_date.';
  const priority = input.priority || 'normal';
  return propose(ctx, {
    kind: 'task_create',
    label: `Create "${input.title}" for ${employee.name}, due ${formatChecklistDueAt(eta)}, ${priority} priority`,
    record: {
      title: input.title,
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() || null,
      priority,
      assignee_id: employee.id,
      eta,
      start_date: input.start_date ? dueToIso(input.start_date, '00:00') : null,
      created_by: ctx.actor.auth_user_id,
      status: 'pending',
      category: input.category?.trim() || 'General',
      proof_required: input.proof_required ?? true,
      attachments: [],
    },
  });
}

export async function proposeTaskUpdate(ctx, input) {
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
  return propose(ctx, { kind: 'task_update', taskId: task.id, shortCode: task.short_code, label: `Update #${task.short_code} "${task.title}": ${changes.join(', ')}`, patch });
}

export async function proposeTaskReassign(ctx, input) {
  const task = await loadTask(ctx.admin, input.task);
  if (!task) return `Task #${input.task} was not found.`;
  const { employee, error } = resolveAssigneeName(input.assignee, ctx.assignees);
  if (error) return error;
  if (employee.id === task.assignee_id) return `#${task.short_code} is already assigned to ${employee.name}.`;
  return propose(ctx, {
    kind: 'task_reassign',
    taskId: task.id,
    shortCode: task.short_code,
    assigneeId: employee.id,
    label: `Reassign #${task.short_code} "${task.title}" from ${task.assignee?.name || '-'} to ${employee.name}`,
    patch: { assignee_id: employee.id },
  });
}

export async function proposeTaskStatus(ctx, input) {
  const task = await loadTask(ctx.admin, input.task);
  if (!task) return `Task #${input.task} was not found.`;
  if (task.status === input.status && (input.status !== 'closed' || task.completed_at)) return `#${task.short_code} is already ${input.status}.`;
  if (input.status === 'closed' && task.proof_required) {
    const { count, error } = await ctx.admin.from('task_updates').select('id', { count: 'exact', head: true }).eq('task_id', task.id).not('proof_url', 'is', null);
    if (error) throw error;
    if (!count) return `#${task.short_code} requires completion proof and none is attached. It can be set to submitted, or completed in the app once proof is added.`;
  }
  const label = input.status === 'closed' ? 'Mark completed' : `Set status ${input.status}`;
  return propose(ctx, { kind: 'task_status', taskId: task.id, shortCode: task.short_code, label: `${label}: #${task.short_code} "${task.title}"`, patch: { status: input.status } });
}

export async function proposeTaskCancel(ctx, input) {
  const task = await loadTask(ctx.admin, input.task);
  if (!task) return `Task #${input.task} was not found.`;
  if (task.status === 'not_required') return `#${task.short_code} is already cancelled.`;
  return propose(ctx, {
    kind: 'task_cancel',
    taskId: task.id,
    shortCode: task.short_code,
    label: `Cancel #${task.short_code} "${task.title}"${input.reason ? ` (${input.reason})` : ''}`,
    patch: { status: 'not_required', cancel_reason: input.reason?.trim() || null },
  });
}

export async function proposeTaskDelete(ctx, input) {
  const task = await loadTask(ctx.admin, input.task);
  if (!task) return `Task #${input.task} was not found.`;
  return propose(ctx, { kind: 'task_delete', taskId: task.id, shortCode: task.short_code, label: deleteTaskLabel(task) });
}

export async function proposeTaskRemark(ctx, input) {
  const task = await loadTask(ctx.admin, input.task);
  if (!task) return `Task #${input.task} was not found.`;
  return propose(ctx, {
    kind: 'task_remark',
    taskId: task.id,
    shortCode: task.short_code,
    label: `Add remark on #${task.short_code} "${task.title}": "${input.remark}"`,
    remark: input.remark,
  });
}

// ---- checklist items ----

async function proposeChecklistCompletion(ctx, ref, completed) {
  const item = await loadChecklistItem(ctx.admin, ref);
  if (!item) return `Checklist item C${ref} was not found.`;
  if (item.status === 'deactivated' && completed) return `C${item.short_code} was deactivated (non-working day) and can't be completed from here.`;
  if (completed && item.status === 'completed') return `C${item.short_code} is already completed.`;
  if (!completed && item.status !== 'completed') return `C${item.short_code} is not completed, so there is nothing to reopen.`;
  return propose(ctx, {
    kind: completed ? 'checklist_done' : 'checklist_reopen',
    itemId: item.id,
    shortCode: item.short_code,
    targetEmployeeId: item.employee_id,
    label: `${completed ? 'Mark done' : 'Reopen'}: C${item.short_code} "${item.task}" (${item.employee?.name || '-'}, ${item.due_date})`,
  });
}

export const proposeChecklistDone = (ctx, input) => proposeChecklistCompletion(ctx, input.item, true);
export const proposeChecklistReopen = (ctx, input) => proposeChecklistCompletion(ctx, input.item, false);

export async function proposeChecklistRemark(ctx, input) {
  const item = await loadChecklistItem(ctx.admin, input.item);
  if (!item) return `Checklist item C${input.item} was not found.`;
  return propose(ctx, {
    kind: 'checklist_remark',
    itemId: item.id,
    shortCode: item.short_code,
    label: `Add remark on C${item.short_code} "${item.task}": "${input.remark}"`,
    remark: input.remark,
  });
}

// ---- recurring checklist tasks (templates) ----

function templatePayload(template, changes) {
  return {
    employee_id: changes.employee_id ?? template.employee_id,
    task: changes.task ?? template.task,
    frequency: changes.frequency ?? template.frequency,
    weekday: changes.weekday ?? template.weekday,
    monthly_days: changes.monthly_days ?? (template.monthly_days?.length ? template.monthly_days : template.day_of_month ? [template.day_of_month] : []),
    start_date: changes.start_date ?? template.start_date ?? getChecklistBusinessDate(new Date()),
    due_time: (changes.due_time ?? String(template.due_time || '')).slice(0, 5),
    active: changes.active ?? template.active,
  };
}

function describePayload(payload) {
  const time = payload.due_time;
  if (payload.frequency === 'weekly') return `weekly ${weekdayNames[payload.weekday]} at ${time}`;
  if (payload.frequency === 'monthly') return `monthly on ${payload.monthly_days.join(',')} at ${time}`;
  if (payload.frequency === 'every_15_days') return `every 15 days from ${formatDay(payload.start_date)} at ${time}`;
  return `daily at ${time}`;
}

export async function proposeTemplateCreate(ctx, input) {
  const { employee, error } = resolveAssigneeName(input.assignee, ctx.assignees);
  if (error) return error;
  const payload = {
    employee_id: employee.id,
    task: input.task,
    frequency: input.frequency,
    weekday: input.weekday,
    monthly_days: input.monthly_days,
    start_date: input.start_date || getChecklistBusinessDate(new Date()),
    due_time: input.due_time || defaultDueTime,
    active: true,
  };
  try { normalizeTemplateRecord(payload, ctx.actor.auth_user_id); } catch (validationError) { return validationError.message; }
  return propose(ctx, { kind: 'template_create', payload, label: `Add recurring checklist task "${input.task}" for ${employee.name}: ${describePayload(payload)}` });
}

export async function proposeTemplateUpdate(ctx, input) {
  const template = await loadTemplate(ctx.admin, input.template);
  if (!template) return `Recurring checklist task R${input.template} was not found.`;
  const changes = {};
  if (input.assignee) {
    const { employee, error } = resolveAssigneeName(input.assignee, ctx.assignees);
    if (error) return error;
    changes.employee_id = employee.id;
  }
  for (const key of ['task', 'frequency', 'weekday', 'monthly_days', 'start_date', 'due_time']) if (input[key] !== undefined) changes[key] = input[key];
  const payload = { id: template.id, ...templatePayload(template, changes) };
  try { normalizeTemplateRecord(payload); } catch (validationError) { return validationError.message; }
  return propose(ctx, { kind: 'template_update', templateId: template.id, shortCode: template.short_code, payload, label: `Update R${template.short_code} "${template.task}": ${describePayload(payload)}` });
}

async function proposeTemplateActive(ctx, ref, active) {
  const template = await loadTemplate(ctx.admin, ref);
  if (!template) return `Recurring checklist task R${ref} was not found.`;
  if (template.active === active) return `R${template.short_code} is already ${active ? 'active' : 'paused'}.`;
  return propose(ctx, {
    kind: active ? 'template_resume' : 'template_pause',
    templateId: template.id,
    shortCode: template.short_code,
    payload: { id: template.id, ...templatePayload(template, { active }) },
    label: `${active ? 'Resume' : 'Pause'} R${template.short_code} "${template.task}"`,
  });
}

export const proposeTemplatePause = (ctx, input) => proposeTemplateActive(ctx, input.template, false);
export const proposeTemplateResume = (ctx, input) => proposeTemplateActive(ctx, input.template, true);

export async function proposeTemplateDelete(ctx, input) {
  const template = await loadTemplate(ctx.admin, input.template);
  if (!template) return `Recurring checklist task R${input.template} was not found.`;
  return propose(ctx, { kind: 'template_delete', templateId: template.id, shortCode: template.short_code, label: deleteTemplateLabel(template) });
}

// ---- leaves and holidays ----

export async function proposeLeave(ctx, input, adding) {
  const { employee, error } = resolveAssigneeName(input.assignee, ctx.assignees);
  if (error) return error;
  const dates = [...new Set(input.dates)].sort();
  if (!dates.length || dates.some((date) => !validDay(date))) return 'Dates must be real calendar dates (YYYY-MM-DD).';
  return propose(ctx, {
    kind: adding ? 'leave_add' : 'leave_remove',
    employeeId: employee.id,
    dates,
    label: `${adding ? 'Mark' : 'Remove leave for'} ${employee.name}${adding ? ' on leave' : ''}: ${dates.map(formatDay).join(', ')}`,
  });
}

export async function proposeHolidayAdd(ctx, input) {
  const dates = [...new Set(input.dates)].sort();
  if (!dates.length || dates.some((date) => !validDay(date))) return 'Dates must be real calendar dates (YYYY-MM-DD).';
  return propose(ctx, { kind: 'holiday_add', name: input.name, dates, label: `Add national holiday "${input.name}": ${dates.map(formatDay).join(', ')}` });
}

export async function proposeHolidayRemove(ctx, input) {
  if (!validDay(input.date)) return 'Date must be a real calendar date (YYYY-MM-DD).';
  const { data, error } = await ctx.admin.from('national_holidays').select('id,holiday_date,name').eq('country', 'India').eq('is_active', true).eq('holiday_date', input.date);
  if (error) throw error;
  if (!data?.length) return `No active national holiday on ${formatDay(input.date)}.`;
  const results = data.map((holiday) => propose(ctx, { kind: 'holiday_remove', holidayId: holiday.id, label: `Remove national holiday "${holiday.name}" (${formatDay(holiday.holiday_date)})` }));
  return results.join('\n');
}
