import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from './supabase-server';

export const taskManagerRoles = new Set(['super_admin', 'assigner', 'ea']);

export function taskApiError(message, status) {
  return Response.json({ success: false, error: message }, { status });
}

export async function authorizeTaskManager(request) {
  const token = getBearerToken(request);
  if (!token) return { response: taskApiError('You must be signed in to manage tasks.', 401) };

  let userClient;
  try {
    userClient = createSupabaseUserClient(token);
  } catch {
    return { response: taskApiError('Server authentication is not configured.', 503) };
  }

  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(token);
  if (userError || !user) return { response: taskApiError('Your session is invalid or has expired.', 401) };

  const { data: employee, error: employeeError } = await userClient
    .from('employees')
    .select('id,name,role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (employeeError) {
    console.error('Task manager role lookup failed.', { code: employeeError.code, message: employeeError.message });
    return { response: taskApiError('Your workspace role could not be verified.', 500) };
  }
  if (!employee || !taskManagerRoles.has(employee.role)) return { response: taskApiError('You do not have permission to manage tasks.', 403) };

  try {
    return { token, user, employee, userClient, admin: createSupabaseAdminClient() };
  } catch {
    return { response: taskApiError('Server database access is not configured.', 503) };
  }
}
