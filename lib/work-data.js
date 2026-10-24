import { getChecklistItems } from './checklist-data';
import { defaultChecklistTimeZone, getChecklistBusinessDate, getDateTimeParts, localDateTimeToIso } from './checklist-time';
import { addFollowUpMetadata } from './follow-up-tasks.mjs';
import { supabaseBrowser } from './supabase-browser';
import { getTaskDueDateTime, getTasks, hasTaskDueTime } from './task-data';
import { filterWorkItems, getUnifiedWorkItemStatus, getWorkSummary } from './work-summary.mjs';

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
  if (workItem?.isFollowUp && workItem.followUpDueAt) return parseWorkDateTime(workItem.followUpDueAt);
  if (workItem?.kind !== 'checklist') return getTaskDueDateTime(workItem);
  return parseWorkDateTime(getWorkItemDueValue(workItem));
}

function getWorkItemDueValue(workItem) {
  if (workItem?.isFollowUp) return workItem.followUpDueAt || workItem.followUpDate;
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

async function loadEveryPage(loadPage, pageSize) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const response = await loadPage(offset);
    if (response.error) return { data: [], error: response.error };
    rows.push(...(response.data || []));
    if ((response.data || []).length < pageSize) return { data: rows, error: null };
  }
}

async function getActiveHolidayDates(pageSize = 1000) {
  return loadEveryPage((offset) => supabaseBrowser()
    .from('national_holidays')
    .select('holiday_date')
    .eq('country', 'India')
    .eq('is_active', true)
    .order('holiday_date', { ascending: true })
    .range(offset, offset + pageSize - 1), pageSize);
}

export async function getUnifiedWorkItems({ pageSize = 1000, employeeId, status, workType = 'all', priority, dueDate, from, to, fromDate, toDate, detail = true, followUpOnly = false, now = new Date() } = {}) {
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
    }), pageSize);
  const [taskResponse, checklistResponse, holidayResponse] = await Promise.all([taskRequest, checklistRequest, getActiveHolidayDates(pageSize)]);
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

export async function getUnifiedDashboardData({ now = new Date() } = {}) {
  const response = await getUnifiedWorkItems({ detail: 'list', now });
  if (response.error) return { data: null, error: response.error };
  const workItems = response.data || [];
  return {
    data: {
      metrics: getWorkSummary(workItems, now),
      todayItems: getTodaysWorkItems(workItems.filter((workItem) => !workItem.isFollowUp), now),
    },
    error: null,
  };
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
