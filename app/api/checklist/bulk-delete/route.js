import { authorizeChecklistManager, checklistApiError } from '../../../../lib/checklist-server';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const authorization = await authorizeChecklistManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The bulk delete request could not be read.', 400); }
  const ids = Array.isArray(payload?.ids) ? [...new Set(payload.ids.filter((id) => typeof id === 'string' && uuidPattern.test(id)))] : [];
  if (!ids.length) return checklistApiError('Select at least one checklist template.', 400);
  const { data: updated, error } = await authorization.admin.from('checklist_templates').update({ active: false }).in('id', ids).select('id');
  if (error || updated?.length !== ids.length) {
    console.error('Checklist bulk delete failed.', { code: error?.code, message: error?.message });
    return checklistApiError('The selected checklist templates could not be deactivated.', 500);
  }
  return Response.json({ success: true, deleted: updated.length, historyPreserved: true });
}
