import { getChecklistStatus } from './checklist-data';
import { defaultChecklistTimeZone, getChecklistBusinessDate } from './checklist-time';
import { getTaskDueDateTime, getTaskStatus, hasTaskDueTime } from './task-data';

export function getWorkItemStatus(workItem, now = new Date()) {
  return workItem?.kind === 'checklist'
    ? getChecklistStatus(workItem.checklistItem || workItem, now)
    : getTaskStatus(workItem, now);
}

export function toTaskWorkItem(task) {
  return { ...task, kind: 'task' };
}

export function toChecklistWorkItem(item) {
  return {
    ...item,
    kind: 'checklist',
    title: item.task,
    description: 'Recurring checklist item',
    priority: 'normal',
    category: 'Checklist',
    assignee_id: item.employee_id,
    assignee: item.employee,
    checklistItem: item,
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
