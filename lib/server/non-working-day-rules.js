import { getSavedLeaveDates } from '../calendar-leave.mjs';
import { deactivateNonWorkingDayItems, formatNonWorkingDayError, getNonWorkingDayPreview, isValidChecklistDate, restoreChecklistItemsAfterEmployeeLeaveRemoval } from '../checklist-non-working-day';
import { nonWorkingDayManagerRoles } from '../checklist-server';
import { createServerNotifications } from '../notifications-server';
import { actorEmployee, done, fail } from './actor';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateDates(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 366) throw new Error('Choose at least one non-working date.');
  const dates = [...new Set(value)];
  if (dates.some((date) => !isValidChecklistDate(date))) throw new Error('Every non-working date must be a valid date.');
  return dates.sort();
}

async function applyDeactivation(admin, dates, actor) {
  const results = [];
  for (const date of dates) {
    const preview = await getNonWorkingDayPreview(admin, date);
    results.push(await deactivateNonWorkingDayItems(admin, preview, actor));
  }
  return {
    deactivatedCount: results.reduce((total, result) => total + result.deactivated.length, 0),
    notificationsQueued: results.reduce((total, result) => total + result.notificationsQueued, 0),
  };
}

async function getExistingLeaveDates(admin, employeeIds) {
  const response = await admin
    .from('employee_non_working_days')
    .select('employee_id,non_working_date')
    .in('employee_id', employeeIds)
    .eq('reason', 'employee_leave');
  if (response.error) throw response.error;
  const datesByEmployee = new Map(employeeIds.map((employeeId) => [employeeId, []]));
  (response.data || []).forEach((row) => datesByEmployee.get(row.employee_id)?.push(row.non_working_date));
  return datesByEmployee;
}

// Same rules as POST /api/checklist/non-working-days.
export async function configureNonWorkingDays(admin, actor, payload) {
  if (!nonWorkingDayManagerRoles.has(actor.role)) return fail('Only Super Admins and EAs can deactivate non-working-day checklist tasks.', 403);
  try {
    const dates = validateDates(payload?.dates);
    let deactivation = { deactivatedCount: 0, notificationsQueued: 0 };
    if (payload?.reason === 'employee_leave') {
      if (!uuidPattern.test(payload?.employee_id || '')) throw new Error('Choose an active employee.');
      const { data: employee, error: employeeError } = await admin.from('employees').select('id,name,active').eq('id', payload.employee_id).maybeSingle();
      if (employeeError || !employee || employee.active === false) throw new Error('Choose an active employee.');
      const isEditing = uuidPattern.test(payload.previous_employee_id || '');
      const previousEmployeeId = isEditing && payload.previous_employee_id !== payload.employee_id ? payload.previous_employee_id : null;
      const employeeIds = [...new Set([payload.employee_id, ...(previousEmployeeId ? [previousEmployeeId] : [])])];
      const existingLeaveDates = await getExistingLeaveDates(admin, employeeIds);
      if (previousEmployeeId) {
        const { error: clearPreviousError } = await admin.rpc('save_employee_non_working_dates', { p_employee_id: payload.previous_employee_id, p_dates: [], p_created_by: actor.authUserId });
        if (clearPreviousError) throw clearPreviousError;
      }
      const datesToSave = getSavedLeaveDates(existingLeaveDates.get(payload.employee_id), dates, { editing: isEditing });
      const { error } = await admin.rpc('save_employee_non_working_dates', { p_employee_id: payload.employee_id, p_dates: datesToSave, p_created_by: actor.authUserId });
      if (error) throw error;
      const savedDates = new Set(datesToSave);
      const datesToRestore = [];
      employeeIds.forEach((employeeId) => {
        (existingLeaveDates.get(employeeId) || []).forEach((date) => {
          if (employeeId !== payload.employee_id || !savedDates.has(date)) datesToRestore.push([employeeId, date]);
        });
      });
      const restoredCount = (await Promise.all(datesToRestore.map(([employeeId, date]) => restoreChecklistItemsAfterEmployeeLeaveRemoval(admin, employeeId, date)))).reduce((total, count) => total + count, 0);
      deactivation = await applyDeactivation(admin, dates, actorEmployee(actor));
      deactivation.restoredCount = restoredCount;
      await createServerNotifications(admin, [{ recipient_employee_id: employee.id, actor_employee_id: actor.employeeId, kind: 'checklist_non_working_day_configured', title: 'Checklist non-working dates updated', body: `Your checklist is marked non-working on ${dates.length} configured date${dates.length === 1 ? '' : 's'}.`, entity_type: 'employee_non_working_days', entity_id: payload.employee_id, dedupe_key: `checklist_non_working_day_configured:${employee.id}:${dates.join(',')}` }].filter((notification) => notification.recipient_employee_id !== actor.employeeId));
    } else if (payload?.reason === 'national_holiday') {
      const name = String(payload?.name || '').trim();
      const country = String(payload?.country || 'India').trim();
      if (!name || name.length > 160) throw new Error('Holiday name must be between 1 and 160 characters.');
      if (!country || country.length > 80) throw new Error('Country must be between 2 and 80 characters.');
      const existingIds = Array.isArray(payload?.existing_ids) ? payload.existing_ids.filter((id) => uuidPattern.test(id)) : [];
      if (existingIds.length) {
        const { data: existingRows, error: existingError } = await admin.from('national_holidays').select('id,holiday_date').in('id', existingIds);
        if (existingError) throw existingError;
        const removeIds = (existingRows || []).filter((row) => !dates.includes(row.holiday_date)).map((row) => row.id);
        if (removeIds.length) {
          const { error } = await admin.from('national_holidays').delete().in('id', removeIds);
          if (error) throw error;
        }
      }
      const { data: conflicts, error: conflictError } = await admin.from('national_holidays').select('id,holiday_date').in('holiday_date', dates).eq('country', country).eq('is_active', true);
      if (conflictError) throw conflictError;
      if ((conflicts || []).some((row) => !existingIds.includes(row.id))) throw new Error('A national holiday already exists for this country and date.');
      const { error } = await admin.from('national_holidays').upsert(dates.map((holiday_date) => ({ holiday_date, name, country, is_active: payload?.is_active !== false, updated_at: new Date().toISOString() })), { onConflict: 'holiday_date,country' });
      if (error) throw error;
      deactivation = await applyDeactivation(admin, dates, actorEmployee(actor));
    } else throw new Error('Choose Employee Leave or National Holiday.');
    return done({ success: true, dates, ...deactivation });
  } catch (error) {
    console.error('Non-working-day configuration failed.', { code: error?.code, message: error?.message });
    const invalid = /Choose |Every |Holiday name/.test(error?.message || '');
    if (/already exists/i.test(error?.message || '')) return fail(error.message, 409);
    return fail(invalid ? error.message : formatNonWorkingDayError(error), invalid ? 400 : 500);
  }
}

