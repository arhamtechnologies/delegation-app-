import { getChecklistTemplateUpdateError, isChecklistTemplateValidationError } from '../checklist-template-errors.mjs';
import { normalizeTemplateRecord } from '../checklist-template-record.mjs';
import { checklistManagerRoles } from '../checklist-server';
import { createServerNotifications, notificationFingerprint } from '../notifications-server';
import { done, fail } from './actor';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Same rules as POST/PATCH/DELETE /api/checklist/templates.
export async function createTemplate(admin, actor, payload) {
  if (!checklistManagerRoles.has(actor.role)) return fail('You do not have permission to manage checklists.', 403);
  try {
    const record = normalizeTemplateRecord(payload, actor.authUserId);
    // Set only from WhatsApp, where several director numbers share one login, so alerts name the right one.
    if (actor.chatId) Object.assign(record, { assigned_by_name: actor.name, assigned_by_chat_id: actor.chatId });
    const { data: employee } = await admin.from('employees').select('id').eq('id', record.employee_id).eq('active', true).maybeSingle();
    if (!employee) return fail('Choose an active existing employee.', 400);
    let { data: created, error } = await admin.from('checklist_templates').insert(record).select('id,employee_id,task,active').single();
    // Until migration 20261031090000 adds the assigned_by columns, save without them.
    if (error?.code === 'PGRST204' && record.assigned_by_name) {
      delete record.assigned_by_name;
      delete record.assigned_by_chat_id;
      ({ data: created, error } = await admin.from('checklist_templates').insert(record).select('id,employee_id,task,active').single());
    }
    if (error) {
      console.error('Checklist template creation failed.', { code: error.code, message: error.message });
      return fail('The checklist template could not be created.', 500);
    }
    if (created.active && created.employee_id !== actor.employeeId) {
      await createServerNotifications(admin, [{
        recipient_employee_id: created.employee_id,
        actor_employee_id: actor.employeeId,
        kind: 'checklist_created',
        title: 'New checklist task',
        body: `A new checklist task has been added: ${created.task}`,
        entity_type: 'checklist_template',
        entity_id: created.id,
        dedupe_key: `checklist_template_created:${created.id}:${created.employee_id}`,
      }]);
    }
    return done({ success: true, template: created });
  } catch (error) {
    return fail(error.message || 'The checklist template could not be created.', 400);
  }
}

export async function updateTemplate(admin, actor, payload) {
  if (!checklistManagerRoles.has(actor.role)) return fail('You do not have permission to manage checklists.', 403);
  if (!uuidPattern.test(payload?.id || '')) return fail('A valid checklist template is required.', 400);
  const updateContext = {
    operation: 'update_checklist_template',
    templateId: payload.id,
    existingEmployeeId: null,
    newEmployeeId: payload.employee_id || null,
    taskTitle: String(payload.task || '').trim() || null,
    frequency: payload.frequency || null,
    startDate: payload.start_date || null,
    dueTime: payload.due_time || null,
    active: payload.active,
  };
  try {
    const { data: previous, error: previousError } = await admin.from('checklist_templates').select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active,created_by').eq('id', payload.id).maybeSingle();
    if (previousError) {
      console.error('Checklist template update lookup failed.', { ...updateContext, code: previousError.code, message: previousError.message, details: previousError.details, hint: previousError.hint });
      return fail('The checklist template could not be loaded.', 500);
    }
    if (!previous) return fail('The checklist template was not found.', 404);
    updateContext.existingEmployeeId = previous.employee_id;
    const record = normalizeTemplateRecord(payload, previous.created_by);
    updateContext.newEmployeeId = record.employee_id;
    const { data: employee, error: employeeError } = await admin.from('employees').select('id').eq('id', record.employee_id).eq('active', true).maybeSingle();
    if (employeeError) {
      console.error('Checklist template employee validation failed.', { ...updateContext, code: employeeError.code, message: employeeError.message, details: employeeError.details, hint: employeeError.hint });
      return fail('The selected employee could not be verified.', 500);
    }
    if (!employee) return fail('Choose an active existing employee.', 400);
    const { data: updated, error } = await admin.from('checklist_templates').update(record).eq('id', payload.id).select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active,updated_at').single();
    if (error) {
      console.error('Checklist template update failed.', { ...updateContext, code: error.code, message: error.message, details: error.details, hint: error.hint });
      const responseError = getChecklistTemplateUpdateError(error);
      return fail(responseError.message, responseError.status);
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
    await createServerNotifications(admin, notifications.filter((notification) => notification.recipient_employee_id !== actor.employeeId).map((notification) => ({ ...notification, actor_employee_id: actor.employeeId })));
    return done({ success: true, template: updated });
  } catch (error) {
    console.error('Checklist template update request failed.', { ...updateContext, code: error.code, message: error.message, details: error.details, hint: error.hint });
    if (isChecklistTemplateValidationError(error)) return fail(error.message, 400);
    const responseError = getChecklistTemplateUpdateError(error);
    return fail(responseError.message, responseError.status);
  }
}

export async function deleteTemplate(admin, actor, payload) {
  if (!checklistManagerRoles.has(actor.role)) return fail('You do not have permission to manage checklists.', 403);
  if (!uuidPattern.test(payload?.id || '')) return fail('A valid checklist template is required.', 400);

  const { data: template, error: templateError } = await admin
    .from('checklist_templates')
    .select('id,employee_id,task,active')
    .eq('id', payload.id)
    .maybeSingle();
  if (templateError) {
    console.error('Checklist template lookup before deletion failed.', { code: templateError.code, message: templateError.message });
    return fail('The checklist template could not be loaded.', 500);
  }
  if (!template) return fail('The checklist template was not found.', 404);

  const { count: generatedItemCount, error: generatedItemCountError } = await admin
    .from('checklist_items')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', template.id);
  if (generatedItemCountError) {
    console.error('Generated checklist item count before deletion failed.', { code: generatedItemCountError.code, message: generatedItemCountError.message });
    return fail('The generated checklist items could not be checked before deletion.', 500);
  }

  const { error: generatedItemDeleteError } = await admin
    .from('checklist_items')
    .delete()
    .eq('template_id', template.id);
  if (generatedItemDeleteError) {
    console.error('Generated checklist item deletion failed.', { code: generatedItemDeleteError.code, message: generatedItemDeleteError.message, templateId: template.id });
    return fail('The checklist task could not be deleted because its generated items could not be removed.', 409);
  }

  const { data: deletedTemplate, error: templateDeleteError } = await admin
    .from('checklist_templates')
    .delete()
    .eq('id', template.id)
    .select('id')
    .maybeSingle();
  if (templateDeleteError) {
    console.error('Checklist template deletion failed.', { code: templateDeleteError.code, message: templateDeleteError.message, templateId: template.id });
    return fail('The checklist task could not be deleted.', 409);
  }
  if (!deletedTemplate) return fail('Checklist deletion did not affect the requested task.', 404);

  if (template.active && template.employee_id !== actor.employeeId) {
    await createServerNotifications(admin, [{
      recipient_employee_id: template.employee_id,
      actor_employee_id: actor.employeeId,
      kind: 'checklist_deleted',
      title: 'Checklist task deleted',
      body: `Checklist task '${template.task}' was permanently deleted.`,
      entity_type: 'checklist_template',
      entity_id: template.id,
      dedupe_key: `checklist_deleted:${template.id}:${template.employee_id}`,
    }]);
  }

  return done({ success: true, deleted: true, generatedItemsDeleted: generatedItemCount || 0 });
}
