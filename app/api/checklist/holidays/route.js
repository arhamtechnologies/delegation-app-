import { authorizeNonWorkingDayManager, checklistApiError } from '../../../../lib/checklist-server';
import { deactivateNonWorkingDayItems, formatNonWorkingDayError, getNonWorkingDayPreview, isValidChecklistDate } from '../../../../lib/checklist-non-working-day';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeHoliday(payload, fallback = {}) {
  const holidayDate = payload?.holiday_date ?? fallback.holiday_date;
  const name = String(payload?.name ?? fallback.name ?? '').trim();
  const country = String(payload?.country ?? fallback.country ?? '').trim();
  const isActive = payload?.is_active ?? fallback.is_active;
  if (!isValidChecklistDate(holidayDate)) throw new Error('Holiday date must be a valid date.');
  if (!name || name.length > 160) throw new Error('Holiday name must be between 1 and 160 characters.');
  if (!country || country.length > 80) throw new Error('Country must be between 2 and 80 characters.');
  if (typeof isActive !== 'boolean') throw new Error('Holiday active status must be true or false.');
  return { holiday_date: holidayDate, name, country, is_active: isActive, updated_at: new Date().toISOString() };
}

function holidayErrorResponse(error, fallbackMessage) {
  const validationError = /Holiday date|Holiday name|Country must|Holiday active status/.test(error?.message || '');
  return checklistApiError(validationError ? error.message : formatNonWorkingDayError(error) || fallbackMessage, validationError ? 400 : 500);
}

async function applyRetroactiveHolidayDeactivation(admin, date, actor) {
  const preview = await getNonWorkingDayPreview(admin, date);
  if (!preview.isNationalHoliday) return { deactivatedCount: 0, notificationsQueued: 0, operationId: null };
  const result = await deactivateNonWorkingDayItems(admin, preview, actor);
  return {
    deactivatedCount: result.deactivated.length,
    notificationsQueued: result.notificationsQueued,
    operationId: result.operationId,
  };
}

export async function GET(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  const { data, error } = await authorization.admin.from('national_holidays').select('id,holiday_date,name,country,is_active,created_at,updated_at').order('holiday_date', { ascending: true }).order('country', { ascending: true });
  if (error) return checklistApiError('National holidays could not be loaded.', 500);
  return Response.json({ success: true, holidays: data || [] });
}

export async function POST(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The holiday request could not be read.', 400); }
  try {
    const holiday = normalizeHoliday(payload, { is_active: true });
    const { data: existing } = await authorization.admin.from('national_holidays').select('id').eq('holiday_date', holiday.holiday_date).eq('country', holiday.country).maybeSingle();
    if (existing) return checklistApiError('A holiday already exists for this country and date.', 409);
    const { data, error } = await authorization.admin.from('national_holidays').insert(holiday).select('id,holiday_date,name,country,is_active,created_at,updated_at').single();
    if (error) return checklistApiError('The national holiday could not be added.', 500);
    const deactivation = holiday.is_active
      ? await applyRetroactiveHolidayDeactivation(authorization.admin, holiday.holiday_date, authorization.employee)
      : { deactivatedCount: 0, notificationsQueued: 0, operationId: null };
    return Response.json({ success: true, holiday: data, ...deactivation });
  } catch (error) {
    console.error('National holiday creation failed.', { code: error?.code, message: error?.message });
    return holidayErrorResponse(error, 'The national holiday could not be added.');
  }
}

export async function PATCH(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The holiday request could not be read.', 400); }
  if (!uuidPattern.test(payload?.id || '')) return checklistApiError('A valid holiday is required.', 400);
  const { data: previous, error: loadError } = await authorization.admin.from('national_holidays').select('id,holiday_date,name,country,is_active').eq('id', payload.id).maybeSingle();
  if (loadError || !previous) return checklistApiError('The national holiday was not found.', 404);
  try {
    const holiday = normalizeHoliday(payload, previous);
    const { data: duplicate } = await authorization.admin.from('national_holidays').select('id').eq('holiday_date', holiday.holiday_date).eq('country', holiday.country).neq('id', payload.id).maybeSingle();
    if (duplicate) return checklistApiError('A holiday already exists for this country and date.', 409);
    const { data, error } = await authorization.admin.from('national_holidays').update(holiday).eq('id', payload.id).select('id,holiday_date,name,country,is_active,created_at,updated_at').single();
    if (error) return checklistApiError('The national holiday could not be updated.', 500);
    const shouldApplyDeactivation = holiday.is_active && (!previous.is_active || previous.holiday_date !== holiday.holiday_date);
    const deactivation = shouldApplyDeactivation
      ? await applyRetroactiveHolidayDeactivation(authorization.admin, holiday.holiday_date, authorization.employee)
      : { deactivatedCount: 0, notificationsQueued: 0, operationId: null };
    return Response.json({ success: true, holiday: data, ...deactivation });
  } catch (error) {
    console.error('National holiday update failed.', { code: error?.code, message: error?.message });
    return holidayErrorResponse(error, 'The national holiday could not be updated.');
  }
}

export async function DELETE(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The holiday request could not be read.', 400); }
  if (!uuidPattern.test(payload?.id || '')) return checklistApiError('A valid holiday is required.', 400);
  const { data, error } = await authorization.admin.from('national_holidays').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', payload.id).select('id,is_active').maybeSingle();
  if (error) return checklistApiError('The national holiday could not be disabled.', 500);
  if (!data) return checklistApiError('The national holiday was not found.', 404);
  return Response.json({ success: true, holiday: data });
}
