import { authorizeNonWorkingDayManager, checklistApiError } from '../../../../lib/checklist-server';
import { formatNonWorkingDayError } from '../../../../lib/checklist-non-working-day';
import { actorFromAuthorization, ruleResponse } from '../../../../lib/server/actor';
import { configureNonWorkingDays, getConfiguredDays, removeNonWorkingDay } from '../../../../lib/server/non-working-day-rules';

export const runtime = 'nodejs';

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
