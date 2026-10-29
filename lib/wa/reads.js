import { formatChecklistDueAt, getChecklistBusinessDate } from '../checklist-time';
import { addFollowUpMetadata } from '../follow-up-tasks.mjs';
import { dedupeWorkItems, getWorkItemStatus, sortWorkItemsChronologically, toChecklistWorkItem, toTaskWorkItem } from '../work-items.mjs';
import { validateWorkReportPayload } from '../work-list.mjs';
import { getUnifiedWorkItemStatus } from '../work-summary.mjs';
import { dueToIso, openStatusFilter, taskSelect } from './common';
import { misRange } from './dates.mjs';
import { formatChecklistLine, formatList, formatDashboardStats, formatMisReport, formatTodayWork, formatTaskLine, formatTemplateLine, resolveAssigneeName } from './format.mjs';
import { formatDailyUpdate } from './updates.mjs';

const checklistSelect = 'id,short_code,task,due_date,due_at,status,completed_at,employee_id,employee:employees!checklist_items_employee_id_fkey(name),template:checklist_templates!checklist_items_template_id_fkey(frequency)';
const templateSelect = 'id,short_code,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active,employee:employees!checklist_templates_employee_id_fkey(name)';
const pageSize = 1000;

async function resolveEmployee(value, assignees) {
  if (!value) return {};
  return resolveAssigneeName(value, assignees);
}

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

