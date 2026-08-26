import { getChecklistItems, getChecklistStatus } from './checklist-data';
import { defaultChecklistTimeZone, getChecklistBusinessDate, getDateTimeParts, localDateTimeToIso } from './checklist-time';
import { getTaskDueDateTime, getTaskStatus, getTasks, hasTaskDueTime } from './task-data';

export function getWorkItemStatus(workItem, now = new Date()) {
  return workItem?.kind === 'checklist'
    ? getChecklistStatus(workItem.checklistItem || workItem, now)
    : getTaskStatus(workItem, now);
}

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

export async function getOverallWorkItems({ limit = 1000, employeeId, status, workType = 'all', from, to, fromDate, toDate, detail = true, now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const taskRequest = workType === 'checklist'
    ? Promise.resolve({ data: [], error: null })
    : getTasks({
      limit,
      select: detail ? misTaskSelect : misTaskSummarySelect,
      assigneeId: employeeId,
      status: status === 'all' ? undefined : status,
      etaFrom: from || undefined,
      etaTo: to || undefined,
      nowIso,
    });
  const checklistRequest = workType === 'task'
    ? Promise.resolve({ data: [], error: null })
    : getChecklistItems({
      limit,
      select: detail ? misChecklistSelect : misChecklistSummarySelect,
      employeeId,
      status: status === 'all' ? undefined : status,
      dueDateFrom: fromDate,
      dueDateTo: toDate,
      nowIso,
    });
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

export function getWorkItemScheduledDate(workItem, timeZone = defaultChecklistTimeZone) {
  if (workItem?.kind === 'checklist') return workItem.due_date || null;
  const dueDate = getTaskDueDateTime(workItem);
  return dueDate ? getChecklistBusinessDate(dueDate, timeZone) : null;
}

export function getTodaysWorkItems(workItems, now = new Date(), timeZone = defaultChecklistTimeZone) {
  const today = getChecklistBusinessDate(now, timeZone);
  return sortTodaysWorkItems((workItems || []).filter((workItem) => getWorkItemScheduledDate(workItem, timeZone) === today), now);
}
