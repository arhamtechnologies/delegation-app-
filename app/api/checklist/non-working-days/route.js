import { authorizeNonWorkingDayManager, checklistApiError } from '../../../../lib/checklist-server';
import { createServerNotifications } from '../../../../lib/notifications-server';
import { deactivateNonWorkingDayItems, formatNonWorkingDayError, getNonWorkingDayPreview, isValidChecklistDate } from '../../../../lib/checklist-non-working-day';

export const runtime = 'nodejs';

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

async function getConfiguredDays(admin) {
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

export async function GET(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  try { return Response.json({ success: true, ...(await getConfiguredDays(authorization.admin)) }); }
  catch (error) { return checklistApiError(formatNonWorkingDayError(error), 500); }
}

export async function POST(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The non-working-day request could not be read.', 400); }
  try {
    const dates = validateDates(payload?.dates);
    let deactivation = { deactivatedCount: 0, notificationsQueued: 0 };
    if (payload?.reason === 'employee_leave') {
      if (!uuidPattern.test(payload?.employee_id || '')) throw new Error('Choose an active employee.');
      const { data: employee, error: employeeError } = await authorization.admin.from('employees').select('id,name,active').eq('id', payload.employee_id).maybeSingle();
      if (employeeError || !employee || employee.active === false) throw new Error('Choose an active employee.');
      if (payload.previous_employee_id && payload.previous_employee_id !== payload.employee_id && uuidPattern.test(payload.previous_employee_id)) {
        const { error: clearPreviousError } = await authorization.admin.rpc('save_employee_non_working_dates', { p_employee_id: payload.previous_employee_id, p_dates: [], p_created_by: authorization.user.id });
        if (clearPreviousError) throw clearPreviousError;
      }
      const { error } = await authorization.admin.rpc('save_employee_non_working_dates', { p_employee_id: payload.employee_id, p_dates: dates, p_created_by: authorization.user.id });
      if (error) throw error;
      deactivation = await applyDeactivation(authorization.admin, dates, authorization.employee);
      await createServerNotifications(authorization.admin, [{ recipient_employee_id: employee.id, actor_employee_id: authorization.employee.id, kind: 'checklist_non_working_day_configured', title: 'Checklist non-working dates updated', body: `Your checklist is marked non-working on ${dates.length} configured date${dates.length === 1 ? '' : 's'}.`, entity_type: 'employee_non_working_days', entity_id: payload.employee_id, dedupe_key: `checklist_non_working_day_configured:${employee.id}:${dates.join(',')}` }].filter((notification) => notification.recipient_employee_id !== authorization.employee.id));
    } else if (payload?.reason === 'national_holiday') {
      const name = String(payload?.name || '').trim();
      const country = String(payload?.country || 'India').trim();
      if (!name || name.length > 160) throw new Error('Holiday name must be between 1 and 160 characters.');
      if (!country || country.length > 80) throw new Error('Country must be between 2 and 80 characters.');
      const existingIds = Array.isArray(payload?.existing_ids) ? payload.existing_ids.filter((id) => uuidPattern.test(id)) : [];
      if (existingIds.length) {
        const { data: existingRows, error: existingError } = await authorization.admin.from('national_holidays').select('id,holiday_date').in('id', existingIds);
        if (existingError) throw existingError;
        const removeIds = (existingRows || []).filter((row) => !dates.includes(row.holiday_date)).map((row) => row.id);
        if (removeIds.length) {
          const { error } = await authorization.admin.from('national_holidays').delete().in('id', removeIds);
          if (error) throw error;
        }
      }
      const { data: conflicts, error: conflictError } = await authorization.admin.from('national_holidays').select('id,holiday_date').in('holiday_date', dates).eq('country', country).eq('is_active', true);
      if (conflictError) throw conflictError;
      if ((conflicts || []).some((row) => !existingIds.includes(row.id))) throw new Error('A national holiday already exists for this country and date.');
      const { error } = await authorization.admin.from('national_holidays').upsert(dates.map((holiday_date) => ({ holiday_date, name, country, is_active: payload?.is_active !== false, updated_at: new Date().toISOString() })), { onConflict: 'holiday_date,country' });
      if (error) throw error;
      deactivation = await applyDeactivation(authorization.admin, dates, authorization.employee);
    } else throw new Error('Choose Employee Leave or National Holiday.');
    return Response.json({ success: true, dates, ...deactivation });
  } catch (error) {
    console.error('Non-working-day configuration failed.', { code: error?.code, message: error?.message });
    const invalid = /Choose |Every |Holiday name/.test(error?.message || '');
    if (/already exists/i.test(error?.message || '')) return checklistApiError(error.message, 409);
    return checklistApiError(invalid ? error.message : formatNonWorkingDayError(error), invalid ? 400 : 500);
  }
}

export async function DELETE(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The remove request could not be read.', 400); }
  try {
    if (payload?.reason === 'employee_leave') {
      if (!uuidPattern.test(payload?.employee_id || '') || !isValidChecklistDate(payload?.date)) return checklistApiError('A valid employee and date are required.', 400);
      const { error } = await authorization.admin.from('employee_non_working_days').delete().eq('employee_id', payload.employee_id).eq('non_working_date', payload.date).eq('reason', 'employee_leave');
      if (error) throw error;
    } else if (payload?.reason === 'national_holiday') {
      const ids = Array.isArray(payload?.ids) ? payload.ids.filter((id) => uuidPattern.test(id)) : [];
      if (!ids.length) return checklistApiError('At least one holiday is required.', 400);
      const { error } = await authorization.admin.from('national_holidays').delete().in('id', ids);
      if (error) throw error;
    } else return checklistApiError('Choose a non-working-day reason.', 400);
    return Response.json({ success: true });
  } catch (error) { return checklistApiError(formatNonWorkingDayError(error), 500); }
}
