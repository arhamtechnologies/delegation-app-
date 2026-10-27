import { defaultChecklistTimeZone, getChecklistBusinessDate, getDateTimeParts, localDateTimeToIso } from './checklist-time.js';
import { getUnifiedWorkItemStatus } from './work-summary.mjs';

// Pure work-item helpers shared by the app pages and the server (WhatsApp bot).
export function getTaskDueDateTime(task) {
  if (!task?.eta) return null;
  const dueDate = new Date(task.eta);
  return Number.isNaN(dueDate.getTime()) ? null : dueDate;
}

export function hasTaskDueTime(task) {
  const dueDate = getTaskDueDateTime(task);
  return Boolean(dueDate && dueDate.getMilliseconds() !== 999);
}

export function getWorkItemStatus(workItem, now = new Date()) {
  return getUnifiedWorkItemStatus(workItem, now);
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
