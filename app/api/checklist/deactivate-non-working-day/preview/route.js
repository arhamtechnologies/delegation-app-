import { authorizeNonWorkingDayManager, checklistApiError } from '../../../../../lib/checklist-server';
import { formatNonWorkingDayError, getNonWorkingDayPreview } from '../../../../../lib/checklist-non-working-day';

export const runtime = 'nodejs';

export async function POST(request) {
  const authorization = await authorizeNonWorkingDayManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The preview request could not be read.', 400); }
  try {
    const preview = await getNonWorkingDayPreview(authorization.admin, payload?.date);
    return Response.json({ success: true, ...preview });
  } catch (error) {
    console.error('Checklist non-working-day preview failed.', { code: error?.code, message: error?.message });
    return checklistApiError(error?.message?.startsWith('Choose a valid date') ? error.message : formatNonWorkingDayError(error), error?.message?.startsWith('Choose a valid date') ? 400 : 500);
  }
}
