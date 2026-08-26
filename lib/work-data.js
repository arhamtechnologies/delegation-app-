import { getChecklistItems, getChecklistStatus } from './checklist-data';
import { defaultChecklistTimeZone, getChecklistBusinessDate, localDateTimeToIso } from './checklist-time';
import { getTaskDueDateTime, getTaskStatus, getTasks } from './task-data';

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
  if (workItem?.kind === 'checklist') {
    const value = workItem.due_at || workItem.dueDate || workItem.due_date;
    return parseWorkDateTime(value);
  }
  return getTaskDueDateTime(workItem);
}

function parseWorkDateTime(value) {
  if (!value) return null;
  const rawValue = String(value);
  const dateOnlyMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const normalizedValue = dateOnlyMatch ? localDateTimeToIso(rawValue, '00:00', defaultChecklistTimeZone) : rawValue;
  const date = new Date(normalizedValue || rawValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getWorkItemStartDateTime(workItem) {
  return parseWorkDateTime(workItem?.start_at || workItem?.startAt || workItem?.start_date || workItem?.startDate);
}

function compareDateTimes(left, right) {
  const leftTime = left?.getTime();
  const rightTime = right?.getTime();
  const leftMissing = !Number.isFinite(leftTime);
  const rightMissing = !Number.isFinite(rightTime);
  if (leftMissing || rightMissing) return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1;
  return leftTime - rightTime;
}

export function compareWorkItemsChronologically(left, right) {
  const leftDue = getWorkItemDueDateTime(left);
  const rightDue = getWorkItemDueDateTime(right);
  const leftStart = getWorkItemStartDateTime(left) || leftDue;
  const rightStart = getWorkItemStartDateTime(right) || rightDue;
  const startDifference = compareDateTimes(leftStart, rightStart);
  if (startDifference !== 0) return startDifference;

  const dueDifference = compareDateTimes(leftDue, rightDue);
  if (dueDifference !== 0) return dueDifference;

  const createdDifference = compareDateTimes(parseWorkDateTime(left?.created_at || left?.createdAt), parseWorkDateTime(right?.created_at || right?.createdAt));
  if (createdDifference !== 0) return createdDifference;
  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

export function sortWorkItemsChronologically(workItems) {
  return [...(workItems || [])].sort(compareWorkItemsChronologically);
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
    ])),
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
  return sortWorkItemsChronologically((workItems || []).filter((workItem) => getWorkItemScheduledDate(workItem, timeZone) === today));
}
