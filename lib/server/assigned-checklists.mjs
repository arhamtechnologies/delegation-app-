import { getNextBusinessDate, getNextChecklistDueDate } from '../checklist-time.js';

const templateSelect = 'id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,proof_required';

export function toAssignedChecklists({ templates, today, nonWorkingDates, finishedTodayIds }) {
  const tomorrow = getNextBusinessDate(today);
  return templates
    .map((template) => ({ ...template, next_due_date: getNextChecklistDueDate(template, finishedTodayIds.has(template.id) ? tomorrow : today, nonWorkingDates) }))
    .sort((a, b) => (a.next_due_date || '9999').localeCompare(b.next_due_date || '9999') || a.due_time.localeCompare(b.due_time) || a.task.localeCompare(b.task));
}

// Reads with the service role, so employeeId must come from the authenticated session.
export async function loadAssignedChecklists(admin, employeeId, today) {
  const { data: templates, error: templateError } = await admin
    .from('checklist_templates')
    .select(templateSelect)
    .eq('employee_id', employeeId)
    .eq('active', true);
  if (templateError) throw templateError;
  if (!templates?.length) return [];

  const [holidays, leaves, finishedToday] = await Promise.all([
    admin.from('national_holidays').select('holiday_date').gte('holiday_date', today).eq('country', 'India').eq('is_active', true),
    admin.from('employee_non_working_days').select('non_working_date').gte('non_working_date', today).eq('employee_id', employeeId).eq('reason', 'employee_leave'),
    admin.from('checklist_items').select('template_id').eq('employee_id', employeeId).eq('due_date', today).in('status', ['completed', 'deactivated']),
  ]);
  const failed = holidays.error || leaves.error || finishedToday.error;
  if (failed) throw failed;

  return toAssignedChecklists({
    templates,
    today,
    nonWorkingDates: new Set([...holidays.data.map((row) => row.holiday_date), ...leaves.data.map((row) => row.non_working_date)]),
    finishedTodayIds: new Set(finishedToday.data.map((row) => row.template_id)),
  });
}
