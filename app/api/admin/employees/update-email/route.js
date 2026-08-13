import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../../lib/supabase-server';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorResponse(message, status) {
  return Response.json({ error: message }, { status });
}

function isDuplicateAuthError(error) {
  return error?.code === 'email_exists' || /already registered|already exists|duplicate/i.test(error?.message || '');
}

async function findAuthUserByEmail(adminClient, email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) return { error };
    const match = (data?.users || []).find((user) => user.email?.trim().toLowerCase() === email);
    if (match) return { user: match };
    if ((data?.users || []).length < perPage) return { user: null };
    page += 1;
  }
}

export async function POST(request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) return errorResponse('You must be signed in to update an employee email.', 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('The email details could not be read.', 400);
  }

  const employeeId = typeof payload?.employee_id === 'string' ? payload.employee_id.trim() : '';
  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!employeeId) return errorResponse('An employee is required.', 400);
  if (!emailPattern.test(email)) return errorResponse('Enter a valid email address.', 400);

  let userClient;
  try {
    userClient = createSupabaseUserClient(accessToken);
  } catch {
    return errorResponse('Server authentication is not configured.', 500);
  }

  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !user) return errorResponse('Your session is invalid or has expired. Please sign in again.', 401);

  const { data: requester, error: requesterError } = await userClient
    .from('employees')
    .select('id,role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (requesterError) return errorResponse('Your employee permissions could not be verified.', 500);
  if (!requester || requester.role !== 'super_admin') return errorResponse('Only Super Admins can change employee login emails.', 403);

  let adminClient;
  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return errorResponse('Employee email synchronization is not configured on the server.', 503);
  }

  const { data: targetEmployee, error: targetError } = await adminClient
    .from('employees')
    .select('id,email,auth_user_id')
    .eq('id', employeeId)
    .maybeSingle();
  if (targetError) return errorResponse('Unable to load the employee.', 500);
  if (!targetEmployee) return errorResponse('Employee not found.', 404);

  const { data: otherEmployees, error: duplicateEmployeeError } = await adminClient
    .from('employees')
    .select('id,email')
    .neq('id', employeeId);
  if (duplicateEmployeeError) return errorResponse('Unable to check employee email availability.', 500);
  if ((otherEmployees || []).some((employee) => employee.email?.trim().toLowerCase() === email)) return errorResponse('This email address is already assigned to another employee.', 409);

  if (!targetEmployee.auth_user_id) {
    const { error: employeeUpdateError } = await adminClient
      .from('employees')
      .update({ email })
      .eq('id', employeeId);
    if (employeeUpdateError) return errorResponse('Unable to update the employee email. Please try again.', 500);
    return Response.json({ success: true, auth_synced: false, email });
  }

  const { data: authMatch, error: authListError } = await findAuthUserByEmail(adminClient, email);
  if (authListError) return errorResponse('Unable to check login email availability.', 500);
  if (authMatch && authMatch.id !== targetEmployee.auth_user_id) return errorResponse('This email address is already associated with another login account.', 409);

  const { data: currentAuthAccount, error: currentAuthError } = await adminClient.auth.admin.getUserById(targetEmployee.auth_user_id);
  if (currentAuthError || !currentAuthAccount?.user) return errorResponse('The employee login account could not be found.', 404);
  const previousAuthEmail = currentAuthAccount.user.email || null;

  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(targetEmployee.auth_user_id, { email });
  if (authUpdateError) {
    if (isDuplicateAuthError(authUpdateError)) return errorResponse('This email address is already associated with another login account.', 409);
    return errorResponse('Unable to update the login email. Please try again.', 500);
  }

  const { error: employeeUpdateError } = await adminClient
    .from('employees')
    .update({ email })
    .eq('id', employeeId);
  if (!employeeUpdateError) return Response.json({ success: true, auth_synced: true, email });

  if (previousAuthEmail) {
    const { error: rollbackError } = await adminClient.auth.admin.updateUserById(targetEmployee.auth_user_id, { email: previousAuthEmail });
    if (rollbackError) return errorResponse('Email synchronization failed and the previous login email could not be restored. Contact an administrator.', 500);
  }
  return errorResponse('Email synchronization failed. The previous email was restored.', 500);
}
