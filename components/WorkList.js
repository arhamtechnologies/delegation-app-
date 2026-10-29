'use client';

import { ListGroup, MetaChip, PersonChip, WorkRow, WorkColumnsHeader } from './Workflow';
import { cn } from '@/lib/utils';
import { formatChecklistDueAt } from '../lib/checklist-data';
import { formatTaskDeadline } from '../lib/task-data';
import { getWorkItemStatus } from '../lib/work-data';

export const workStatusGroups = [
  { status: 'overdue', title: 'Overdue' },
  { status: 'pending', title: 'Pending' },
  { status: 'completed', title: 'Completed' },
];

export function getWorkHref(workItem) {
  return workItem.kind === 'checklist' ? `/tasks/checklist/${workItem.id}` : `/tasks/${workItem.id}`;
}

export function getWorkDueLabel(workItem) {
  if (workItem.isFollowUp && workItem.followUpDueAt) return `Moved to ${formatChecklistDueAt(workItem.followUpDueAt)}`;
  return workItem.kind === 'checklist' ? formatChecklistDueAt(workItem.due_at || workItem.dueDate) : formatTaskDeadline(workItem, { relative: true });
}

// Shows the completion immediately; the caller reverts it if the server refuses.
export function markWorkItemCompleted(workItem) {
  const completedAt = new Date().toISOString();
  return { ...workItem, status: 'completed', completed_at: completedAt, completedAt, checklistItem: workItem.checklistItem ? { ...workItem.checklistItem, status: 'completed', completed_at: completedAt } : workItem.checklistItem };
}

export function groupWorkItems(workItems) {
  const groups = { overdue: [], pending: [], completed: [] };
  (workItems || []).forEach((workItem) => {
    const status = getWorkItemStatus(workItem);
    if (groups[status]) groups[status].push(workItem);
  });
  return workStatusGroups.map((group) => ({ ...group, items: groups[group.status] })).filter((group) => group.items.length);
}

export { WorkColumnsHeader };

export function WorkItemRow({ workItem, showAssignee = true, canComplete, completing, onComplete, trailing, extra }) {
  const status = getWorkItemStatus(workItem);
  const checklist = workItem.kind === 'checklist';
  const completable = canComplete && status !== 'completed';
  const assignee = workItem.assignee?.name || workItem.employeeName || 'Unassigned';
  return <WorkRow
    href={getWorkHref(workItem)}
    status={status}
    priority={workItem.priority}
    title={workItem.title}
    subtitle={showAssignee ? assignee : undefined}
    onStatusClick={completable ? () => onComplete(workItem) : undefined}
    statusBusy={completing === workItem.id}
    statusLabel={completable ? `Mark "${workItem.title}" complete` : undefined}
    trailing={trailing}
    extra={extra}
    type={<MetaChip className={checklist ? 'border-brand/20 bg-brand-soft text-brand-dark' : ''}>{checklist ? 'Checklist' : workItem.category || 'General'}</MetaChip>}
    person={showAssignee ? <PersonChip name={assignee} /> : undefined}
    due={getWorkDueLabel(workItem)}
    dueTone={status === 'overdue' ? 'danger' : undefined}
    meta={<>
      <MetaChip className={checklist ? 'border-brand/20 bg-brand-soft text-brand-dark' : ''}>{checklist ? 'Checklist' : workItem.category || 'General'}</MetaChip>
      <span className={cn('whitespace-nowrap tabular-nums', status === 'overdue' && 'font-medium text-destructive')}>{getWorkDueLabel(workItem)}</span>
    </>}
  />;
}

// Overdue is the critical group and starts open; pending and completed stay closed
// unless the list is already filtered to that status.
export function GroupedWorkList({ workItems, renderRow, openStatus, collapsed = false }) {
  return groupWorkItems(workItems).map((group) => <ListGroup key={`${group.status}-${openStatus || ''}`} status={group.status} title={group.title} count={group.items.length} defaultOpen={(group.status === 'overdue' && !collapsed) || group.status === openStatus}>
    {group.items.map(renderRow)}
  </ListGroup>);
}
