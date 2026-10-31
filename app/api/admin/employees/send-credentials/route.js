import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../../lib/supabase-server';
import { buildCredentialEmail, credentialBatchSize, sendCredentialEmails, siteOrigin } from '../../../../../lib/server/credential-email.mjs';

export const maxDuration = 120;

const managerRoles = new Set(['super_admin', 'assigner', 'ea']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxRecipients = 300;

function jsonError(error, status) {
  return Response.json({ error }, { status });
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The login email lives on the Auth account; the employees row can drift from it, so read the real one.
async function loadAuthEmails(adminClient) {
  const emails = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { error };
    for (const user of data?.users || []) emails.set(user.id, user.email || '');
    if ((data?.users || []).length < 1000) return { emails };
  }
}

// Emails login details (username, app link, password setup link) to employees who already have a login.
// Body: { employee_ids: [uuid, ...] } for chosen people, or { all: true } for every active employee with a login.
export async function POST(request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) return jsonError('You must be signed in to send login details.', 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('A valid request body is required.', 400);
  }

  const sendToAll = payload?.all === true;
  const employeeIds = Array.isArray(payload?.employee_ids) ? [...new Set(payload.employee_ids.filter((id) => typeof id === 'string' && uuidPattern.test(id)))] : [];
  if (!sendToAll && !employeeIds.length) return jsonError('Choose at least one employee.', 400);
  if (employeeIds.length > maxRecipients) return jsonError(`Send to at most ${maxRecipients} people at a time.`, 400);
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return jsonError('Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the server.', 503);
  }

  let userClient;
  let adminClient;
  try {
    userClient = createSupabaseUserClient(accessToken);
    adminClient = createSupabaseAdminClient();
  } catch {
    return jsonError('Sending login details is not configured on the server.', 503);
  }

  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !user) return jsonError('Your session is invalid or has expired. Please sign in again.', 401);

  const { data: requester, error: requesterError } = await adminClient.from('employees').select('id,role').eq('auth_user_id', user.id).maybeSingle();
  if (requesterError) return jsonError('Your employee permissions could not be verified.', 500);
  if (!requester || !managerRoles.has(requester.role)) return jsonError('Only authorized workspace managers can send login details.', 403);

  let query = adminClient.from('employees').select('id,name,active,auth_user_id').order('name');
  query = sendToAll ? query.eq('active', true).not('auth_user_id', 'is', null) : query.in('id', employeeIds);
  const { data: employees, error: employeesError } = await query;
  if (employeesError) return jsonError('Unable to load the employees.', 500);
  if (sendToAll && employees.length > maxRecipients) return jsonError(`Too many people to email at once (${employees.length}). Contact support.`, 400);

  const { emails: authEmails, error: authError } = await loadAuthEmails(adminClient);
  if (authError) {
    console.error('Unable to list Auth accounts for login details.', { code: authError.code, message: authError.message });
    return jsonError('The login accounts could not be loaded.', 500);
  }

  const skipped = [];
  const recipients = [];
  for (const employee of employees) {
    if (!employee.active) skipped.push({ name: employee.name, reason: 'inactive' });
    else if (!employee.auth_user_id || !authEmails.has(employee.auth_user_id)) skipped.push({ name: employee.name, reason: 'no login account' });
    else if (!authEmails.get(employee.auth_user_id)) skipped.push({ name: employee.name, reason: 'no login email' });
    else recipients.push({ ...employee, email: authEmails.get(employee.auth_user_id) });
  }
  const missing = sendToAll ? 0 : employeeIds.length - employees.length;
  if (missing > 0) skipped.push({ name: `${missing} unknown employee${missing === 1 ? '' : 's'}`, reason: 'not found' });

  const appUrl = siteOrigin(request);
  const sentNames = [];
  // Each new recovery link cancels the person's previous one, so create links only for the batch about to be sent.
  for (let start = 0; start < recipients.length; start += credentialBatchSize) {
    if (start > 0) await pause(600); // stay under Resend's default 2 requests/second
    const messages = [];
    for (const employee of recipients.slice(start, start + credentialBatchSize)) {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: employee.email,
        options: { redirectTo: `${appUrl}/update-password` },
      });
      if (linkError || !linkData?.properties?.action_link) {
        console.error('Unable to create a password setup link for login details.', { employeeId: employee.id, code: linkError?.code, message: linkError?.message });
        skipped.push({ name: employee.name, reason: 'password link could not be created' });
        continue;
      }
      const message = buildCredentialEmail({ name: employee.name, email: employee.email, appUrl, setupUrl: linkData.properties.action_link, isNew: false });
      messages.push({ to: employee.email, ...message, name: employee.name });
    }
    if (!messages.length) continue;

    let result;
    try {
      result = await sendCredentialEmails(messages);
    } catch (error) {
      console.error('Login-details email request failed.', { message: error.message });
      result = { error: 'The email service could not be reached. Try again.' };
    }
    if (result.error) {
      const unsent = recipients.length - sentNames.length - skipped.filter((entry) => entry.reason === 'password link could not be created').length;
      return Response.json({ error: `${result.error} ${unsent} ${unsent === 1 ? 'person was' : 'people were'} not emailed; send again to reach them.`, sent: sentNames.length, sent_names: sentNames, skipped }, { status: 502 });
    }
    sentNames.push(...messages.map((entry) => entry.name));
  }

  if (!sentNames.length) {
    return Response.json({ sent: 0, skipped, error: skipped.length ? 'No login emails were sent.' : 'No active employees with a login were found.' }, { status: 422 });
  }
  return Response.json({ sent: sentNames.length, sent_names: sentNames, skipped });
}
