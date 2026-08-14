import { getChecklistStatus } from './checklist-data';
import { getTaskStatus } from './task-data';

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
