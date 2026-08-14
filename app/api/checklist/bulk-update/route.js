import { buildChecklistTemplateKey } from '../../../../lib/checklist-import';
import { authorizeChecklistManager, checklistApiError } from '../../../../lib/checklist-server';
import { createServerNotifications, notificationFingerprint } from '../../../../lib/notifications-server';

const frequencyValues = new Set(['daily', 'weekly', 'every_15_days', 'monthly']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()); }
function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
function cleanDays(value) { return [...new Set((Array.isArray(value) ? value : []).map(Number))].sort((left, right) => left - right); }

export async function POST(request) {
  const authorization = await authorizeChecklistManager(request);
  if (authorization.response) return authorization.response;
  let payload;
  try { payload = await request.json(); } catch { return checklistApiError('The bulk edit request could not be read.', 400); }
  const ids = Array.isArray(payload?.ids) ? [...new Set(payload.ids.filter((id) => typeof id === 'string' && uuidPattern.test(id)))] : [];
  const changes = payload?.changes && typeof payload.changes === 'object' ? payload.changes : {};
  if (!ids.length || !Object.keys(changes).length) return checklistApiError('Select at least one template and one field to change.', 400);
  const allowedFields = new Set(['employee_id', 'task', 'frequency', 'weekday', 'day_of_month', 'monthly_days', 'due_time', 'start_date', 'active']);
  if (Object.keys(changes).some((field) => !allowedFields.has(field))) return checklistApiError('The bulk edit contains an unsupported field.', 400);

  const { data: templates, error: templateError } = await authorization.admin.from('checklist_templates').select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time,active').in('id', ids);
  if (templateError) return checklistApiError('The selected checklist templates could not be loaded.', 500);
  if ((templates || []).length !== ids.length) return checklistApiError('One or more selected checklist templates were not found.', 404);

  if (Object.prototype.hasOwnProperty.call(changes, 'employee_id')) {
    if (!uuidPattern.test(changes.employee_id)) return checklistApiError('Choose a valid employee.', 400);
    const { data: employee } = await authorization.admin.from('employees').select('id').eq('id', changes.employee_id).eq('active', true).maybeSingle();
    if (!employee) return checklistApiError('Choose an active existing employee.', 400);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'task') && (typeof changes.task !== 'string' || !changes.task.trim() || changes.task.trim().length > 240)) return checklistApiError('Task must be between 1 and 240 characters.', 400);
  if (Object.prototype.hasOwnProperty.call(changes, 'frequency') && !frequencyValues.has(changes.frequency)) return checklistApiError('Choose a supported recurrence.', 400);
  if (Object.prototype.hasOwnProperty.call(changes, 'due_time') && !validTime(changes.due_time)) return checklistApiError('Due time must be between 00:00 and 23:59.', 400);
  if (Object.prototype.hasOwnProperty.call(changes, 'start_date') && !validDate(changes.start_date)) return checklistApiError('Start date must be a valid date.', 400);
  if (Object.prototype.hasOwnProperty.call(changes, 'active') && typeof changes.active !== 'boolean') return checklistApiError('Active status must be true or false.', 400);

  const normalizedChanges = { ...changes };
  if (Object.prototype.hasOwnProperty.call(normalizedChanges, 'task')) normalizedChanges.task = normalizedChanges.task.trim();
  if (Object.prototype.hasOwnProperty.call(normalizedChanges, 'monthly_days')) normalizedChanges.monthly_days = cleanDays(normalizedChanges.monthly_days);
  if (Object.prototype.hasOwnProperty.call(normalizedChanges, 'frequency')) {
    if (normalizedChanges.frequency === 'weekly') {
      if (!Number.isInteger(Number(normalizedChanges.weekday)) || Number(normalizedChanges.weekday) < 0 || Number(normalizedChanges.weekday) > 6) return checklistApiError('Choose a weekday for weekly recurrence.', 400);
      normalizedChanges.weekday = Number(normalizedChanges.weekday);
      normalizedChanges.day_of_month = null;
      normalizedChanges.monthly_days = [];
    } else if (normalizedChanges.frequency === 'monthly') {
      const days = cleanDays(normalizedChanges.monthly_days || [normalizedChanges.day_of_month]);
      if (!days.length || days.some((day) => !Number.isInteger(day) || day < 1 || day > 31)) return checklistApiError('Choose one or more valid monthly days.', 400);
      normalizedChanges.monthly_days = days;
      normalizedChanges.day_of_month = days[0];
      normalizedChanges.weekday = null;
    } else {
      normalizedChanges.weekday = null;
      normalizedChanges.day_of_month = null;
      normalizedChanges.monthly_days = [];
    }
  }

  const nextTemplates = templates.map((template) => ({ ...template, ...normalizedChanges }));
  for (const template of nextTemplates) {
    if (!frequencyValues.has(template.frequency)) return checklistApiError('Choose a supported recurrence.', 400);
    if (template.frequency === 'weekly' && (!Number.isInteger(Number(template.weekday)) || Number(template.weekday) < 0 || Number(template.weekday) > 6)) return checklistApiError('Choose a weekday for weekly recurrence.', 400);
    if (template.frequency === 'monthly') {
      const days = cleanDays(template.monthly_days || [template.day_of_month]);
      if (!days.length || days.some((day) => !Number.isInteger(day) || day < 1 || day > 31)) return checklistApiError('Choose one or more valid monthly days.', 400);
    }
  }
  const duplicateKeys = new Set();
  const outsideTemplates = await authorization.admin.from('checklist_templates').select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,due_time,active').eq('active', true).not('id', 'in', `(${ids.join(',')})`);
  if (outsideTemplates.error) return checklistApiError('Existing checklist templates could not be checked for duplicates.', 500);
  const outsideKeys = new Set((outsideTemplates.data || []).map(buildChecklistTemplateKey));
  for (const template of nextTemplates) {
    if (!template.active) continue;
    const key = buildChecklistTemplateKey(template);
    if (outsideKeys.has(key) || duplicateKeys.has(key)) return checklistApiError('The selected changes would create a duplicate active checklist template.', 409);
    duplicateKeys.add(key);
  }

  const { data: updated, error: updateError } = await authorization.admin.from('checklist_templates').update(normalizedChanges).in('id', ids).select('id');
  if (updateError || updated?.length !== ids.length) {
    console.error('Checklist bulk update failed.', { code: updateError?.code, message: updateError?.message });
    return checklistApiError('The selected checklist templates could not be updated.', 500);
  }
  const grouped = new Map();
  nextTemplates.forEach((template) => {
    const previous = templates.find((candidate) => candidate.id === template.id);
    const recipientIds = new Set([template.employee_id]);
    if (previous.employee_id !== template.employee_id) recipientIds.add(previous.employee_id);
    recipientIds.forEach((employeeId) => {
      const current = grouped.get(employeeId) || [];
      current.push(template);
      grouped.set(employeeId, current);
    });
  });
  await createServerNotifications(authorization.admin, [...grouped.entries()]
    .filter(([employeeId]) => employeeId !== authorization.employee.id)
    .map(([employeeId, employeeTemplates]) => ({
      recipient_employee_id: employeeId,
      actor_employee_id: authorization.employee.id,
      kind: 'checklist_bulk_updated',
      title: 'Checklist tasks updated',
      body: `${employeeTemplates.length} checklist task${employeeTemplates.length === 1 ? '' : 's'} were updated.`,
      entity_type: 'checklist_template',
      entity_id: employeeTemplates[0].id,
      dedupe_key: `checklist_bulk_updated:${notificationFingerprint([...ids].sort(), JSON.stringify(normalizedChanges))}:${employeeId}`,
    })));
  return Response.json({ success: true, updated: updated.length });
}
