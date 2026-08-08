import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../lib/supabase-server';

function errorResponse(message, status) {
  return Response.json({ error: message }, { status });
}

export async function POST(request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) return errorResponse('You must be signed in to change your password.', 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('The password could not be read.', 400);
  }

  const password = typeof payload?.password === 'string' ? payload.password : '';
  if (password.length < 8) return errorResponse('Password must be at least 8 characters.', 400);
  if (password.length > 128) return errorResponse('Password must be 128 characters or fewer.', 400);

  let userClient;
  let adminClient;
  try {
    userClient = createSupabaseUserClient(accessToken);
    adminClient = createSupabaseAdminClient();
  } catch (error) {
    console.error('Unable to initialize password-change clients.', error.message);
    return errorResponse('Password change is not configured on the server.', 503);
  }

  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !user) return errorResponse('Your session is invalid or has expired. Please sign in again.', 401);

  const { data: employee, error: employeeError } = await adminClient
    .from('employees')
    .select('id,must_change_password')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (employeeError) {
    console.error('Unable to verify password-change state.', { code: employeeError.code, message: employeeError.message });
    return errorResponse('Your employee account could not be verified.', 500);
  }
  if (!employee) return errorResponse('No employee profile is linked to this account.', 403);
  if (!employee.must_change_password) return errorResponse('A password change is not required for this account.', 409);

  const { error: passwordError } = await adminClient.auth.admin.updateUserById(user.id, { password });
  if (passwordError) {
    console.error('Unable to update the employee Auth password.', { code: passwordError.code, message: passwordError.message });
    return errorResponse(passwordError.message || 'The new password could not be saved.', 400);
  }

  const { error: employeeUpdateError } = await adminClient
    .from('employees')
    .update({ must_change_password: false })
    .eq('auth_user_id', user.id);

  if (employeeUpdateError) {
    console.error('Password changed but employee password state could not be updated.', { code: employeeUpdateError.code, message: employeeUpdateError.message });
    return errorResponse('Your password changed, but the account setup could not be completed. Please submit the new password again.', 500);
  }

  return Response.json({ success: true });
}
