import { getChecklistDashboardData, getChecklistItems } from './checklist-data';
import { defaultChecklistTimeZone, getChecklistBusinessDate, getDateTimeParts, localDateTimeToIso } from './checklist-time';
import { getTaskDashboardData, getTaskDueDateTime, getTasks, hasTaskDueTime } from './task-data';
import { supabaseBrowser } from './supabase-browser';
import { combineWorkSummaries, filterWorkItems, getUnifiedWorkItemStatus, getWorkSummary } from './work-summary.mjs';
import { getWorkQueryError, normalizeWorkListRequest, validateWorkReportPayload } from './work-list.mjs';

export function getWorkItemStatus(workItem, now = new Date()) {
  return getUnifiedWorkItemStatus(workItem, now);
}

export { filterWorkItems, getWorkSummary };

export function toTaskWorkItem(task) {
  return {
    ...task,
    kind: 'task',
    sourceType: 'task',
    employeeId: task.assignee_id,
    employeeName: task.assignee?.name || null,
    employeeEmail: task.assignee?.email || null,
    dueDate: task.eta || null,
    startDate: task.start_date || null,
    createdAt: task.created_at || null,
    completedAt: task.completed_at || null,
  };
}

export function toChecklistWorkItem(item) {
  const employee = item.employee || item.assignee || null;
  return {
    ...item,
    kind: 'checklist',
    sourceType: 'checklist',
    title: item.task,
    description: 'Recurring checklist item',
    priority: 'normal',
    category: 'Checklist',
    assignee_id: item.employee_id,
    assignee: employee,
    employeeId: item.employee_id,
    employeeName: employee?.name || null,
    employeeEmail: employee?.email || null,
    dueDate: item.due_at || item.due_date || null,
    startDate: item.start_date || null,
    createdAt: item.created_at || null,
    completedAt: item.completed_at || null,
    checklistItem: item,
  };
}

export function normalizeWorkItem(workItem) {
  return workItem?.kind === 'checklist' ? toChecklistWorkItem(workItem.checklistItem || workItem) : toTaskWorkItem(workItem);
}

