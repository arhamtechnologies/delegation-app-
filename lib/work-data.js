import { getChecklistItems, getChecklistStatus } from './checklist-data';
import { defaultChecklistTimeZone, getChecklistBusinessDate } from './checklist-time';
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
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return getTaskDueDateTime(workItem);
}

export function isWorkItemCompletedOnTime(workItem, now = new Date()) {
  if (getWorkItemStatus(workItem, now) !== 'completed' || !workItem?.completed_at) return false;
  const completedAt = new Date(workItem.completed_at);
  const dueAt = getWorkItemDueDateTime(workItem);
  return !Number.isNaN(completedAt.getTime()) && Boolean(dueAt) && completedAt.getTime() <= dueAt.getTime();
}

const misTaskSelect = 'id,title,description,priority,status,eta,category,assignee_id,completed_at,created_at,assignee:employees!tasks_assignee_id_fkey(id,name,email)';
const misChecklistSelect = 'id,template_id,employee_id,task,due_date,due_at,status,completed_at,created_at,employee:employees!checklist_items_employee_id_fkey(id,name,email)';
const misTaskSummarySelect = 'id,title,description,priority,status,eta,category,assignee_id,completed_at,assignee:employees!tasks_assignee_id_fkey(id,name,email)';
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
    data: dedupeWorkItems([
      ...(taskResponse.data || []).map(toTaskWorkItem),
      ...(checklistResponse.data || []).map(toChecklistWorkItem),
    ]),
    error: null,
  };
}

export function getWorkItemScheduledDate(workItem, timeZone = defaultChecklistTimeZone) {
  if (workItem?.kind === 'checklist') return workItem.due_date || null;
  const dueDate = getTaskDueDateTime(workItem);
  return dueDate ? getChecklistBusinessDate(dueDate, timeZone) : null;
}

function getWorkItemSortTime(workItem) {
  if (workItem?.kind === 'checklist' && !workItem.due_at) return Number.POSITIVE_INFINITY;
  if (workItem?.kind !== 'checklist' && !hasTaskDueTime(workItem)) return Number.POSITIVE_INFINITY;
  const dueValue = workItem?.kind === 'checklist' ? workItem.due_at : workItem?.eta;
  const dueTime = dueValue ? new Date(dueValue).getTime() : NaN;
  return Number.isFinite(dueTime) ? dueTime : Number.POSITIVE_INFINITY;
}

export function getTodaysWorkItems(workItems, now = new Date(), timeZone = defaultChecklistTimeZone) {
  const today = getChecklistBusinessDate(now, timeZone);
  return (workItems || [])
    .filter((workItem) => getWorkItemScheduledDate(workItem, timeZone) === today)
    .sort((left, right) => {
      const timeDifference = getWorkItemSortTime(left) - getWorkItemSortTime(right);
      if (timeDifference !== 0) return timeDifference;
      return String(left.title || '').localeCompare(String(right.title || ''));
    });
}
