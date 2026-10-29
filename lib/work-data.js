import { getChecklistItems } from './checklist-data';
import { defaultChecklistTimeZone, getChecklistBusinessDate } from './checklist-time';
import { addFollowUpMetadata } from './follow-up-tasks.mjs';
import { supabaseBrowser } from './supabase-browser';
import { getTasks } from './task-data';
import { compareWorkItemsChronologically, dedupeWorkItems, getTaskDueDateTime, getWorkItemDueDateTime, getWorkItemStatus, sortWorkItemsChronologically, toChecklistWorkItem, toTaskWorkItem } from './work-items.mjs';
import { getWorkQueryError, normalizeWorkListRequest, validateWorkReportPayload, WORK_PAGE_SIZE } from './work-list.mjs';
import { filterWorkItems, getWorkSummary } from './work-summary.mjs';


export { filterWorkItems, getWorkSummary };
export { compareWorkItemsChronologically, dedupeWorkItems, getWorkItemDueDateTime, getWorkItemStatus, normalizeWorkItem, sortWorkItemsChronologically, toChecklistWorkItem, toTaskWorkItem } from './work-items.mjs';


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
const misChecklistSelect = 'id,template_id,employee_id,task,due_date,due_at,status,completed_at,created_at,employee:employees!checklist_items_employee_id_fkey(id,name,email),template:checklist_templates!checklist_items_template_id_fkey(frequency,weekday,day_of_month,monthly_days,start_date,due_time)';
const misTaskSummarySelect = 'id,title,description,priority,status,eta,start_date,category,assignee_id,completed_at,created_at,assignee:employees!tasks_assignee_id_fkey(id,name,email)';
const misChecklistSummarySelect = 'id,employee_id,task,due_date,due_at,status,completed_at,employee:employees!checklist_items_employee_id_fkey(id,name,email),template:checklist_templates!checklist_items_template_id_fkey(frequency)';

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
  let query = (input.client || supabaseBrowser())
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

