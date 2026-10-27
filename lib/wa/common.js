import { getChecklistBusinessDate, localDateTimeToIso } from '../checklist-time';

// Shared by the read handlers and the proposal builders.
export const taskSelect = 'id,short_code,title,status,priority,eta,original_eta,completed_at,proof_required,assignee_id,assignee:employees!tasks_assignee_id_fkey(name)';
export const openStatusFilter = '(closed,not_required)';
export const defaultDueTime = '18:30';

export function dueToIso(dateValue, timeValue) {
  const iso = localDateTimeToIso(dateValue, timeValue);
  return iso && getChecklistBusinessDate(new Date(iso)) === dateValue ? iso : null;
}
