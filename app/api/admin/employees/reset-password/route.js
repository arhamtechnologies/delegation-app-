import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../../lib/supabase-server';

function jsonError(error, status) {
  return Response.json({ error }, { status });
}

export async function POST(request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) return jsonError('Authentication is required.', 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('A valid request body is required.', 400);
  }

  const employeeId = typeof payload?.employee_id === 'string' ? payload.employee_id.trim() : '';
  const password = typeof payload?.password === 'string' ? payload.password : '';
  if (!employeeId || password.length < 8 || password.length > 128) {
    return jsonError('Employee and password details are required. Passwords must be 8 to 128 characters.', 400);
  }

  let userClient;
  let adminClient;
  try {
    userClient = createSupabaseUserClient(accessToken);
    adminClient = createSupabaseAdminClient();
  } catch {
    return jsonError('The password service is not configured.', 500);
  }

  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !user) return jsonError('Your session is invalid or has expired.', 401);

  const { data: adminEmployee, error: adminEmployeeError } = await adminClient.from('employees').select('id,role').eq('auth_user_id', user.id).maybeSingle();
  if (adminEmployeeError) return jsonError('Unable to verify administrator access.', 500);
  if (!adminEmployee || adminEmployee.role !== 'super_admin') return jsonError('Only Super Admins can reset employee passwords.', 403);

  const { data: targetEmployee, error: targetEmployeeError } = await adminClient.from('employees').select('id,name,email,auth_user_id').eq('id', employeeId).maybeSingle();
  if (targetEmployeeError) return jsonError('Unable to load the employee account.', 500);
  if (!targetEmployee) return jsonError('Employee not found.', 404);
  if (!targetEmployee.auth_user_id) return jsonError('This employee does not have a linked login account.', 409);

  const { data: authAccount, error: authAccountError } = await adminClient.auth.admin.getUserById(targetEmployee.auth_user_id);
  if (authAccountError || !authAccount?.user) return jsonError('The employee login account could not be found.', 404);

  const { error: updateError } = await adminClient.auth.admin.updateUserById(targetEmployee.auth_user_id, { password });
  if (updateError) return jsonError('The employee password could not be reset.', 500);

  return Response.json({ success: true });
}