export async function getWorkReport({ workType = 'all', status = 'all', priority = 'all', employeeId, from, to, search, signal, client } = {}) {
  let query = (client || supabaseBrowser()).rpc('get_work_report', {
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

async function getActiveHolidayDates(pageSize = 1000, client) {
  return loadEveryPage((offset) => (client || supabaseBrowser())
    .from('national_holidays')
    .select('holiday_date')
    .eq('country', 'India')
    .eq('is_active', true)
    .order('holiday_date', { ascending: true })
    .range(offset, offset + pageSize - 1), pageSize);
}

export async function getUnifiedWorkItems({ pageSize = 1000, employeeId, status, workType = 'all', priority, dueDate, from, to, fromDate, toDate, detail = true, followUpOnly = false, now = new Date(), client } = {}) {
  const nowIso = now.toISOString();
  const taskRequest = workType === 'checklist'
    ? Promise.resolve({ data: [], error: null })
    : loadEveryPage((offset) => getTasks({
      limit: pageSize,
      offset,
      select: detail === 'list' ? undefined : detail ? misTaskSelect : misTaskSummarySelect,
      assigneeId: employeeId,
      priority,
      etaFrom: from || undefined,
      etaTo: to || undefined,
      nowIso,
      client,
    }), pageSize);
  const checklistRequest = workType === 'task' || (priority && priority !== 'all' && priority !== 'normal')
    ? Promise.resolve({ data: [], error: null })
    : loadEveryPage((offset) => getChecklistItems({
      limit: pageSize,
      offset,
      select: detail === 'list' ? undefined : detail ? misChecklistSelect : misChecklistSummarySelect,
      employeeId,
      dueDate,
      dueDateFrom: fromDate,
      dueDateTo: toDate,
      includeDeactivated: true,
      nowIso,
      client,
    }), pageSize);
  const [taskResponse, checklistResponse, holidayResponse] = await Promise.all([taskRequest, checklistRequest, getActiveHolidayDates(pageSize, client)]);
  const error = taskResponse.error || checklistResponse.error || holidayResponse.error;
  if (error) return { data: [], error };
  const holidayDates = new Set((holidayResponse.data || []).map((holiday) => holiday.holiday_date));
  const enrichedItems = dedupeWorkItems([
    ...(taskResponse.data || []).map(toTaskWorkItem),
    ...(checklistResponse.data || []).map(toChecklistWorkItem),
  ]).map((workItem) => addFollowUpMetadata(workItem, holidayDates, defaultChecklistTimeZone));
  return {
    data: sortWorkItemsChronologically(enrichedItems.filter((workItem) => {
      const itemStatus = getWorkItemStatus(workItem, now);
      return itemStatus !== 'deactivated'
        && (!followUpOnly || workItem.isFollowUp)
        && (!status || status === 'all' || itemStatus === status);
    }), now),
    error: null,
  };
}

export const getOverallWorkItems = getUnifiedWorkItems;

const missingFollowUpView = /follow_up_work_items/i;

// Follow-up work in one request: the follow_up_work_items view (migration 20261027150000)
// returns only Sunday/holiday work; this adds the carried-over dates. Falls back to the
// full scan while that migration is not applied yet.
export async function getFollowUpWorkItems({ employeeId, client, now = new Date() } = {}) {
  const supabase = client || supabaseBrowser();
  const pageSize = 1000;
  const [workResponse, holidayResponse] = await Promise.all([
    loadEveryPage((offset) => {
      let query = supabase.from('follow_up_work_items').select(workListSelect)
        .order('scheduled_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (employeeId) query = query.eq('employee_id', employeeId);
      return query;
    }, pageSize),
    getActiveHolidayDates(pageSize, supabase),
  ]);
  if (workResponse.error && missingFollowUpView.test(workResponse.error.message || '')) {
    return getUnifiedWorkItems({ employeeId, followUpOnly: true, detail: 'list', now, client });
  }
  const error = workResponse.error || holidayResponse.error;
  if (error) return { data: [], error: getWorkQueryError(error) };
  const holidayDates = new Set((holidayResponse.data || []).map((holiday) => holiday.holiday_date));
  const items = (workResponse.data || []).map(fromWorkListRow)
    .map((workItem) => addFollowUpMetadata(workItem, holidayDates, defaultChecklistTimeZone))
    .filter((workItem) => workItem.isFollowUp && getWorkItemStatus(workItem, now) !== 'deactivated');
  return { data: sortWorkItemsChronologically(items, now), error: null };
}

// The dashboard is today's view: everything due today, in every status, plus today's totals.
export async function getUnifiedDashboardData({ now = new Date(), signal, client } = {}) {
  const today = getChecklistBusinessDate(now, defaultChecklistTimeZone);
  const [reportResponse, todayResponse, holidayDates] = await Promise.all([
    getWorkReport({ from: today, to: today, signal, client }),
    getWorkItemsPage({ dueDate: today, pageSize: 100, includeCount: false, signal, client }),
    getTodayHolidayDates(today, { signal, client }),
  ]);
  const error = reportResponse.error || todayResponse.error || holidayDates.error;
  if (error) return { data: null, error };
  return {
    data: {
      metrics: reportResponse.data.summary,
      todayItems: sortTodaysWorkItems(withoutFollowUps(todayResponse.data, holidayDates.data), now),
    },
    error: null,
  };
}

async function getTodayHolidayDates(today, { signal, client }) {
  let query = (client || supabaseBrowser())
    .from('national_holidays')
    .select('holiday_date')
    .eq('country', 'India')
    .eq('is_active', true)
    .eq('holiday_date', today);
  if (signal) query = query.abortSignal(signal);
  const response = await query;
  return { data: new Set((response.data || []).map((holiday) => holiday.holiday_date)), error: response.error };
}

function withoutFollowUps(workItems, holidayDates) {
  return (workItems || []).map((workItem) => addFollowUpMetadata(workItem, holidayDates, defaultChecklistTimeZone)).filter((workItem) => !workItem.isFollowUp);
}

export function getWorkItemScheduledDate(workItem, timeZone = defaultChecklistTimeZone) {
  if (workItem?.originalScheduledDate) return workItem.originalScheduledDate;
  if (workItem?.kind === 'checklist') return workItem.due_date || null;
  const dueDate = getTaskDueDateTime(workItem);
  return dueDate ? getChecklistBusinessDate(dueDate, timeZone) : null;
}

export function getTodaysWorkItems(workItems, now = new Date(), timeZone = defaultChecklistTimeZone) {
  const today = getChecklistBusinessDate(now, timeZone);
  return sortTodaysWorkItems((workItems || []).filter((workItem) => getWorkItemScheduledDate(workItem, timeZone) === today), now);
}