export async function findTasks(admin, assignees, input, options = {}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const status = input.status || 'open';
  let query = admin.from('tasks').select(taskSelect).order('eta', { ascending: status !== 'completed' }).limit(input.limit || 10);
  const text = input.text?.replace(/[%_,()]/g, ' ').trim();
  if (text) query = query.ilike('title', `%${text}%`);
  if (input.assignee) {
    const { employee, error } = resolveAssigneeName(input.assignee, assignees);
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
  return data?.length ? formatList(data.map((task) => formatTaskLine(task, now, options))) : 'No matching tasks.';
}

export async function getTaskDetails(admin, ref, options = {}) {
  const { data: task, error } = await admin
    .from('tasks')
    .select(`${taskSelect},description,created_at,eta_revised,cancel_reason`)
    .eq('short_code', ref)
    .maybeSingle();
  if (error) throw error;
  if (!task) return `Task #${ref} was not found.`;
  const remarks = await loadRemarks(admin, (query) => query.eq('task_id', task.id).order('created_at', { ascending: false }).limit(5));
  const lines = [
    formatTaskLine(task, new Date(), options),
    `• Created ${formatChecklistDueAt(task.created_at)}${task.eta_revised && task.original_eta ? `, ETA revised from ${formatChecklistDueAt(task.original_eta)}` : ''}${task.completed_at ? `, completed ${formatChecklistDueAt(task.completed_at)}` : ''}`,
  ];
  if (task.description) lines.push(`• Description: ${task.description.slice(0, 300)}`);
  if (task.cancel_reason) lines.push(`• Cancel reason: ${task.cancel_reason}`);
  lines.push(remarks.length
    ? `Latest remarks:\n${remarks.map((remark) => `• ${remark.authorName || 'Someone'} (${formatChecklistDueAt(remark.created_at)}): ${String(remark.remark || remark.update_type).slice(0, 200)}`).join('\n')}`
    : 'No remarks yet.');
  return lines.join('\n');
}

export async function getSummary(admin, assignees, input) {
  const now = new Date();
  const resolved = await resolveEmployee(input.assignee, assignees);
  if (resolved.error) return resolved.error;
  const employee = resolved.employee || null;
  let openQuery = admin.from('tasks').select('status,eta,completed_at,assignee_id').not('status', 'in', openStatusFilter).is('completed_at', null).limit(5000);
  let doneQuery = admin.from('tasks').select('id', { count: 'exact', head: true }).gte('completed_at', new Date(now.getTime() - 7 * 86400000).toISOString());
  if (employee) {
    openQuery = openQuery.eq('assignee_id', employee.id);
    doneQuery = doneQuery.eq('assignee_id', employee.id);
  }
  const today = getChecklistBusinessDate(now);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  // Checklist work counts too: it is most of what the dashboard shows as overdue or pending.
  let checklistOpenQuery = admin.from('checklist_items').select('status,completed_at,due_at,due_date,employee_id').neq('status', 'deactivated').neq('status', 'completed').is('completed_at', null).lte('due_date', today).limit(5000);
  let checklistDoneQuery = admin.from('checklist_items').select('id', { count: 'exact', head: true }).gte('completed_at', weekAgo);
  if (employee) {
    checklistOpenQuery = checklistOpenQuery.eq('employee_id', employee.id);
    checklistDoneQuery = checklistDoneQuery.eq('employee_id', employee.id);
  }
  const [openResult, doneResult, checklistOpenResult, checklistDoneResult] = await Promise.all([openQuery, doneQuery, checklistOpenQuery, checklistDoneQuery]);
  for (const result of [openResult, doneResult, checklistOpenResult, checklistDoneResult]) if (result.error) throw result.error;
  const open = openResult.data || [];
  const overdue = open.filter((task) => getUnifiedWorkItemStatus(task, now, 'task') === 'overdue');
  const dueToday = open.filter((task) => getChecklistBusinessDate(new Date(task.eta)) === today);
  const checklistOpen = checklistOpenResult.data || [];
  const checklistOverdue = checklistOpen.filter((item) => getUnifiedWorkItemStatus({ ...item, kind: 'checklist' }, now, 'checklist') === 'overdue');
  const checklistToday = checklistOpen.filter((item) => item.due_date === today);
  const lines = [
    `${employee ? employee.name : 'All employees'}: ${open.length + checklistOpen.length} open, ${overdue.length + checklistOverdue.length} overdue, ${dueToday.length + checklistToday.length} due today, ${(doneResult.count || 0) + (checklistDoneResult.count || 0)} completed in last 7 days.`,
    `Tasks: ${open.length} open, ${overdue.length} overdue · Checklist: ${checklistOpen.length} open, ${checklistOverdue.length} overdue.`,
  ];
  if (!employee && overdue.length) {
    const names = new Map(assignees.map((item) => [item.id, item.name]));
    const counts = new Map();
    overdue.forEach((task) => counts.set(task.assignee_id, (counts.get(task.assignee_id) || 0) + 1));
    const top = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
    lines.push(`Most overdue: ${top.map(([id, count]) => `${names.get(id) || 'Unknown'} ${count}`).join(', ')}`);
  }
  return lines.join('\n');
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
  let checklistQuery = admin.from('checklist_items').select('status,completed_at,due_at,due_date').eq('due_date', day).neq('status', 'deactivated').limit(1000);
  if (employee) checklistQuery = checklistQuery.eq('employee_id', employee.id);

  const [created, completed, dueOpen, overdue, followup, remarks, checklistRows] = await Promise.all([
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
    checklistQuery,
  ]);
  for (const result of [created, completed, dueOpen, overdue, followup, checklistRows]) if (result.error) throw result.error;

  const counts = { done: 0, pending: 0, overdue: 0 };
  for (const item of checklistRows.data || []) {
    const status = getUnifiedWorkItemStatus({ ...item, kind: 'checklist' }, now, 'checklist');
    if (status === 'completed') counts.done += 1;
    else counts[status === 'overdue' ? 'overdue' : 'pending'] += 1;
  }

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
    checklist: counts,
  });
}

export async function findChecklistItems(admin, assignees, { assignee, status, date, limit } = {}, options = {}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const today = getChecklistBusinessDate(now);
  const resolved = await resolveEmployee(assignee, assignees);
  if (resolved.error) return resolved.error;
  let query = admin.from('checklist_items').select(checklistSelect).neq('status', 'deactivated').order('due_at', { ascending: true }).limit(200);
  if (resolved.employee) query = query.eq('employee_id', resolved.employee.id);
  if (status === 'overdue') {
    query = query.neq('status', 'completed').is('completed_at', null).or(`due_at.lt.${nowIso},and(due_at.is.null,due_date.lt.${today})`);
  } else {
    query = query.eq('due_date', date || today);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []).filter((item) => {
    if (!status || status === 'overdue') return true;
    const itemStatus = getUnifiedWorkItemStatus({ ...item, kind: 'checklist' }, now, 'checklist');
    return itemStatus === status;
  }).slice(0, limit || 200);
  return rows.length ? formatList(rows.map((item) => formatChecklistLine(item, now, options))) : 'No matching checklist items.';
}

