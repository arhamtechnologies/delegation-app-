import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../lib/supabase-server';
import { getChecklistBusinessDate, isChecklistDueOnDate, localDateTimeToIso } from '../../../../lib/checklist-time';

const managerRoles = new Set(['super_admin', 'assigner', 'ea']);
const timeZone = process.env.CHECKLIST_TIMEZONE || 'Asia/Kolkata';

function responseError(message, status) {
  return Response.json({ success: false, created: 0, skipped: 0, error: message }, { status });
}

function businessDate(value = new Date()) {
  return getChecklistBusinessDate(value, timeZone);
}

async function authorize(request) {
  const token = getBearerToken(request);
  if (!token) return { error: responseError('Checklist generation is protected.', 401) };
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return { mode: 'cron' };

  let userClient;
  try {
    userClient = createSupabaseUserClient(token);
  } catch {
    return { error: responseError('Server authentication is not configured.', 503) };
  }
  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(token);
  if (userError || !user) return { error: responseError('Your session is invalid or has expired.', 401) };
  const { data: employee, error } = await userClient.from('employees').select('role').eq('auth_user_id', user.id).maybeSingle();
  if (error) return { error: responseError('Your workspace role could not be verified.', 500) };
  if (!employee || !managerRoles.has(employee.role)) return { error: responseError('Only checklist managers can trigger generation.', 403) };
  return { mode: 'manager' };
}

async function generate() {
  const admin = createSupabaseAdminClient();
  const today = businessDate();
  const { data: templates, error: templateError } = await admin
    .from('checklist_templates')
    .select('id,employee_id,task,frequency,weekday,day_of_month,monthly_days,start_date,due_time')
    .eq('active', true);
  if (templateError) throw templateError;

  const dueTemplates = (templates || []).filter((template) => isChecklistDueOnDate(template, today));
  const rows = dueTemplates.map((template) => ({
    template_id: template.id,
    employee_id: template.employee_id,
    task: template.task,
    due_date: today,
    due_at: localDateTimeToIso(today, template.due_time, timeZone),
    status: 'pending',
  }));

  let created = 0;
  if (rows.length) {
    const { data, error } = await admin
      .from('checklist_items')
      .upsert(rows, { onConflict: 'template_id,due_date', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    created = data?.length || 0;
  }

  const { data: overdueItems, error: overdueError } = await admin
    .from('checklist_items')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_at', new Date().toISOString())
    .select('id');
  if (overdueError) throw overdueError;

  return {
    date: today,
    scanned: templates?.length || 0,
    due: rows.length,
    created,
    skipped: Math.max(rows.length - created, 0),
    markedOverdue: overdueItems?.length || 0,
  };
}

async function handler(request) {
  const authorization = await authorize(request);
  if (authorization.error) return authorization.error;
  try {
    return Response.json({ success: true, ok: true, ...(await generate()) });
  } catch (error) {
    console.error('Checklist generation failed.', { code: error.code, message: error.message });
    if (/(due_at|due_time|monthly_days|checklist_items|checklist_templates)/i.test(error.message || '') && /(column|relation|schema cache|does not exist)/i.test(error.message || '')) {
      return responseError(/monthly_days/i.test(error.message || '') ? 'Checklist database migration 006_checklist_monthly_days.sql is not applied.' : 'Checklist database migration 004_checklist_due_time.sql is not applied.', 500);
    }
    return responseError('Checklist generation failed. Check the server logs for the database error.', 500);
  }
}

export const GET = handler;
export const POST = handler;
