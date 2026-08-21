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
  const { count: generatedItemCount, error: generatedItemCountError } = await authorization.admin
    .from('checklist_items')
    .select('id', { count: 'exact', head: true })
    .in('template_id', ids);
  if (generatedItemCountError) {
    console.error('Generated checklist item count before bulk deletion failed.', { code: generatedItemCountError.code, message: generatedItemCountError.message });
    return checklistApiError('The generated checklist items could not be checked before deletion.', 500);
  }

  const { error: generatedItemDeleteError } = await authorization.admin.from('checklist_items').delete().in('template_id', ids);
  if (generatedItemDeleteError) {
    console.error('Generated checklist bulk deletion failed.', { code: generatedItemDeleteError.code, message: generatedItemDeleteError.message });
    return checklistApiError('The selected checklist tasks could not be deleted because their generated items could not be removed.', 409);
  }

  const { data: deleted, error } = await authorization.admin.from('checklist_templates').delete().in('id', ids).select('id');
  if (error || deleted?.length !== ids.length) {
    console.error('Checklist bulk delete failed.', { code: error?.code, message: error?.message });
    return checklistApiError('The selected checklist templates could not be deleted.', 500);
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
      kind: 'checklist_deleted',
      title: 'Checklist tasks deleted',
      body: `${employeeTemplates.length} checklist task${employeeTemplates.length === 1 ? '' : 's'} ${employeeTemplates.length === 1 ? 'was' : 'were'} permanently deleted.`,
      entity_type: 'checklist_template',
      entity_id: employeeTemplates[0].id,
      dedupe_key: `checklist_bulk_deleted:${notificationFingerprint([...ids].sort())}:${employeeId}`,
    })));
  return Response.json({ success: true, deleted: deleted.length, generatedItemsDeleted: generatedItemCount || 0 });
}
