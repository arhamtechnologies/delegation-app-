import { authorizeNonWorkingDayManager, checklistApiError } from '../../../../lib/checklist-server';
import { formatNonWorkingDayError } from '../../../../lib/checklist-non-working-day';
import { actorFromAuthorization, ruleResponse } from '../../../../lib/server/actor';
import { configureNonWorkingDays, removeNonWorkingDay } from '../../../../lib/server/non-working-day-rules';

export const runtime = 'nodejs';

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
  return ruleResponse(await configureNonWorkingDays(authorization.admin, actorFromAuthorization(authorization), payload));
}

export async function DELETE(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The remove request could not be read.', 400); }
  return ruleResponse(await removeNonWorkingDay(authorization.admin, actorFromAuthorization(authorization), payload));
}
