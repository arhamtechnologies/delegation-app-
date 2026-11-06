import { authorizeChecklistEmployee, checklistApiError } from '../../../../lib/checklist-server';
import { getChecklistBusinessDate } from '../../../../lib/checklist-time';
import { loadAssignedChecklists } from '../../../../lib/server/assigned-checklists.mjs';

export const runtime = 'nodejs';

const timeZone = process.env.CHECKLIST_TIMEZONE || 'Asia/Kolkata';

// Employees cannot read checklist_templates through RLS; this returns only the caller's own rows.
export async function GET(request) {
  const authorization = await authorizeChecklistEmployee(request);
  if (authorization.response) return authorization.response;
  const today = getChecklistBusinessDate(new Date(), timeZone);
  try {
    return Response.json({ success: true, today, checklists: await loadAssignedChecklists(authorization.admin, authorization.employee.id, today) });
  } catch (error) {
    console.error('Assigned checklists could not be loaded.', { code: error.code, message: error.message });
    return checklistApiError('Your assigned checklists could not be loaded.', 500);
  }
}