// Same rule as DELETE /api/checklist/non-working-days: one leave date, or holidays by id.
export async function removeNonWorkingDay(admin, actor, payload) {
  if (!nonWorkingDayManagerRoles.has(actor.role)) return fail('Only Super Admins and EAs can deactivate non-working-day checklist tasks.', 403);
  try {
    if (payload?.reason === 'employee_leave') {
      if (!uuidPattern.test(payload?.employee_id || '') || !isValidChecklistDate(payload?.date)) return fail('A valid employee and date are required.', 400);
      const { error } = await admin.from('employee_non_working_days').delete().eq('employee_id', payload.employee_id).eq('non_working_date', payload.date).eq('reason', 'employee_leave');
      if (error) throw error;
      const restoredCount = await restoreChecklistItemsAfterEmployeeLeaveRemoval(admin, payload.employee_id, payload.date);
      return done({ success: true, restoredCount });
    } else if (payload?.reason === 'national_holiday') {
      const ids = Array.isArray(payload?.ids) ? payload.ids.filter((id) => uuidPattern.test(id)) : [];
      if (!ids.length) return fail('At least one holiday is required.', 400);
      const { error } = await admin.from('national_holidays').delete().in('id', ids);
      if (error) throw error;
    } else return fail('Choose a non-working-day reason.', 400);
    return done({ success: true });
  } catch (error) { return fail(formatNonWorkingDayError(error), 500); }
}

// Same rule as DELETE /api/checklist/holidays (soft disable).
export async function disableHoliday(admin, actor, payload) {
  if (!nonWorkingDayManagerRoles.has(actor.role)) return fail('Only Super Admins and EAs can deactivate non-working-day checklist tasks.', 403);
  if (!uuidPattern.test(payload?.id || '')) return fail('A valid holiday is required.', 400);
  const { data, error } = await admin.from('national_holidays').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', payload.id).select('id,is_active').maybeSingle();
  if (error) return fail('The national holiday could not be disabled.', 500);
  if (!data) return fail('The national holiday was not found.', 404);
  return done({ success: true, holiday: data });
}

// Calendar settings read model, shared by the API route and the server-rendered Calendar page.
export async function getConfiguredDays(admin) {
  const [leaveResponse, holidayResponse] = await Promise.all([
    admin.from('employee_non_working_days').select('id,employee_id,non_working_date,reason,employee:employees!employee_non_working_days_employee_id_fkey(id,name,email,active)').eq('reason', 'employee_leave').order('non_working_date', { ascending: true }),
    admin.from('national_holidays').select('id,holiday_date,name,country,is_active,created_at,updated_at').order('holiday_date', { ascending: true }).order('country', { ascending: true }),
  ]);
  if (leaveResponse.error) throw leaveResponse.error;
  if (holidayResponse.error) throw holidayResponse.error;

  const leaveGroups = new Map();
  (leaveResponse.data || []).forEach((row) => {
    const current = leaveGroups.get(row.employee_id) || { key: row.employee_id, employeeId: row.employee_id, employee: row.employee, dates: [], ids: [] };
    current.dates.push(row.non_working_date);
    current.ids.push(row.id);
    leaveGroups.set(row.employee_id, current);
  });
  const holidayGroups = new Map();
  (holidayResponse.data || []).forEach((row) => {
    const key = `${row.country}::${row.name}`;
    const current = holidayGroups.get(key) || { key, name: row.name, country: row.country, isActive: row.is_active, dates: [], ids: [] };
    current.dates.push(row.holiday_date);
    current.ids.push(row.id);
    current.isActive = current.isActive || row.is_active;
    holidayGroups.set(key, current);
  });
  const groups = [...holidayGroups.values()];
  return { employeeLeave: [...leaveGroups.values()], holidays: groups.map((group) => ({ ...group, id: group.ids[0], holiday_date: group.dates[0], is_active: group.isActive })), holidayGroups: groups };
}
