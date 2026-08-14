import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../../lib/supabase-server';

const anyEmployeeRoles = new Set(['super_admin', 'ea']);
const ownEmployeeRoles = new Set(['doer', 'assigner']);

function errorResponse(message, status) {
  return Response.json({ success: false, error: message }, { status });
}

export async function POST(request, { params }) {
  const itemId = (await params)?.id;
  if (!itemId) return errorResponse('A checklist item is required.', 400);

  const token = getBearerToken(request);
  if (!token) return errorResponse('Your session is invalid or has expired.', 401);

  let userClient;
  try {
    userClient = createSupabaseUserClient(token);
  } catch {
    return errorResponse('Server authentication is not configured.', 503);
  }

  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(token);
  if (userError || !user) return errorResponse('Your session is invalid or has expired.', 401);

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

  const { data: item, error: itemError } = await admin
    .from('checklist_items')
    .select('id,employee_id,status')
    .eq('id', itemId)
    .maybeSingle();
  if (itemError) {
    console.error('Checklist completion item lookup failed.', { code: itemError.code, message: itemError.message });
    return errorResponse('The checklist item could not be loaded.', 500);
  }
  if (!item) return errorResponse('The checklist item was not found.', 404);

  const canCompleteAny = anyEmployeeRoles.has(employee.role);
  const canCompleteOwn = ownEmployeeRoles.has(employee.role) && employee.id === item.employee_id;
  if (!canCompleteAny && !canCompleteOwn) return errorResponse('You do not have permission to complete this checklist item.', 403);

  if (item.status === 'completed') {
    return Response.json({ success: true, alreadyCompleted: true, item });
  }

  const { data: updatedItems, error: updateError } = await admin
    .from('checklist_items')
    .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: user.id })
    .eq('id', itemId)
    .in('status', ['pending', 'overdue'])
    .select('id,template_id,employee_id,task,due_date,due_at,status,completed_at,completed_by');
  if (updateError) {
    console.error('Checklist completion update failed.', { code: updateError.code, message: updateError.message });
    return errorResponse('The checklist item could not be completed.', 500);
  }
  if (updatedItems?.length === 1) return Response.json({ success: true, alreadyCompleted: false, item: updatedItems[0] });

  const { data: currentItem } = await admin
    .from('checklist_items')
    .select('id,employee_id,status')
    .eq('id', itemId)
    .maybeSingle();
  if (currentItem?.status === 'completed') return Response.json({ success: true, alreadyCompleted: true, item: currentItem });
  return errorResponse('The checklist item could not be completed.', 409);
}
