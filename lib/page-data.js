import { canCreateTasks } from './auth';
import { canManageChecklists, getChecklistDashboardData, getChecklistSchemaError, getChecklistTemplatesPage } from './checklist-data';
import { getLastMutationAt } from './query-cache';
import { supabaseBrowser } from './supabase-browser';
import { getTask, getTaskAssignees, getTaskEmployees } from './task-data';
import { getFollowUpWorkItems, getUnifiedDashboardData, getWorkItemsPage, getWorkItemStatus, getWorkReport } from './work-data';
import { WORK_PAGE_SIZE } from './work-list.mjs';

// First-load data for each screen. Server pages call these with the request's
// RLS-scoped client; the browser calls them without one to refresh.

export async function loadDashboardData({ employee, client, signal } = {}) {
  const employeeRequest = canCreateTasks(employee.role) ? getTaskEmployees({ client }) : Promise.resolve({ data: [employee], error: null });
  const [workResponse, employeeResponse] = await Promise.all([getUnifiedDashboardData({ signal, client }), employeeRequest]);
  if (workResponse.error) return { data: null, error: workResponse.error };
  if (employeeResponse.error) return { data: null, error: employeeResponse.error };
  return {
    data: {
      employeeId: employee.id,
      name: employee.name,
      role: employee.role,
      employees: employeeResponse.data || [],
      metrics: workResponse.data?.metrics || {},
      todayItems: workResponse.data?.todayItems || [],
    },
    error: null,
  };
}

export const workStatuses = ['pending', 'overdue', 'completed'];
const workTypes = ['task', 'checklist'];
const workPriorities = ['critical', 'high', 'normal'];

