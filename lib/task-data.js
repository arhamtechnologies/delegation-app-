import { supabaseBrowser } from './supabase-browser';

const taskListSelect = 'id,title,description,priority,status,eta,category,completed_at,assignee:employees!tasks_assignee_id_fkey(name)';
const taskSummarySelect = 'id,title,priority,status,eta,category,completed_at,assignee:employees!tasks_assignee_id_fkey(name)';
const taskDetailSelect = 'id,title,description,priority,status,eta,start_date,category,instructions,proof_required,completion_notes,attachments,completed_at,created_at,updated_at,assignee:employees!tasks_assignee_id_fkey(name)';
const excludedTaskAssigneeRoles = new Set(['super_admin', 'assigner', 'ea']);

export function isEligibleTaskAssignee(employee) {
  return employee?.active === true && !excludedTaskAssigneeRoles.has(employee.role);
}

export async function getTaskAssignees() {
  const response = await supabaseBrowser()
    .from('employees')
    .select('id,name,active,role')
    .eq('active', true)
    .not('role', 'in', '("super_admin","assigner","ea")')
    .order('name');

  if (response.error) return response;
  return { ...response, data: (response.data || []).filter(isEligibleTaskAssignee) };
}

async function getTaskAssignee(id) {
  return supabaseBrowser().from('employees').select('id,active,role').eq('id', id).maybeSingle();
}

