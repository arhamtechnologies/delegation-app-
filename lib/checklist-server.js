import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from './supabase-server';

export const checklistManagerRoles = new Set(['super_admin', 'assigner', 'ea']);
export const nonWorkingDayManagerRoles = new Set(['super_admin', 'ea']);

export function checklistApiError(message, status) {
  return Response.json({ success: false, error: message }, { status });
}

export async function authorizeChecklistManager(request) {
  const token = getBearerToken(request);
  if (!token) return { response: checklistApiError('You must be signed in to manage checklists.', 401) };
  let userClient;
  try {
    userClient = createSupabaseUserClient(token);
  } catch {
    return { response: checklistApiError('Server authentication is not configured.', 503) };
  }
  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(token);
  if (userError || !user) return { response: checklistApiError('Your session is invalid or has expired.', 401) };
  const { data: employee, error: employeeError } = await userClient.from('employees').select('id,name,role').eq('auth_user_id', user.id).maybeSingle();
  if (employeeError) {
    console.error('Checklist manager role lookup failed.', { code: employeeError.code, message: employeeError.message });
    return { response: checklistApiError('Your workspace role could not be verified.', 500) };
  }
  if (!employee || !checklistManagerRoles.has(employee.role)) return { response: checklistApiError('You do not have permission to manage checklists.', 403) };
  try {
    return { token, user, employee, userClient, admin: createSupabaseAdminClient() };
  } catch {
    return { response: checklistApiError('Server database access is not configured.', 503) };
  }
}

export async function authorizeNonWorkingDayManager(request) {
  const authorization = await authorizeChecklistManager(request);
  if (authorization.response) return authorization;
  if (!nonWorkingDayManagerRoles.has(authorization.employee.role)) {
    return { response: checklistApiError('Only Super Admins and EAs can deactivate non-working-day checklist tasks.', 403) };
  }
  return authorization;
}
