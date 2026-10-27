import { getChecklistBusinessDate, localDateTimeToIso } from '../checklist-time';
import { taskManagerRoles } from '../task-server';

// Shared by the read handlers and the proposal builders.
export const taskSelect = 'id,short_code,title,status,priority,eta,original_eta,completed_at,proof_required,assignee_id,assignee:employees!tasks_assignee_id_fkey(name)';
export const openStatusFilter = '(closed,not_required)';
export const defaultDueTime = '18:30';

export function dueToIso(dateValue, timeValue) {
  const iso = localDateTimeToIso(dateValue, timeValue);
  return iso && getChecklistBusinessDate(new Date(iso)) === dateValue ? iso : null;
}

export async function loadAssignees(admin) {
  const { data, error } = await admin
    .from('employees')
    .select('id,name,role,active')
    .eq('active', true)
    .not('role', 'in', '("super_admin","assigner","ea")')
    .order('name');
  if (error) throw error;
  return (data || []).filter((employee) => employee.active === true && !taskManagerRoles.has(employee.role));
}
