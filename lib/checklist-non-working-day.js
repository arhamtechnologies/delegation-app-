import { defaultChecklistTimeZone, getChecklistBusinessDate } from './checklist-time';
import { createServerNotifications } from './notifications-server';

const pageSize = 1000;
const activeChecklistStatuses = ['pending', 'overdue'];
const checklistItemSelect = 'id,employee_id,task,due_date,due_at,status,employee:employees!checklist_items_employee_id_fkey(id,name,email)';

export function isValidChecklistDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isSunday(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() === 0;
}

async function loadHolidayRows(admin, date) {
  const response = await admin
    .from('national_holidays')
    .select('id,holiday_date,name,country,is_active')
    .eq('holiday_date', date)
    .eq('country', 'India');
  if (response.error) throw response.error;
  const rows = response.data || [];
  return { allRows: rows, activeRows: rows.filter((row) => row.is_active) };
}

async function loadLeaveRows(admin, date) {
  const response = await admin
    .from('employee_non_working_days')
    .select('id,employee_id,non_working_date,reason,employee:employees!employee_non_working_days_employee_id_fkey(id,name,active)')
    .eq('non_working_date', date)
    .eq('reason', 'employee_leave');
  if (response.error) throw response.error;
  return (response.data || []).filter((leave) => leave.employee?.active !== false);
}

async function loadEligibleChecklistItems(admin, date) {
  const items = [];
  for (let from = 0; ; from += pageSize) {
    const response = await admin
      .from('checklist_items')
      .select(checklistItemSelect)
      .eq('due_date', date)
      .in('status', activeChecklistStatuses)
      .order('due_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (response.error) throw response.error;
    items.push(...(response.data || []));
    if ((response.data || []).length < pageSize) return items;
  }
}

function buildItemReason(item, { sunday, holiday, leaveEmployeeIds }) {
  const reasons = [];
  if (sunday) reasons.push('Sunday');
  if (holiday) reasons.push('National Holiday');
  if (leaveEmployeeIds.has(item.employee_id)) reasons.push('Employee Leave');
  return reasons;
}

export async function getNonWorkingDayPreview(admin, date) {
  if (!isValidChecklistDate(date)) throw new Error('Choose a valid date in YYYY-MM-DD format.');
  const sunday = isSunday(date);
  const [holidayData, leaveRows] = await Promise.all([loadHolidayRows(admin, date), loadLeaveRows(admin, date)]);
  const leaveEmployeeIds = new Set(leaveRows.map((leave) => leave.employee_id));
  const holiday = holidayData.activeRows.length > 0;
  const shouldLoadItems = sunday || holiday || leaveEmployeeIds.size > 0;
  const items = shouldLoadItems ? await loadEligibleChecklistItems(admin, date) : [];
  const previewItems = items.map((item) => {
    const reasons = buildItemReason(item, { sunday, holiday, leaveEmployeeIds });
    return {
      id: item.id,
      employeeId: item.employee_id,
      employee: item.employee,
      task: item.task,
      dueDate: item.due_date,
      dueAt: item.due_at,
      reasons,
      reason: reasons.join(' + '),
    };
  }).filter((item) => item.reasons.length > 0);

  return {
    date,
    isSunday: sunday,
    isNationalHoliday: holiday,
    holidayNames: holidayData.activeRows.map((holidayRow) => holidayRow.name),
    holidayRecordConfigured: holidayData.allRows.length > 0,
    employeesOnLeave: leaveEmployeeIds.size,
    sundayCount: sunday ? previewItems.length : 0,
    holidayCount: holiday ? previewItems.length : 0,
    leaveCount: previewItems.filter((item) => item.reasons.includes('Employee Leave')).length,
    eligibleCount: previewItems.length,
    items: previewItems,
  };
}

export async function deactivateNonWorkingDayItems(admin, preview, actor) {
  const ids = preview.items.map((item) => item.id);
  const reasonParts = [];
  if (preview.isSunday) reasonParts.push('Sunday');
  if (preview.isNationalHoliday) reasonParts.push(...(preview.holidayNames || ['National holiday']));
  if (preview.employeesOnLeave) reasonParts.push('Employee leave');
  const reason = `Non-working day: ${reasonParts.join(' + ') || 'Normal working day'}`;
  const { data: operation, error } = await admin.rpc('deactivate_checklist_items_for_non_working_day', {
    p_date: preview.date,
    p_item_ids: ids,
    p_performed_by: actor.id,
    p_reason: reason,
  });
  if (error) throw error;
  const deactivated = operation?.deactivated_items || [];

  const previewById = new Map(preview.items.map((item) => [item.id, item]));
  const byEmployee = new Map();
  (deactivated || []).forEach((item) => {
    const previewItem = previewById.get(item.id);
    const group = byEmployee.get(item.employee_id) || [];
    group.push({ ...item, reason: previewItem?.reason || 'Non-working day' });
    byEmployee.set(item.employee_id, group);
  });

  const dateLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone: defaultChecklistTimeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${preview.date}T12:00:00Z`));
  const notifications = [...byEmployee.entries()]
    .filter(([employeeId]) => employeeId !== actor.id)
    .map(([employeeId, items]) => {
      const reasons = [...new Set(items.map((item) => item.reason))].join(' + ');
      const taskNames = items.map((item) => item.task);
      const taskSummary = taskNames.length === 1 ? taskNames[0] : `${taskNames.length} checklist tasks`;
      const verb = taskNames.length === 1 ? 'was' : 'were';
      return {
        recipient_employee_id: employeeId,
        actor_employee_id: actor.id,
        kind: 'checklist_non_working_day_deactivated',
        title: 'Checklist task deactivated',
        body: `${taskSummary} ${verb} deactivated for ${dateLabel} because it is a ${reasons}.`,
        entity_type: 'checklist_item',
        entity_id: items[0].id,
        dedupe_key: `checklist_non_working_day_deactivated:${preview.date}:${employeeId}`,
      };
    });
  await createServerNotifications(admin, notifications);

  return {
    deactivated: deactivated || [],
    matchedCount: operation?.matched_count || 0,
    notificationsQueued: notifications.length,
    operationId: operation?.operation_id || null,
  };
}

export function formatNonWorkingDayError(error) {
  if (error?.message && /(national_holidays|employee_non_working_days|employee_leave_periods|save_employee_non_working_dates|deactivate_sunday_checklist_items|checklist_items|deactivated)/i.test(error.message) && /(column|constraint|relation|schema cache|does not exist)/i.test(error.message)) {
    return 'The checklist non-working-day feature requires the latest Supabase migration. Apply checklist_direct_non_working_days, then retry.';
  }
  return 'The non-working-day checklist operation could not be completed.';
}

export function getChecklistDateInTimeZone(value = new Date()) {
  return getChecklistBusinessDate(value, defaultChecklistTimeZone);
}
