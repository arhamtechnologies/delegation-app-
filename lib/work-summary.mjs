const completedTaskStatuses = new Set(['closed', 'not_required']);

function getDueValue(workItem, source) {
  if (source === 'checklist') return workItem?.due_at || workItem?.dueAt || workItem?.dueDate || workItem?.due_date;
  return workItem?.eta || workItem?.dueAt || workItem?.dueDate;
}

function parseDueDate(value) {
  if (!value) return null;
  const rawValue = String(value);
  // Asia/Kolkata has no daylight-saving transition. A date-only fallback is
  // therefore deterministic and cannot accidentally be parsed as UTC.
  const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? `${rawValue}T23:59:59.999+05:30` : rawValue;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getUnifiedWorkItemStatus(workItem, now = new Date(), explicitSource) {
  const item = workItem?.checklistItem || workItem;
  const source = explicitSource || workItem?.kind || workItem?.sourceType || (workItem?.checklistItem ? 'checklist' : 'task');
  if (item?.completed_at || item?.completedAt || item?.status === 'completed' || (source === 'task' && completedTaskStatuses.has(item?.status))) return 'completed';
  if (source === 'checklist' && item?.status === 'deactivated') return 'deactivated';
  const dueAt = parseDueDate(getDueValue(item, source));
  return dueAt && now.getTime() > dueAt.getTime() ? 'overdue' : 'pending';
}

export function getWorkSummary(workItems, now = new Date()) {
  const summary = { total: 0, pending: 0, overdue: 0, completed: 0 };
  (workItems || []).forEach((workItem) => {
    const status = getUnifiedWorkItemStatus(workItem, now);
    if (status === 'deactivated') return;
    summary.total += 1;
    summary[status] += 1;
  });
  return summary;
}

export function combineWorkSummaries(...summaries) {
  return summaries.reduce((combined, summary) => ({
    total: combined.total + (summary?.total || 0),
    pending: combined.pending + (summary?.pending || 0),
    overdue: combined.overdue + (summary?.overdue || 0),
    completed: combined.completed + (summary?.completed || 0),
  }), { total: 0, pending: 0, overdue: 0, completed: 0 });
}

function getBusinessDate(value, timeZone) {
  const date = parseDueDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function filterWorkItems(workItems, { employeeId, workType = 'all', status = 'all', from, to, timeZone = 'Asia/Kolkata' } = {}, now = new Date()) {
  return (workItems || []).filter((workItem) => {
    const itemStatus = getUnifiedWorkItemStatus(workItem, now);
    if (itemStatus === 'deactivated') return false;
    const source = workItem?.kind || workItem?.sourceType || 'task';
    const item = workItem?.checklistItem || workItem;
    const scheduledDate = source === 'checklist'
      ? item?.due_date || getBusinessDate(getDueValue(item, source), timeZone)
      : getBusinessDate(getDueValue(item, source), timeZone);
    const assignedEmployeeId = workItem?.employeeId || workItem?.employee_id || workItem?.assignee_id;
    return (!employeeId || assignedEmployeeId === employeeId)
      && (workType === 'all' || source === workType)
      && (status === 'all' || itemStatus === status)
      && (!from || scheduledDate >= from)
      && (!to || scheduledDate <= to);
  });
}
