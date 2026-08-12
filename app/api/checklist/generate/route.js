import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../lib/supabase-server';

const managerRoles = new Set(['super_admin', 'assigner', 'ea']);
const timeZone = process.env.CHECKLIST_TIMEZONE || 'Asia/Kolkata';

function responseError(message, status) {
  return Response.json({ error: message }, { status });
}

function businessDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateParts(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return { year, month, day };
}

function isTemplateDueOnDate(template, dateValue) {
  const { year, month, day } = dateParts(dateValue);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (template.frequency === 'daily') return true;
  if (template.frequency === 'weekly') return date.getUTCDay() === template.weekday;
  if (template.frequency === 'monthly') {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day === Math.min(Number(template.day_of_month), lastDay);
  }
  if (!template.start_date || dateValue < template.start_date) return false;
  const start = dateParts(template.start_date);
  const startDate = Date.UTC(start.year, start.month - 1, start.day);
  return Math.round((date.getTime() - startDate) / 86400000) % 15 === 0;
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
    .select('id,employee_id,task,frequency,weekday,day_of_month,start_date')
    .eq('active', true);
  if (templateError) throw templateError;

  const dueTemplates = (templates || []).filter((template) => isTemplateDueOnDate(template, today));
  const rows = dueTemplates.map((template) => ({
    template_id: template.id,
    employee_id: template.employee_id,
    task: template.task,
    due_date: today,
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
    .lt('due_date', today)
    .select('id');
  if (overdueError) throw overdueError;

  return { date: today, scanned: templates?.length || 0, due: rows.length, created, markedOverdue: overdueItems?.length || 0 };
}

async function handler(request) {
  const authorization = await authorize(request);
  if (authorization.error) return authorization.error;
  try {
    return Response.json({ ok: true, ...(await generate()) });
  } catch (error) {
    console.error('Checklist generation failed.', { code: error.code, message: error.message });
    return responseError('Checklist generation failed.', 500);
  }
}

export const GET = handler;
export const POST = handler;
