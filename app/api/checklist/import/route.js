import { getChecklistBusinessDate } from '../../../../lib/checklist-time';
import { authorizeChecklistManager, checklistApiError } from '../../../../lib/checklist-server';
import { checklistImportMaxBytes, parseChecklistWorkbook, templateRowsForImport } from '../../../../lib/checklist-import';
import { createServerNotifications, notificationFingerprint } from '../../../../lib/notifications-server';

export const runtime = 'nodejs';
const timeZone = process.env.CHECKLIST_TIMEZONE || 'Asia/Kolkata';

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

async function parseRequest(request, admin, user) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Choose an Excel file to import.');
  if (file.size > checklistImportMaxBytes) throw new Error('The Excel file must be 5 MB or smaller.');
  const startDate = String(formData.get('startDate') || getChecklistBusinessDate(new Date(), timeZone));
  if (!validDate(startDate)) throw new Error('Start date must be a valid date.');
  const [{ data: employees, error: employeeError }, { data: existingTemplates, error: templateError }] = await Promise.all([
    admin.from('employees').select('id,name,email,active').eq('active', true).order('name'),
    admin.from('checklist_templates').select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,due_time,active').eq('active', true),
  ]);
  if (employeeError || templateError) throw new Error('Checklist import data could not be loaded.');
  const result = await parseChecklistWorkbook(Buffer.from(await file.arrayBuffer()), { filename: file.name, employees: employees || [], existingTemplates: existingTemplates || [], startDate });
  return { ...result, startDate, allowDuplicates: String(formData.get('allowDuplicates')) === 'true', confirm: String(formData.get('confirm')) === 'true', user };
}

export async function POST(request) {
  const authorization = await authorizeChecklistManager(request);
  if (authorization.response) return authorization.response;
  try {
    const parsed = await parseRequest(request, authorization.admin, authorization.user);
    if (!parsed.confirm) return Response.json({ success: true, preview: true, sheetName: parsed.sheetName, startDate: parsed.startDate, rows: parsed.rows, summary: parsed.summary });

    const records = templateRowsForImport(parsed.rows, { allowDuplicates: parsed.allowDuplicates, createdBy: parsed.user.id, startDate: parsed.startDate });
    if (!records.length) return checklistApiError('There are no valid checklist tasks to import.', 400);
    const { data: created, error: insertError } = await authorization.admin.from('checklist_templates').insert(records).select('id,employee_id,task');
    if (insertError) {
      console.error('Checklist import insert failed.', { code: insertError.code, message: insertError.message });
      return checklistApiError('The checklist import could not be completed. No templates were created.', 500);
    }
    const grouped = new Map();
    (created || []).forEach((template) => {
      const current = grouped.get(template.employee_id) || [];
      current.push(template);
      grouped.set(template.employee_id, current);
    });
    await createServerNotifications(authorization.admin, [...grouped.entries()]
      .filter(([employeeId]) => employeeId !== authorization.employee.id)
      .map(([employeeId, templates]) => ({
        recipient_employee_id: employeeId,
        actor_employee_id: authorization.employee.id,
        kind: 'checklist_imported',
        title: 'Checklist tasks imported',
        body: `${templates.length} new checklist task${templates.length === 1 ? '' : 's'} ${templates.length === 1 ? 'was' : 'were'} added to your work.`,
        entity_type: 'checklist_template',
        entity_id: templates[0].id,
        dedupe_key: `checklist_imported:${notificationFingerprint(templates.map((template) => template.id).sort())}:${employeeId}`,
      })));
    return Response.json({ success: true, imported: true, created: created?.length || 0, skippedDuplicates: parsed.allowDuplicates ? 0 : parsed.summary.duplicates, errors: parsed.summary.errors, errorRows: parsed.rows.filter((row) => !['Ready', 'Duplicate'].includes(row.status)) });
  } catch (error) {
    console.error('Checklist import failed.', { message: error.message });
    return checklistApiError(error.message || 'The Excel file could not be imported.', 400);
  }
}
