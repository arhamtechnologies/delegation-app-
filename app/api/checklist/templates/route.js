import { authorizeChecklistManager, checklistApiError } from '../../../../lib/checklist-server';
import { createServerNotifications, notificationFingerprint } from '../../../../lib/notifications-server';

export const runtime = 'nodejs';

const frequencyValues = new Set(['daily', 'weekly', 'every_15_days', 'monthly']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }
function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function cleanDays(value) { return [...new Set((Array.isArray(value) ? value : []).map(Number))].sort((left, right) => left - right); }

function normalizeRecord(payload, createdBy) {
  const frequency = payload?.frequency;
  const monthlyDays = cleanDays(payload?.monthly_days);
  if (!payload?.employee_id || !payload?.task?.trim() || payload.task.trim().length > 240) throw new Error('Choose an employee and provide a task between 1 and 240 characters.');
  if (!frequencyValues.has(frequency)) throw new Error('Choose a supported recurrence.');
  if (!validDate(payload.start_date)) throw new Error('Start date must be a valid date.');
  if (!validTime(payload.due_time)) throw new Error('Due time must be between 00:00 and 23:59.');
  if (frequency === 'weekly' && (!Number.isInteger(Number(payload.weekday)) || Number(payload.weekday) < 0 || Number(payload.weekday) > 6)) throw new Error('Choose a weekday for weekly recurrence.');
  if (frequency === 'monthly' && (!monthlyDays.length || monthlyDays.some((day) => day < 1 || day > 31))) throw new Error('Choose one or more valid monthly days.');
  const record = {
    employee_id: payload.employee_id,
    task: payload.task.trim(),
    frequency,
    weekday: frequency === 'weekly' ? Number(payload.weekday) : null,
    day_of_month: frequency === 'monthly' ? monthlyDays[0] : null,
    monthly_days: frequency === 'monthly' ? monthlyDays : [],
    start_date: payload.start_date,
    due_time: payload.due_time,
    active: payload.active !== false,
  };
  if (createdBy) record.created_by = createdBy;
  return record;
}

export async function POST(request) {
  const authorization = await authorizeChecklistManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The checklist request could not be read.', 400); }
  try {
    const record = normalizeRecord(payload, authorization.user.id);
    const { data: employee } = await authorization.admin.from('employees').select('id').eq('id', record.employee_id).eq('active', true).maybeSingle();
    if (!employee) return checklistApiError('Choose an active existing employee.', 400);
    const { data: created, error } = await authorization.admin.from('checklist_templates').insert(record).select('id,employee_id,task,active').single();
    if (error) {
      console.error('Checklist template creation failed.', { code: error.code, message: error.message });
      return checklistApiError('The checklist template could not be created.', 500);
    }
    if (created.active && created.employee_id !== authorization.employee.id) {
      await createServerNotifications(authorization.admin, [{
        recipient_employee_id: created.employee_id,
        actor_employee_id: authorization.employee.id,
        kind: 'checklist_created',
        title: 'New checklist task',
        body: `A new checklist task has been added: ${created.task}`,
        entity_type: 'checklist_template',
        entity_id: created.id,
        dedupe_key: `checklist_template_created:${created.id}:${created.employee_id}`,
      }]);
    }
    return Response.json({ success: true, template: created });
  } catch (error) {
    return checklistApiError(error.message || 'The checklist template could not be created.', 400);
  }
}

