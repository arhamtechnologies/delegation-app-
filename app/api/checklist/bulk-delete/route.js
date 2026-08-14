import { authorizeChecklistManager, checklistApiError } from '../../../../lib/checklist-server';
import { createServerNotifications, notificationFingerprint } from '../../../../lib/notifications-server';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const authorization = await authorizeChecklistManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The bulk delete request could not be read.', 400); }
  const ids = Array.isArray(payload?.ids) ? [...new Set(payload.ids.filter((id) => typeof id === 'string' && uuidPattern.test(id)))] : [];
  if (!ids.length) return checklistApiError('Select at least one checklist template.', 400);
  const { data: templates, error: loadError } = await authorization.admin.from('checklist_templates').select('id,employee_id,task,active').in('id', ids);
  if (loadError || (templates || []).length !== ids.length) return checklistApiError('One or more selected checklist templates were not found.', 404);
  const { data: updated, error } = await authorization.admin.from('checklist_templates').update({ active: false }).in('id', ids).select('id');
  if (error || updated?.length !== ids.length) {
    console.error('Checklist bulk delete failed.', { code: error?.code, message: error?.message });
    return checklistApiError('The selected checklist templates could not be deactivated.', 500);
  }
  const grouped = new Map();
  (templates || []).filter((template) => template.active).forEach((template) => {
    const current = grouped.get(template.employee_id) || [];
    current.push(template);
    grouped.set(template.employee_id, current);
  });
  await createServerNotifications(authorization.admin, [...grouped.entries()]
    .filter(([employeeId]) => employeeId !== authorization.employee.id)
    .map(([employeeId, employeeTemplates]) => ({
      recipient_employee_id: employeeId,
      actor_employee_id: authorization.employee.id,
      kind: 'checklist_deactivated',
      title: 'Checklist tasks deactivated',
      body: `${employeeTemplates.length} checklist task${employeeTemplates.length === 1 ? '' : 's'} ${employeeTemplates.length === 1 ? 'was' : 'were'} deactivated.`,
      entity_type: 'checklist_template',
      entity_id: employeeTemplates[0].id,
      dedupe_key: `checklist_bulk_deactivated:${notificationFingerprint([...ids].sort())}:${employeeId}`,
    })));
  return Response.json({ success: true, deleted: updated.length, historyPreserved: true });
}