export async function listTemplates(admin, assignees, { assignee, active } = {}, options = {}) {
  const resolved = await resolveEmployee(assignee, assignees);
  if (resolved.error) return resolved.error;
  let query = admin.from('checklist_templates').select(templateSelect).order('short_code').limit(200);
  if (resolved.employee) query = query.eq('employee_id', resolved.employee.id);
  if (typeof active === 'boolean') query = query.eq('active', active);
  const { data, error } = await query;
  if (error) throw error;
  return data?.length ? formatList(data.map((template) => formatTemplateLine(template, options))) : 'No recurring checklist tasks found.';
}

async function loadEveryPage(buildQuery) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return rows;
  }
}

// Same pipeline as getUnifiedWorkItems({ followUpOnly: true }) behind the Follow-up page.
export async function getFollowUps(admin, assignees, { assignee } = {}, options = {}) {
  const now = new Date();
  const resolved = await resolveEmployee(assignee, assignees);
  if (resolved.error) return resolved.error;
  const employeeId = resolved.employee?.id;
  const [tasks, items, holidays] = await Promise.all([
    loadEveryPage(() => {
      const query = admin.from('tasks').select(taskSelect).not('status', 'in', openStatusFilter).is('completed_at', null).order('eta');
      return employeeId ? query.eq('assignee_id', employeeId) : query;
    }),
    loadEveryPage(() => {
      const query = admin.from('checklist_items').select(checklistSelect).neq('status', 'completed').is('completed_at', null).order('due_date');
      return employeeId ? query.eq('employee_id', employeeId) : query;
    }),
    loadEveryPage(() => admin.from('national_holidays').select('holiday_date').eq('country', 'India').eq('is_active', true).order('holiday_date')),
  ]);
  const holidayDates = new Set(holidays.map((holiday) => holiday.holiday_date));
  const followUps = sortWorkItemsChronologically(
    dedupeWorkItems([...tasks.map(toTaskWorkItem), ...items.map(toChecklistWorkItem)])
      .map((workItem) => addFollowUpMetadata(workItem, holidayDates))
      .filter((workItem) => workItem.isFollowUp && getWorkItemStatus(workItem, now) !== 'deactivated'),
    now,
  );
  const lines = followUps.map((workItem) => (workItem.kind === 'checklist'
    ? `${formatChecklistLine(workItem.checklistItem, now, options)} (moved to ${workItem.followUpDate})`
    : `${formatTaskLine(workItem, now, options)} (moved to ${workItem.followUpDate})`));
  return lines.length ? formatList(lines) : 'No follow-up work right now.';
}

export async function getMisReport(admin, assignees, { period = 'this_month', from, to, assignee } = {}) {
  const resolved = await resolveEmployee(assignee, assignees);
  if (resolved.error) return resolved.error;
  const range = from && to ? { from, to } : misRange(period);
  const { data, error } = await admin.rpc('get_work_report', {
    p_work_type: 'all',
    p_status: 'all',
    p_from: range.from,
    p_to: range.to,
    p_search: null,
    p_priority: 'all',
    p_employee_id: resolved.employee?.id || null,
  });
  if (error) throw error;
  const report = validateWorkReportPayload(data);
  if (report.error) throw report.error;
  return formatMisReport({ ...range, summary: report.data.summary, rows: report.data.employees });
}

export async function listLeaves(admin, assignees, { assignee } = {}) {
  const today = getChecklistBusinessDate(new Date());
  const resolved = await resolveEmployee(assignee, assignees);
  if (resolved.error) return resolved.error;
  let leaveQuery = admin.from('employee_non_working_days').select('non_working_date,employee_id,employee:employees!employee_non_working_days_employee_id_fkey(name)').eq('reason', 'employee_leave').gte('non_working_date', today).order('non_working_date').limit(100);
  if (resolved.employee) leaveQuery = leaveQuery.eq('employee_id', resolved.employee.id);
  const [leaves, holidays] = await Promise.all([
    leaveQuery,
    admin.from('national_holidays').select('holiday_date,name').eq('country', 'India').eq('is_active', true).gte('holiday_date', today).order('holiday_date').limit(30),
  ]);
  if (leaves.error) throw leaves.error;
  if (holidays.error) throw holidays.error;
  const leaveLines = (leaves.data || []).map((row) => `${row.employee?.name || '-'}: leave ${row.non_working_date}`);
  const holidayLines = resolved.employee ? [] : (holidays.data || []).map((row) => `Holiday ${row.holiday_date}: ${row.name}`);
  const lines = [...leaveLines, ...holidayLines];
  return lines.length ? formatList(lines) : 'No upcoming leaves or holidays.';
}

