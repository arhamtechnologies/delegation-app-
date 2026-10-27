import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../../lib/supabase-server';
import { ruleResponse } from '../../../../../lib/server/actor';
import { setChecklistItemCompletion } from '../../../../../lib/server/checklist-item-rules';

function errorResponse(message, status) {
  return Response.json({ success: false, error: message }, { status });
}

export async function POST(request, { params }) {
  const itemId = (await params)?.id;
  if (!itemId) return errorResponse('A checklist item is required.', 400);

  let payload = {};
  try { payload = await request.json(); } catch {}
  const reopening = payload?.completed === false;

  const token = getBearerToken(request);
  if (!token) return errorResponse('Your session is invalid or has expired.', 401);

  let userClient;
  try {
    userClient = createSupabaseUserClient(token);
  } catch {
    return errorResponse('Server authentication is not configured.', 503);
  }

  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(token);
  if (userError || !user) {
    console.error('Checklist completion authentication failed.', { code: userError?.code, message: userError?.message });
    return errorResponse('Your session is invalid or has expired.', 401);
  }

  const { data: employee, error: employeeError } = await userClient
    .from('employees')
    .select('id,role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (employeeError) {
    console.error('Checklist completion role lookup failed.', { code: employeeError.code, message: employeeError.message });
    return errorResponse('Your workspace role could not be verified.', 500);
  }
  if (!employee) return errorResponse('Your workspace profile could not be found.', 403);

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return errorResponse('Server database access is not configured.', 503);
  }

  return ruleResponse(await setChecklistItemCompletion(admin, { employeeId: employee.id, role: employee.role, authUserId: user.id, name: '' }, itemId, !reopening));
}