function dateInputToIso(value, endOfDay = false) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateTimeInputToIso(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const date = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getTasks({ limit = 100, select = taskListSelect } = {}) {
  const supabase = supabaseBrowser();
  const response = await supabase.from('tasks').select(select).order('updated_at', { ascending: false }).limit(limit);
  if (response.error && response.error.message?.includes('updated_at')) {
    return supabase.from('tasks').select(select).order('created_at', { ascending: false }).limit(limit);
  }
  return response;
}

function activeTaskQuery(query) {
  return query.neq('status', 'closed').neq('status', 'not_required').is('completed_at', null);
}

function completedTaskQuery(query) {
  return query.or('status.eq.closed,completed_at.not.is.null');
}

function localDateNumber(value) {
  if (!value) return null;
  const stringValue = String(value);
  const dateOnly = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export function getTaskStatus(task, now = new Date()) {
  if (task?.completed_at || ['closed', 'not_required'].includes(task?.status)) return 'completed';
  const dueDate = getTaskDueDateTime(task);
  return dueDate && now.getTime() > dueDate.getTime() ? 'overdue' : 'pending';
}

export function getTaskDueDateTime(task) {
  if (!task?.eta) return null;
  const dueDate = new Date(task.eta);
  return Number.isNaN(dueDate.getTime()) ? null : dueDate;
}

export function hasTaskDueTime(task) {
  const dueDate = getTaskDueDateTime(task);
  return Boolean(dueDate && dueDate.getMilliseconds() !== 999);
}

export function formatTaskDeadline(task, { relative = false, includeYear = false } = {}) {
  const dueDate = getTaskDueDateTime(task);
  if (!dueDate) return 'No due date';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = dueDate.getFullYear() === today.getFullYear()
    && dueDate.getMonth() === today.getMonth()
    && dueDate.getDate() === today.getDate();
  const isTomorrow = dueDate.getFullYear() === tomorrow.getFullYear()
    && dueDate.getMonth() === tomorrow.getMonth()
    && dueDate.getDate() === tomorrow.getDate();
  const dateLabel = relative && isToday
    ? 'Due today'
    : relative && isTomorrow
      ? 'Due tomorrow'
      : `${relative ? 'Due ' : ''}${dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}) })}`;
  if (!hasTaskDueTime(task)) return `${dateLabel} - time not specified`;
  return `${dateLabel} at ${dueDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function isTaskCompletedOnTime(task) {
  if (getTaskStatus(task) !== 'completed' || !task?.completed_at || !task?.eta) return false;
  const completedDate = new Date(task.completed_at);
  const dueDate = getTaskDueDateTime(task);
  return !Number.isNaN(completedDate.getTime()) && dueDate !== null && completedDate.getTime() <= dueDate.getTime();
}

export function buildEmployeePerformanceRows(employees, tasks) {
  const stats = new Map((employees || []).map((employee) => [employee.id, {
    employee_id: employee.id,
    employee_name: employee.name,
    total_tasks: 0,
    pending_tasks: 0,
    overdue_tasks: 0,
    completed_tasks: 0,
    on_time_tasks: 0,
  }]));

  (tasks || []).forEach((task) => {
    const row = stats.get(task.assignee_id);
    if (!row) return;
    const status = getTaskStatus(task);
    row.total_tasks += 1;
    if (status === 'pending') row.pending_tasks += 1;
    if (status === 'overdue') row.overdue_tasks += 1;
    if (status === 'completed') {
      row.completed_tasks += 1;
      if (isTaskCompletedOnTime(task)) row.on_time_tasks += 1;
    }
  });

  return [...stats.values()].map((row) => ({
    ...row,
    on_time_percent: row.completed_tasks ? Math.round((row.on_time_tasks / row.completed_tasks) * 100) : 0,
  }));
}

export async function getDashboardData(manager) {
  const supabase = supabaseBrowser();
  const now = new Date();
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const overdueCount = activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }).lt('eta', nowIso));
  const priorityQueries = [
    activeTaskQuery(supabase.from('tasks').select(taskSummarySelect).lt('eta', nowIso).order('eta', { ascending: true }).limit(8)),
    activeTaskQuery(supabase.from('tasks').select(taskSummarySelect).gte('eta', nowIso).lte('eta', soonIso).order('eta', { ascending: true }).limit(8)),
  ];
  const metricQueries = manager
    ? [
      ['total', supabase.from('tasks').select('id', { count: 'exact', head: true })],
      ['overdue', overdueCount],
      ['dueSoon', activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('eta', nowIso).lte('eta', soonIso))],
    ]
    : [
      ['open', activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }))],
      ['dueToday', activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('eta', todayStart.toISOString()).lt('eta', tomorrowStart.toISOString()))],
      ['overdue', overdueCount],
      ['completed', completedTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }))],
    ];

  const [metricResponses, priorityResponses] = await Promise.all([
    Promise.all(metricQueries.map(([, query]) => query)),
    Promise.all(priorityQueries),
  ]);
  const errorResponse = [...metricResponses, ...priorityResponses].find((response) => response.error);
  if (errorResponse) return { data: null, error: errorResponse.error };

  const metrics = Object.fromEntries(metricQueries.map(([key], index) => [key, metricResponses[index].count || 0]));
  const priorityTasks = [...priorityResponses[0].data || [], ...priorityResponses[1].data || []]
    .filter((task, index, tasks) => tasks.findIndex((candidate) => candidate.id === task.id) === index)
    .sort((left, right) => new Date(left.eta) - new Date(right.eta))
    .slice(0, 8);

  return { data: { metrics, priorityTasks }, error: null };
}

export async function getTask(id) {
  return supabaseBrowser().from('tasks').select(taskDetailSelect).eq('id', id).single();
}

export async function createTask(payload, userId) {
  const supabase = supabaseBrowser();
  if (!payload.eta || !payload.due_time) {
    return { data: null, error: new Error('Please select a due date and due time.') };
  }
  if (!payload.assignee_id) {
    return { data: null, error: new Error('Choose an active employee who can receive delegated tasks.') };
  }
  const assigneeResponse = await getTaskAssignee(payload.assignee_id);
  if (assigneeResponse.error) return { data: null, error: assigneeResponse.error };
  if (!isEligibleTaskAssignee(assigneeResponse.data)) {
    return { data: null, error: new Error('Choose an active employee who can receive delegated tasks.') };
  }
  const eta = dateTimeInputToIso(payload.eta, payload.due_time);
  if (!eta) return { data: null, error: new Error('Please select a valid due date and due time.') };
  const record = {
    ...Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'due_time')),
    created_by: userId,
    status: 'pending',
    category: payload.category?.trim() || 'General',
    eta,
    start_date: dateInputToIso(payload.start_date),
    instructions: payload.instructions?.trim() || null,
    completion_notes: payload.completion_notes?.trim() || null,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
  };
  const response = await supabase.from('tasks').insert(record);
  if (response.error && /category|instructions|start_date|completion_notes|attachments/i.test(response.error.message || '')) {
    const fallback = { ...record };
    delete fallback.category;
    delete fallback.instructions;
    delete fallback.start_date;
    delete fallback.completion_notes;
    delete fallback.attachments;
    return supabase.from('tasks').insert(fallback);
  }
  return response;
}

export async function setTaskCompletion(id, completed) {
  const now = new Date().toISOString();
  const fields = completed
    ? { status: 'closed', completed_at: now, updated_at: now }
    : { status: 'pending', completed_at: null, updated_at: now };
  return supabaseBrowser().from('tasks').update(fields).eq('id', id);
}

export function taskIsOverdue(task) {
  return getTaskStatus(task) === 'overdue';
}

export function taskIsDueSoon(task) {
  if (getTaskStatus(task) !== 'pending' || !task.eta) return false;
  const due = localDateNumber(task.eta);
  const today = localDateNumber(new Date());
  if (due === null || today === null) return false;
  const dueDate = new Date(Math.floor(due / 10000), Math.floor((due % 10000) / 100) - 1, due % 100);
  const todayDate = new Date(Math.floor(today / 10000), Math.floor((today % 10000) / 100) - 1, today % 100);
  return dueDate.getTime() >= todayDate.getTime() && dueDate.getTime() - todayDate.getTime() <= 48 * 60 * 60 * 1000;
}