export function dedupeWorkItems(workItems) {
  const seen = new Set();
  return (workItems || []).filter((workItem) => {
    const key = `${workItem.sourceType || workItem.kind || 'work'}:${workItem.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getWorkItemDueDateTime(workItem) {
  if (workItem?.kind !== 'checklist') return getTaskDueDateTime(workItem);
  return parseWorkDateTime(getWorkItemDueValue(workItem));
}

function getWorkItemDueValue(workItem) {
  if (workItem?.kind !== 'checklist') return workItem?.eta;
  return [workItem.due_at, workItem.dueDate, workItem.due_date].find((value) => parseWorkDateTime(value));
}

function parseWorkDateTime(value) {
  if (!value) return null;
  const rawValue = String(value);
  const dateOnlyMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const normalizedValue = dateOnlyMatch ? localDateTimeToIso(rawValue, '00:00', defaultChecklistTimeZone) : rawValue;
  const date = new Date(normalizedValue || rawValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getWorkItemDueSortKey(workItem) {
  const rawDueValue = getWorkItemDueValue(workItem);
  const dueDateTime = parseWorkDateTime(rawDueValue);
  if (!dueDateTime) return null;
  const date = getChecklistBusinessDate(dueDateTime, defaultChecklistTimeZone);
  const parts = getDateTimeParts(dueDateTime, defaultChecklistTimeZone);
  const hasTime = workItem?.kind === 'checklist'
    ? Boolean(rawDueValue && !/^\d{4}-\d{2}-\d{2}$/.test(String(rawDueValue)))
    : hasTaskDueTime(workItem);
  return {
    date,
    dateNumber: Number(date.replaceAll('-', '')),
    hasTime,
    timeNumber: hasTime ? (Number(parts.hour) * 3600) + (Number(parts.minute) * 60) + Number(parts.second) : 0,
  };
}

export function compareWorkItemsChronologically(left, right, now = new Date()) {
  const leftDue = getWorkItemDueSortKey(left);
  const rightDue = getWorkItemDueSortKey(right);
  if (!leftDue || !rightDue) {
    if (leftDue || rightDue) return leftDue ? -1 : 1;
  } else {
    const today = getChecklistBusinessDate(now, defaultChecklistTimeZone);
    const leftGroup = leftDue.date === today ? 0 : leftDue.date > today ? 1 : 2;
    const rightGroup = rightDue.date === today ? 0 : rightDue.date > today ? 1 : 2;
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    if (leftDue.dateNumber !== rightDue.dateNumber) {
      return leftGroup === 2 ? rightDue.dateNumber - leftDue.dateNumber : leftDue.dateNumber - rightDue.dateNumber;
    }
    if (leftDue.hasTime !== rightDue.hasTime) return leftDue.hasTime ? -1 : 1;
    if (leftDue.timeNumber !== rightDue.timeNumber) return leftDue.timeNumber - rightDue.timeNumber;
  }

  const typeDifference = String(left?.kind || '').localeCompare(String(right?.kind || ''));
  if (typeDifference !== 0) return typeDifference;
  const titleDifference = String(left?.title || '').localeCompare(String(right?.title || ''));
  if (titleDifference !== 0) return titleDifference;
  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

export function sortWorkItemsChronologically(workItems, now = new Date()) {
  return [...(workItems || [])].sort((left, right) => compareWorkItemsChronologically(left, right, now));
}

const todayStatusPriority = { overdue: 0, pending: 1, completed: 2 };

export function getEffectiveTodayStatus(workItem, now = new Date()) {
  const status = getWorkItemStatus(workItem, now);
  return status === 'completed' ? 'completed' : status === 'overdue' ? 'overdue' : 'pending';
}

export function sortTodaysWorkItems(workItems, now = new Date()) {
  return [...(workItems || [])].sort((left, right) => {
    const statusDifference = todayStatusPriority[getEffectiveTodayStatus(left, now)] - todayStatusPriority[getEffectiveTodayStatus(right, now)];
    return statusDifference || compareWorkItemsChronologically(left, right, now);
  });
}

export function isWorkItemCompletedOnTime(workItem, now = new Date()) {
  if (getWorkItemStatus(workItem, now) !== 'completed' || !workItem?.completed_at) return false;
  const completedAt = new Date(workItem.completed_at);
  const dueAt = getWorkItemDueDateTime(workItem);
  return !Number.isNaN(completedAt.getTime()) && Boolean(dueAt) && completedAt.getTime() <= dueAt.getTime();
}

const misTaskSelect = 'id,title,description,priority,status,eta,start_date,category,assignee_id,completed_at,created_at,assignee:employees!tasks_assignee_id_fkey(id,name,email)';
const misChecklistSelect = 'id,template_id,employee_id,task,due_date,due_at,status,completed_at,created_at,employee:employees!checklist_items_employee_id_fkey(id,name,email)';
const misTaskSummarySelect = 'id,title,description,priority,status,eta,start_date,category,assignee_id,completed_at,created_at,assignee:employees!tasks_assignee_id_fkey(id,name,email)';
const misChecklistSummarySelect = 'id,employee_id,task,due_date,due_at,status,completed_at,employee:employees!checklist_items_employee_id_fkey(id,name,email)';

export function buildWorkEmployeePerformanceRows(employees, workItems, now = new Date()) {
  const stats = new Map((employees || []).map((employee) => [employee.id, {
    employee_id: employee.id,
    employee_name: employee.name,
    employee_email: employee.email || '',
    total_work: 0,
    pending_work: 0,
    overdue_work: 0,
    completed_work: 0,
    on_time_work: 0,
  }]));

  (workItems || []).forEach((workItem) => {
    const row = stats.get(workItem.employeeId || workItem.assignee_id);
    if (!row) return;
    const status = getWorkItemStatus(workItem, now);
    row.total_work += 1;
    if (status === 'pending') row.pending_work += 1;
    if (status === 'overdue') row.overdue_work += 1;
    if (status === 'completed') {
      row.completed_work += 1;
      if (isWorkItemCompletedOnTime(workItem, now)) row.on_time_work += 1;
    }
  });

  return [...stats.values()].map((row) => ({
    ...row,
    on_time_percent: row.completed_work ? Math.round((row.on_time_work / row.completed_work) * 100) : 0,
  }));
}

const workListSelect = 'id,kind,title,description,priority,category,employee_id,employee_name,employee_email,eta,due_date,due_at,source_status,completed_at,created_at,template_id,checklist_frequency';
function getWorkReportFilterDiagnostic({ workType, status, priority, employeeId, from, to, search }) {
  return {
    workType,
    status,
    priority,
    hasEmployeeFilter: Boolean(employeeId),
    hasFromDate: Boolean(from),
    hasToDate: Boolean(to),
    hasSearch: Boolean(String(search || '').trim()),
  };
}

function fromWorkListRow(row) {
  const employee = row.employee_id ? { id: row.employee_id, name: row.employee_name, email: row.employee_email } : null;
  if (row.kind === 'checklist') {
    return toChecklistWorkItem({
      id: row.id,
      template_id: row.template_id,
      employee_id: row.employee_id,
      task: row.title,
      due_date: row.due_date,
      due_at: row.due_at,
      status: row.source_status,
      completed_at: row.completed_at,
      created_at: row.created_at,
      employee,
      template: row.checklist_frequency ? { frequency: row.checklist_frequency } : null,
    });
  }
  return toTaskWorkItem({
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    category: row.category,
    assignee_id: row.employee_id,
    eta: row.eta,
    status: row.source_status,
    completed_at: row.completed_at,
    created_at: row.created_at,
    assignee: employee,
  });
}

export async function getWorkItemsPage(input = {}) {
  const request = normalizeWorkListRequest(input);
  const startedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
  let query = supabaseBrowser()
    .from('work_items')
    .select(workListSelect, request.includeCount ? { count: 'exact' } : {})
    .order('sort_group', { ascending: true })
    .order('sort_key', { ascending: true })
    .order('kind', { ascending: true })
    .order('title', { ascending: true })
    .order('id', { ascending: true })
    .range(request.from, request.to);

  if (request.employeeId) query = query.eq('employee_id', request.employeeId);
  if (request.workType !== 'all') query = query.eq('kind', request.workType);
  if (request.status !== 'all') query = query.eq('effective_status', request.status);
  if (request.priority !== 'all') query = query.eq('priority', request.priority);
  if (request.dueDate) query = query.eq('scheduled_date', request.dueDate);
  if (request.fromDate) query = query.gte('scheduled_date', request.fromDate);
  if (request.toDate) query = query.lte('scheduled_date', request.toDate);
  if (request.search) query = query.ilike('search_text', `%${request.search}%`);
  if (input.signal) query = query.abortSignal(input.signal);

  const response = await query;
  const durationMs = Math.round((typeof performance === 'undefined' ? Date.now() : performance.now()) - startedAt);
  if (process.env.NODE_ENV !== 'production' || durationMs >= 1500) {
    console.info('[performance] work list query', { durationMs, page: request.page, pageSize: request.pageSize, rowCount: response.data?.length || 0 });
  }
  if (response.error) return { data: [], count: response.count, error: getWorkQueryError(response.error), durationMs };
  return { data: (response.data || []).map(fromWorkListRow), count: response.count, error: null, durationMs };
}

export async function getWorkReport({ workType = 'all', status = 'all', priority = 'all', employeeId, from, to, search, signal } = {}) {
  let query = supabaseBrowser().rpc('get_work_report', {
    p_work_type: workType,
    p_status: status,
    p_from: from || null,
    p_to: to || null,
    p_search: String(search || '').trim().slice(0, 120) || null,
    p_priority: priority,
    p_employee_id: employeeId || null,
  });
  if (signal) query = query.abortSignal(signal);
  const startedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
  const response = await query;
  const durationMs = Math.round((typeof performance === 'undefined' ? Date.now() : performance.now()) - startedAt);
  const filters = getWorkReportFilterDiagnostic({ workType, status, priority, employeeId, from, to, search });
  if (response.error) {
    const error = getWorkQueryError(response.error);
    console.error('[mis] get_work_report failed', {
      query: 'get_work_report',
      durationMs,
      filters,
      code: response.error.code || null,
      message: response.error.message || 'Unknown database error',
      details: response.error.details || null,
      hint: response.error.hint || null,
    });
    return { data: null, error, durationMs };
  }

  const report = validateWorkReportPayload(response.data);
  if (report.error) {
    console.error('[mis] get_work_report returned an invalid payload', {
      query: 'get_work_report',
      durationMs,
      filters,
      hasSummary: Boolean(response.data?.summary),
      employeeRowCount: Array.isArray(response.data?.employees) ? response.data.employees.length : null,
    });
    return { data: null, error: report.error, durationMs };
  }

  const diagnostic = { query: 'get_work_report', durationMs, filters, total: report.data.summary.total, employeeRowCount: report.data.employees.length };
  if (report.data.summary.total === 0) console.warn('[mis] get_work_report returned zero visible rows', diagnostic);
  else if (process.env.NODE_ENV !== 'production' || durationMs >= 1500) console.info('[mis] get_work_report completed', diagnostic);
  return { data: report.data, error: null, durationMs };
}

async function loadEveryPage(loadPage, pageSize) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const response = await loadPage(offset);
    if (response.error) return { data: [], error: response.error };
    rows.push(...(response.data || []));
    if ((response.data || []).length < pageSize) return { data: rows, error: null };
  }
}

export async function getUnifiedWorkItems({ pageSize = 1000, employeeId, status, workType = 'all', priority, dueDate, from, to, fromDate, toDate, detail = true, now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const taskRequest = workType === 'checklist'
    ? Promise.resolve({ data: [], error: null })
    : loadEveryPage((offset) => getTasks({
      limit: pageSize,
      offset,
      select: detail === 'list' ? undefined : detail ? misTaskSelect : misTaskSummarySelect,
      assigneeId: employeeId,
      priority,
      status: status === 'all' ? undefined : status,
      etaFrom: from || undefined,
      etaTo: to || undefined,
      nowIso,
    }), pageSize);
  const checklistRequest = workType === 'task' || (priority && priority !== 'all' && priority !== 'normal')
    ? Promise.resolve({ data: [], error: null })
    : loadEveryPage((offset) => getChecklistItems({
      limit: pageSize,
      offset,
      select: detail === 'list' ? undefined : detail ? misChecklistSelect : misChecklistSummarySelect,
      employeeId,
      status: status === 'all' ? undefined : status,
      dueDate,
      dueDateFrom: fromDate,
      dueDateTo: toDate,
      nowIso,
    }), pageSize);
  const [taskResponse, checklistResponse] = await Promise.all([taskRequest, checklistRequest]);
  const error = taskResponse.error || checklistResponse.error;
  if (error) return { data: [], error };
  return {
    data: sortWorkItemsChronologically(dedupeWorkItems([
      ...(taskResponse.data || []).map(toTaskWorkItem),
      ...(checklistResponse.data || []).map(toChecklistWorkItem),
    ]), now),
    error: null,
  };
}

export const getOverallWorkItems = getUnifiedWorkItems;

export async function getUnifiedDashboardData({ now = new Date() } = {}) {
  const [taskResponse, checklistResponse] = await Promise.all([
    getTaskDashboardData({ now }),
    getChecklistDashboardData({ now }),
  ]);
  const error = taskResponse.error || checklistResponse.error;
  if (error) return { data: null, error };
  return {
    data: {
      metrics: combineWorkSummaries(taskResponse.data?.metrics, checklistResponse.data?.metrics),
      todayItems: [
        ...(taskResponse.data?.todayTasks || []).map(toTaskWorkItem),
        ...(checklistResponse.data?.todayItems || []).map(toChecklistWorkItem),
      ],
    },
    error: null,
  };
}

export function getWorkItemScheduledDate(workItem, timeZone = defaultChecklistTimeZone) {
  if (workItem?.kind === 'checklist') return workItem.due_date || null;
  const dueDate = getTaskDueDateTime(workItem);
  return dueDate ? getChecklistBusinessDate(dueDate, timeZone) : null;
}

export function getTodaysWorkItems(workItems, now = new Date(), timeZone = defaultChecklistTimeZone) {
  const today = getChecklistBusinessDate(now, timeZone);
  return sortTodaysWorkItems((workItems || []).filter((workItem) => getWorkItemScheduledDate(workItem, timeZone) === today), now);
}
