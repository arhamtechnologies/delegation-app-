import { authorizeNonWorkingDayManager, checklistApiError } from '../../../../lib/checklist-server';
import { deactivateNonWorkingDayItems, formatNonWorkingDayError, getNonWorkingDayPreview } from '../../../../lib/checklist-non-working-day';

export const runtime = 'nodejs';

export async function POST(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The deactivation request could not be read.', 400); }
  try {
    const preview = await getNonWorkingDayPreview(authorization.admin, payload?.date);
    const result = await deactivateNonWorkingDayItems(authorization.admin, preview, authorization.employee);
    return Response.json({
      success: true,
      date: preview.date,
      isSunday: preview.isSunday,
      isNationalHoliday: preview.isNationalHoliday,
      employeesOnLeave: preview.employeesOnLeave,
      matchedCount: result.matchedCount,
      deactivatedCount: result.deactivated.length,
      operationId: result.operationId,
      performedBy: { id: authorization.employee.id, name: authorization.employee.name, role: authorization.employee.role },
      notificationsQueued: result.notificationsQueued,
    });
  } catch (error) {
    console.error('Checklist non-working-day deactivation failed.', { code: error?.code, message: error?.message });
    return checklistApiError(error?.message?.startsWith('Choose a valid date') ? error.message : formatNonWorkingDayError(error), error?.message?.startsWith('Choose a valid date') ? 400 : 500);
  }
}