export function isValidDateFilter(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

// Same parsing for the server's searchParams and the browser's location.search.
export function parseTaskFilters(params) {
  const get = (key) => {
    const value = typeof params?.get === 'function' ? params.get(key) : params?.[key];
    return (Array.isArray(value) ? value[0] : value) || null;
  };
  return {
    employee: get('employee') || 'all',
    workType: workTypes.includes(get('workType')) ? get('workType') : 'all',
    status: workStatuses.includes(get('status')) ? get('status') : 'all',
    priority: workPriorities.includes(get('priority')) ? get('priority') : 'all',
    followUp: get('followUp') === '1' ? 'follow-up' : 'all',
    date: isValidDateFilter(get('date')) ? get('date') : '',
  };
}

export function getTaskListKey(employeeId, { page = 0, search = '', employee, workType, status, priority, date, followUp = 'all' }) {
  return [employeeId, [page, search, employee, workType, status, priority, date, followUp].join('|')];
}

// Follow-ups come from their own read model, then get the same filters and paging as the main list.
async function loadFollowUpTasksPage({ selectedEmployeeId, filters, page, pageSize = WORK_PAGE_SIZE, search, client }) {
  const response = await getFollowUpWorkItems({ employeeId: selectedEmployeeId || undefined, client });
  if (response.error) return { data: null, error: response.error };
  const query = search.trim().toLowerCase();
  const matches = (response.data || []).filter((workItem) => {
    const searchable = [workItem.title, workItem.category, workItem.assignee?.name, workItem.assignee?.email].filter(Boolean).join(' ').toLowerCase();
    return (filters.workType === 'all' || workItem.kind === filters.workType)
      && (filters.status === 'all' || getWorkItemStatus(workItem) === filters.status)
      && (filters.priority === 'all' || workItem.priority === filters.priority)
      && (!filters.date || workItem.originalScheduledDate === filters.date)
      && (!query || searchable.includes(query));
  });
  const summary = { total: matches.length, pending: 0, overdue: 0, completed: 0 };
  matches.forEach((workItem) => { const status = getWorkItemStatus(workItem); if (summary[status] !== undefined) summary[status] += 1; });
  return { data: { workItems: matches.slice(page * pageSize, (page + 1) * pageSize), total: matches.length, summary }, error: null };
}

export async function loadTasksWorkspace({ employee, client }) {
  const manager = canCreateTasks(employee.role);
  const employeeResponse = manager ? await getTaskEmployees({ client }) : { data: [employee], error: null };
  if (employeeResponse.error) return { data: null, error: employeeResponse.error };
  return { data: { role: employee.role, employeeId: employee.id, employees: employeeResponse.data || [] }, error: null };
}

// Each status section (overdue / pending / completed) pages on its own.
export const SECTION_PAGE_SIZE = 20;
export const taskSectionStatuses = ['overdue', 'pending', 'completed'];

export async function loadTasksPage({ role, employeeId, filters, page = 0, pageSize = WORK_PAGE_SIZE, withSummary = true, search = '', client, signal }) {
  const manager = canCreateTasks(role);
  const selectedEmployeeId = filters.employee === 'all' ? (!manager ? employeeId : null) : filters.employee;
  if (filters.followUp === 'follow-up') return loadFollowUpTasksPage({ selectedEmployeeId, filters, page, pageSize, search, client });
  const [workResponse, summaryResponse] = await Promise.all([
    getWorkItemsPage({ page, pageSize, search, employeeId: selectedEmployeeId, workType: filters.workType, status: filters.status, priority: filters.priority, dueDate: filters.date, includeCount: true, signal, client }),
    withSummary ? getWorkReport({ workType: filters.workType, status: filters.status, priority: filters.priority, employeeId: selectedEmployeeId, from: filters.date, to: filters.date, search, signal, client }) : Promise.resolve({ data: null, error: null }),
  ]);
  const error = workResponse.error || summaryResponse.error;
  if (error) return { data: null, error };
  const hasCount = workResponse.count !== null && workResponse.count !== undefined;
  return { data: { workItems: workResponse.data || [], total: hasCount ? workResponse.count : undefined, summary: summaryResponse.data?.summary }, error: null };
}

export async function loadTasksData({ employee, client, filters }) {
  const statuses = filters.status === 'all' ? taskSectionStatuses : [filters.status];
  const [workspace, ...lists] = await Promise.all([
    loadTasksWorkspace({ employee, client }),
    ...statuses.map((status) => loadTasksPage({ role: employee.role, employeeId: employee.id, filters: { ...filters, status }, pageSize: SECTION_PAGE_SIZE, withSummary: false, client })),
  ]);
  if (workspace.error) return workspace;
  const failed = lists.find((list) => list.error);
  if (failed) return failed;
  const sections = Object.fromEntries(statuses.map((status, index) => [status, { workItems: lists[index].data.workItems, total: lists[index].data.total ?? lists[index].data.workItems.length }]));
  return { data: { workspace: workspace.data, sections, filters }, error: null };
}

export async function loadTaskDetail({ id, client }) {
  const supabase = client || supabaseBrowser();
  const [taskResponse, updatesResponse] = await Promise.all([
    getTask(id, supabase),
    supabase.from('task_updates').select('id,update_type,remark,proof_url,created_at').eq('task_id', id).order('created_at', { ascending: true }),
  ]);
  if (taskResponse.error && taskResponse.error.code !== 'PGRST116') return { data: null, error: taskResponse.error };
  return { data: { task: taskResponse.data || null, updates: updatesResponse.data || [] }, error: null };
}

const checklistDetailSelect = 'id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by,created_at,employee:employees!checklist_items_employee_id_fkey(id,name,email),template:checklist_templates!checklist_items_template_id_fkey(frequency,weekday,day_of_month,monthly_days,start_date,due_time)';

export async function loadChecklistDetail({ id, client }) {
  const supabase = client || supabaseBrowser();
  const [itemResponse, updatesResponse] = await Promise.all([
    supabase.from('checklist_items').select(checklistDetailSelect).eq('id', id).maybeSingle(),
    supabase.from('checklist_item_updates').select('id,update_type,remark,proof_url,created_at').eq('checklist_item_id', id).order('created_at', { ascending: true }),
  ]);
  const error = itemResponse.error || updatesResponse.error;
  if (error) return { data: null, error };
  return { data: { item: itemResponse.data || null, updates: updatesResponse.data || [] }, error: null };
}

export async function loadChecklistData({ employee, client, filters = {}, now = new Date() }) {
  const manager = canManageChecklists(employee.role);
  const supabase = client || supabaseBrowser();
  const { page = 0, search = '', employeeId = 'all', frequency = 'all', status = 'all' } = filters;
  const [templateResponse, employeeResponse, itemResponse] = await Promise.all([
    manager ? getChecklistTemplatesPage({ page, pageSize: WORK_PAGE_SIZE, search, employeeId, frequency, status, client: supabase }) : Promise.resolve({ data: [], count: 0, error: null }),
    manager ? supabase.from('employees').select('id,name,email,active,role').order('name') : Promise.resolve({ data: [], error: null }),
    getChecklistDashboardData({ now, client: supabase }),
  ]);
  const error = getChecklistSchemaError(itemResponse.error || templateResponse.error || employeeResponse.error);
  if (error) return { data: null, error };
  return {
    data: { employee, manager, items: itemResponse.data?.todayItems || [], metrics: itemResponse.data?.metrics || {}, templates: templateResponse.data || [], employees: employeeResponse.data || [], templateTotal: templateResponse.count || 0 },
    error: null,
  };
}

export const NOTIFICATION_PAGE_SIZE = 30;

function notificationType(kind) {
  if (kind === 'assignment') return 'task_created';
  if (kind === 'update') return 'task_updated';
  return kind || 'task_updated';
}

export async function loadNotificationsPage({ employee, client, view = 'all', page = 0 }) {
  const supabase = client || supabaseBrowser();
  function buildQuery(select) {
    let query = supabase.from('notifications').select(select, { count: 'exact' })
      .eq('recipient_employee_id', employee.id)
      .order('created_at', { ascending: false })
      .range(page * NOTIFICATION_PAGE_SIZE, (page + 1) * NOTIFICATION_PAGE_SIZE - 1);
    if (view === 'unread') query = query.is('read_at', null);
    if (view === 'read') query = query.not('read_at', 'is', null);
    return query;
  }
  let result = await buildQuery('id,task_id,kind,title,body,entity_type,entity_id,read_at,created_at');
  if (result.error && /entity_type|entity_id|schema cache|column/i.test(result.error.message || '')) result = await buildQuery('id,task_id,kind,title,body,read_at,created_at');
  if (result.error) return { data: null, error: result.error };
  return {
    data: {
      employee,
      totalPages: Math.max(1, Math.ceil((result.count || 0) / NOTIFICATION_PAGE_SIZE)),
      notifications: (result.data || []).map((item) => ({
        id: item.id,
        type: notificationType(item.kind),
        title: item.title,
        description: item.body || 'A workspace notification is waiting for your attention.',
        taskId: item.task_id,
        entityType: item.entity_type,
        entityId: item.entity_id,
        date: item.created_at,
        readAt: item.read_at,
      })),
    },
    error: null,
  };
}

export async function loadFollowUpData({ employee, client }) {
  const manager = canCreateTasks(employee.role);
  const [workResponse, employeeResponse] = await Promise.all([
    getFollowUpWorkItems({ employeeId: manager ? undefined : employee.id, client }),
    manager ? getTaskEmployees({ client }) : Promise.resolve({ data: [employee], error: null }),
  ]);
  const error = workResponse.error || employeeResponse.error;
  if (error) return { data: null, error };
  return { data: { workItems: workResponse.data || [], employees: employeeResponse.data || [], manager }, error: null };
}

export async function loadMisData({ employee, client, filters = {}, signal }) {
  const manager = canCreateTasks(employee.role);
  const [assigneeResponse, reportResponse] = await Promise.all([
    manager ? getTaskAssignees({ client }) : Promise.resolve({ data: [employee], error: null }),
    getWorkReport({ ...filters, signal, client }),
  ]);
  const error = assigneeResponse.error || reportResponse.error;
  if (error) return { data: null, error };
  return { data: { employees: assigneeResponse.data || [], employeeRows: reportResponse.data.employees, counts: reportResponse.data.summary }, error: null };
}

export async function loadEmployeesData({ employee, client }) {
  const supabase = client || supabaseBrowser();
  const { data, error } = await supabase.from('employees').select('id,name,email,mobile,role,department_id,active,auth_user_id').order('name');
  if (error) return { data: null, error };
  return { data: { rows: data || [], currentRole: employee.role, currentEmployeeId: employee.id }, error: null };
}

// Prefetched or router-cached server renders can be a little old; views refresh in
// the background when the payload is older than this.
const FRESH_RENDER_MS = 10000;

export function withRenderTime(data) {
  return data ? { ...data, renderedAt: Date.now() } : null;
}

export function isFreshRender(initialData) {
  const renderedAt = initialData?.renderedAt;
  return Boolean(renderedAt) && renderedAt > getLastMutationAt() && Date.now() - renderedAt < FRESH_RENDER_MS;
}