// Work due today that is still open, split into overdue (past its time) and pending. Whole team, or one person.
export async function getTodayWork(admin, assignees, { assignee, status } = {}) {
  const now = new Date();
  const today = getChecklistBusinessDate(now);
  const start = dueToIso(today, '00:00');
  const resolved = await resolveEmployee(assignee, assignees);
  if (resolved.error) return resolved.error;
  const employee = resolved.employee;
  const statuses = status === 'overdue' ? ['overdue'] : status === 'pending' || status === 'open' ? ['pending'] : ['overdue', 'pending'];

  // Overdue work from earlier days still needs attention, so the window is "everything due up to the end of today".
  let taskQuery = admin.from('tasks').select(taskSelect).not('status', 'in', openStatusFilter).is('completed_at', null)
    .lt('eta', new Date(Date.parse(start) + 86400000).toISOString()).order('eta').limit(500);
  let checklistQuery = admin.from('checklist_items').select(checklistSelect).lte('due_date', today).neq('status', 'deactivated').neq('status', 'completed').is('completed_at', null).order('due_at').limit(500);
  if (employee) {
    taskQuery = taskQuery.eq('assignee_id', employee.id);
    checklistQuery = checklistQuery.eq('employee_id', employee.id);
  }
  const [tasks, checklist] = await Promise.all([taskQuery, checklistQuery]);
  if (tasks.error) throw tasks.error;
  if (checklist.error) throw checklist.error;

  const items = [
    ...(tasks.data || []).map((task) => ({ who: task.assignee?.name || '-', title: task.title, due: formatChecklistDueAt(task.eta), day: getChecklistBusinessDate(new Date(task.eta)), checklist: false, status: getUnifiedWorkItemStatus(task, now, 'task') })),
    ...(checklist.data || []).map((item) => ({ who: item.employee?.name || '-', title: item.task, due: item.due_at ? formatChecklistDueAt(item.due_at) : item.due_date, day: item.due_date, checklist: true, status: getUnifiedWorkItemStatus({ ...item, kind: 'checklist' }, now, 'checklist') })),
  ].filter((item) => statuses.includes(item.status));
  // The list is today's work; older overdue items are only counted so they are not lost.
  const earlierOverdue = items.filter((item) => item.status === 'overdue' && item.day < today).length;
  return formatTodayWork({ items: items.filter((item) => item.day === today), statuses, person: employee?.name, earlierOverdue });
}

// What the dashboard shows for today (same get_work_report call), plus the tasks assigned today.
export async function getDashboardStats(admin, assignees, { assignee } = {}) {
  const now = new Date();
  const today = getChecklistBusinessDate(now);
  const start = dueToIso(today, '00:00');
  const resolved = await resolveEmployee(assignee, assignees);
  if (resolved.error) return resolved.error;
  const employee = resolved.employee;
  const report = (from, to) => admin.rpc('get_work_report', { p_work_type: 'all', p_status: 'all', p_from: from, p_to: to, p_search: null, p_priority: 'all', p_employee_id: employee?.id || null });
  let assignedQuery = admin.from('tasks').select('assignee:employees!tasks_assignee_id_fkey(name)').gte('created_at', start).lt('created_at', new Date(Date.parse(start) + 86400000).toISOString()).limit(1000);
  if (employee) assignedQuery = assignedQuery.eq('assignee_id', employee.id);
  const [todayReport, allReport, assignedResult] = await Promise.all([report(today, today), report(null, today), assignedQuery]);
  if (todayReport.error) throw todayReport.error;
  if (allReport.error) throw allReport.error;
  if (assignedResult.error) throw assignedResult.error;
  const todayData = validateWorkReportPayload(todayReport.data);
  const allData = validateWorkReportPayload(allReport.data);
  if (todayData.error) throw todayData.error;
  if (allData.error) throw allData.error;
  const counts = new Map();
  (assignedResult.data || []).forEach((task) => counts.set(task.assignee?.name || '-', (counts.get(task.assignee?.name || '-') || 0) + 1));
  return formatDashboardStats({
    date: today,
    summary: todayData.data.summary,
    rows: todayData.data.employees,
    assigned: { total: assignedResult.data?.length || 0, byPerson: [...counts.entries()].sort((left, right) => right[1] - left[1]) },
    earlierOverdue: Math.max(0, allData.data.summary.overdue - todayData.data.summary.overdue),
    person: employee?.name,
  });
}
