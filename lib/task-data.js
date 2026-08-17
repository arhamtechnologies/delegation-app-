import { supabaseBrowser } from './supabase-browser';
import { defaultChecklistTimeZone, getChecklistBusinessDate, localDateTimeToIso } from './checklist-time';

const taskListSelect = 'id,title,description,priority,status,eta,category,assignee_id,completed_at,assignee:employees!tasks_assignee_id_fkey(name)';
const taskDetailSelect = 'id,title,description,priority,status,eta,start_date,category,instructions,proof_required,completion_notes,attachments,assignee_id,completed_at,created_at,updated_at,assignee:employees!tasks_assignee_id_fkey(name)';
const excludedTaskAssigneeRoles = new Set(['super_admin', 'assigner', 'ea']);
let taskEmployeesCache = null;
let taskEmployeesRequest = null;
let taskAssigneesCache = null;
let taskAssigneesRequest = null;
const employeeListCacheTtl = 15000;

export function isEligibleTaskAssignee(employee) {
  return employee?.active === true && !excludedTaskAssigneeRoles.has(employee.role);
}

export async function getTaskAssignees() {
  if (taskAssigneesCache && Date.now() - taskAssigneesCache.timestamp < employeeListCacheTtl) return taskAssigneesCache.response;
  if (!taskAssigneesRequest) {
    taskAssigneesRequest = supabaseBrowser()
      .from('employees')
      .select('id,name,active,role')
      .eq('active', true)
      .not('role', 'in', '("super_admin","assigner","ea")')
      .order('name')
      .then((response) => {
        const result = response.error ? response : { ...response, data: (response.data || []).filter(isEligibleTaskAssignee) };
        taskAssigneesCache = { timestamp: Date.now(), response: result };
        return result;
      })
      .finally(() => { taskAssigneesRequest = null; });
  }
  return taskAssigneesRequest;
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

export async function getTaskEmployees() {
  if (taskEmployeesCache && Date.now() - taskEmployeesCache.timestamp < employeeListCacheTtl) return taskEmployeesCache.response;
  if (!taskEmployeesRequest) {
    taskEmployeesRequest = supabaseBrowser()
      .from('employees')
      .select('id,name,active,role')
      .eq('active', true)
      .order('name')
      .then((response) => {
        taskEmployeesCache = { timestamp: Date.now(), response };
        return response;
      })
      .finally(() => { taskEmployeesRequest = null; });
  }
  return taskEmployeesRequest;
}

export function clearTaskEmployeeCaches() {
  taskEmployeesCache = null;
  taskAssigneesCache = null;
}

function dateTimeInputToIso(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const date = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function applyTaskFilters(query, { assigneeId, priority, status, etaFrom, etaTo, nowIso = new Date().toISOString() } = {}) {
  if (assigneeId) query = query.eq('assignee_id', assigneeId);
  if (priority && priority !== 'all') query = query.eq('priority', priority);
  if (etaFrom) query = query.gte('eta', etaFrom);
  if (etaTo) query = query.lt('eta', etaTo);
  if (status === 'completed') query = completedTaskQuery(query);
  if (status === 'overdue') query = activeTaskQuery(query).lt('eta', nowIso);
  if (status === 'pending') query = activeTaskQuery(query).gte('eta', nowIso);
  return query;
}

function buildTaskListQuery(supabase, { limit, select, ...filters }) {
  let query = applyTaskFilters(supabase.from('tasks').select(select), filters);
  return query.order('updated_at', { ascending: false }).limit(limit);
}

export async function getTasks({ limit = 100, select = taskListSelect, ...filters } = {}) {
  const supabase = supabaseBrowser();
  const response = await buildTaskListQuery(supabase, { limit, select, ...filters });
  if (response.error && response.error.message?.includes('updated_at')) {
    let fallback = applyTaskFilters(supabase.from('tasks').select(select), filters);
    return fallback.order('created_at', { ascending: false }).limit(limit);
  }
  return response;
}

function nextBusinessDate(dateValue) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
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

export async function getTaskDashboardData({ now = new Date() } = {}) {
  const supabase = supabaseBrowser();
  const nowIso = now.toISOString();
  const today = getChecklistBusinessDate(now, defaultChecklistTimeZone);
  const todayStart = localDateTimeToIso(today, '00:00', defaultChecklistTimeZone);
  const tomorrowStart = localDateTimeToIso(nextBusinessDate(today), '00:00', defaultChecklistTimeZone);
  const totalQuery = supabase.from('tasks').select('id', { count: 'exact', head: true });
  const pendingQuery = activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true })).gte('eta', nowIso);
  const overdueQuery = activeTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true })).lt('eta', nowIso);
  const completedQuery = completedTaskQuery(supabase.from('tasks').select('id', { count: 'exact', head: true }));
  const todayQuery = getTasks({ limit: 200, etaFrom: todayStart, etaTo: tomorrowStart });
  const [totalResponse, pendingResponse, overdueResponse, completedResponse, todayResponse] = await Promise.all([
    totalQuery,
    pendingQuery,
    overdueQuery,
    completedQuery,
    todayQuery,
  ]);
  const responses = [totalResponse, pendingResponse, overdueResponse, completedResponse, todayResponse];
  const errorResponse = responses.find((response) => response.error);
  if (errorResponse) return { data: null, error: errorResponse.error };
  return {
    data: {
      metrics: {
        total: totalResponse.count || 0,
        pending: pendingResponse.count || 0,
        overdue: overdueResponse.count || 0,
        completed: completedResponse.count || 0,
      },
      todayTasks: todayResponse.data || [],
    },
    error: null,
  };
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