export async function PATCH(request) {
  const authorization = await authorizeChecklistManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The checklist request could not be read.', 400); }
  if (!payload?.id) return checklistApiError('A checklist template is required.', 400);
  try {
    const { data: previous, error: previousError } = await authorization.admin.from('checklist_templates').select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active,created_by').eq('id', payload.id).maybeSingle();
    if (previousError || !previous) return checklistApiError('The checklist template was not found.', 404);
    const record = normalizeRecord(payload, previous.created_by);
    const { data: employee } = await authorization.admin.from('employees').select('id').eq('id', record.employee_id).eq('active', true).maybeSingle();
    if (!employee) return checklistApiError('Choose an active existing employee.', 400);
    const { data: updated, error } = await authorization.admin.from('checklist_templates').update(record).eq('id', payload.id).select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active,updated_at').single();
    if (error) {
      console.error('Checklist template update failed.', { code: error.code, message: error.message });
      return checklistApiError('The checklist template could not be updated.', 500);
    }
    const fingerprint = notificationFingerprint([updated.id, updated.employee_id, updated.task, updated.frequency, updated.weekday, updated.day_of_month, updated.monthly_days, updated.start_date, updated.due_time, updated.active]);
    const notifications = [];
    if (previous.active && !updated.active) {
      notifications.push({ recipient_employee_id: previous.employee_id, kind: 'checklist_deactivated', title: 'Checklist task deactivated', body: `Checklist task '${previous.task}' has been deactivated.`, entity_type: 'checklist_template', entity_id: updated.id, dedupe_key: `checklist_deactivated:${updated.id}:${previous.employee_id}:${fingerprint}` });
    } else if (previous.employee_id !== updated.employee_id) {
      notifications.push({ recipient_employee_id: previous.employee_id, kind: 'checklist_updated', title: 'Checklist task updated', body: `Checklist task '${previous.task}' is no longer assigned to you.`, entity_type: 'checklist_template', entity_id: updated.id, dedupe_key: `checklist_assignment_removed:${updated.id}:${previous.employee_id}:${fingerprint}` });
      if (updated.active) notifications.push({ recipient_employee_id: updated.employee_id, kind: 'checklist_created', title: 'New checklist task', body: `A new checklist task has been assigned to you: ${updated.task}`, entity_type: 'checklist_template', entity_id: updated.id, dedupe_key: `checklist_assignment_added:${updated.id}:${updated.employee_id}:${fingerprint}` });
    } else if (previous.task !== updated.task || previous.frequency !== updated.frequency || previous.weekday !== updated.weekday || previous.day_of_month !== updated.day_of_month || JSON.stringify(previous.monthly_days) !== JSON.stringify(updated.monthly_days) || previous.start_date !== updated.start_date || previous.due_time !== updated.due_time || previous.active !== updated.active) {
      notifications.push({ recipient_employee_id: updated.employee_id, kind: 'checklist_updated', title: 'Checklist task updated', body: `Checklist task '${updated.task}' was updated.`, entity_type: 'checklist_template', entity_id: updated.id, dedupe_key: `checklist_updated:${updated.id}:${updated.employee_id}:${fingerprint}` });
    }
    await createServerNotifications(authorization.admin, notifications.filter((notification) => notification.recipient_employee_id !== authorization.employee.id).map((notification) => ({ ...notification, actor_employee_id: authorization.employee.id })));
    return Response.json({ success: true, template: updated });
  } catch (error) {
    return checklistApiError(error.message || 'The checklist template could not be updated.', 400);
  }
}

export async function DELETE(request) {
  const authorization = await authorizeChecklistManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The checklist deletion request could not be read.', 400); }
  if (!uuidPattern.test(payload?.id || '')) return checklistApiError('A valid checklist template is required.', 400);

  const { data: template, error: templateError } = await authorization.admin
    .from('checklist_templates')
    .select('id,employee_id,task,active')
    .eq('id', payload.id)
    .maybeSingle();
  if (templateError) {
    console.error('Checklist template lookup before deletion failed.', { code: templateError.code, message: templateError.message });
    return checklistApiError('The checklist template could not be loaded.', 500);
  }
  if (!template) return checklistApiError('The checklist template was not found.', 404);

  const { count: generatedItemCount, error: generatedItemCountError } = await authorization.admin
    .from('checklist_items')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', template.id);
  if (generatedItemCountError) {
    console.error('Generated checklist item count before deletion failed.', { code: generatedItemCountError.code, message: generatedItemCountError.message });
    return checklistApiError('The generated checklist items could not be checked before deletion.', 500);
  }

  const { error: generatedItemDeleteError } = await authorization.admin
    .from('checklist_items')
    .delete()
    .eq('template_id', template.id);
  if (generatedItemDeleteError) {
    console.error('Generated checklist item deletion failed.', { code: generatedItemDeleteError.code, message: generatedItemDeleteError.message, templateId: template.id });
    return checklistApiError('The checklist task could not be deleted because its generated items could not be removed.', 409);
  }

  const { data: deletedTemplate, error: templateDeleteError } = await authorization.admin
    .from('checklist_templates')
    .delete()
    .eq('id', template.id)
    .select('id')
    .maybeSingle();
  if (templateDeleteError) {
    console.error('Checklist template deletion failed.', { code: templateDeleteError.code, message: templateDeleteError.message, templateId: template.id });
    return checklistApiError('The checklist task could not be deleted.', 409);
  }
  if (!deletedTemplate) return checklistApiError('Checklist deletion did not affect the requested task.', 404);

  if (template.active && template.employee_id !== authorization.employee.id) {
    await createServerNotifications(authorization.admin, [{
      recipient_employee_id: template.employee_id,
      actor_employee_id: authorization.employee.id,
      kind: 'checklist_deleted',
      title: 'Checklist task deleted',
      body: `Checklist task '${template.task}' was permanently deleted.`,
      entity_type: 'checklist_template',
      entity_id: template.id,
      dedupe_key: `checklist_deleted:${template.id}:${template.employee_id}`,
    }]);
  }

  return Response.json({ success: true, deleted: true, generatedItemsDeleted: generatedItemCount || 0 });
}
