import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../lib/supabase-server';

const managerRoles = new Set(['super_admin', 'assigner', 'ea']);
const employeeRoles = new Set(['super_admin', 'assigner', 'ea', 'doer']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message, status) {
  return Response.json({ error: message }, { status });
}

function isDuplicateAuthError(error) {
  return error?.code === 'email_exists' || /already registered|already exists|duplicate/i.test(error?.message || '');
}

function validatePayload(payload) {
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const mobile = typeof payload?.mobile === 'string' ? payload.mobile.trim() : '';
  const role = typeof payload?.role === 'string' ? payload.role : '';
  const password = typeof payload?.password === 'string' ? payload.password : '';

  if (!name) return { error: 'Full name is required.' };
  if (name.length > 120) return { error: 'Full name must be 120 characters or fewer.' };
  if (!emailPattern.test(email)) return { error: 'A valid work email is required.' };
  if (!employeeRoles.has(role)) return { error: 'Choose a valid workspace role.' };
  if (password.length < 8) return { error: 'Temporary password must be at least 8 characters.' };
  if (password.length > 128) return { error: 'Temporary password must be 128 characters or fewer.' };
  if (mobile.length > 40) return { error: 'Mobile number must be 40 characters or fewer.' };
  if (typeof payload?.active !== 'boolean') return { error: 'Active workspace access must be true or false.' };

  return { value: { name, email, mobile: mobile || null, role, active: payload.active, password } };
}

export async function POST(request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) return errorResponse('You must be signed in to create an employee.', 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('The employee details could not be read.', 400);
  }

  const validation = validatePayload(payload);
  if (validation.error) return errorResponse(validation.error, 400);

  let userClient;
  try {
    userClient = createSupabaseUserClient(accessToken);
  } catch (error) {
    console.error('Unable to initialize the authenticated Supabase client.', error.message);
    return errorResponse('Server authentication is not configured.', 500);
  }

  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !user) return errorResponse('Your session is invalid or has expired. Please sign in again.', 401);

  const { data: requester, error: requesterError } = await userClient
    .from('employees')
    .select('id,role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (requesterError) {
    console.error('Unable to verify employee provisioning permissions.', { code: requesterError.code, message: requesterError.message });
    return errorResponse('Your employee permissions could not be verified.', 500);
  }
  if (!requester || !managerRoles.has(requester.role)) return errorResponse('Only authorized workspace managers can create employees.', 403);

  let adminClient;
  try {
    adminClient = createSupabaseAdminClient();
  } catch (error) {
    console.error('Unable to initialize the Supabase admin client.', error.message);
    return errorResponse('Employee provisioning is not configured on the server.', 503);
  }

  const { data: { user: authUser } = {}, error: authError } = await adminClient.auth.admin.createUser({
    email: validation.value.email,
    password: validation.value.password,
    email_confirm: true,
  });

  if (authError || !authUser) {
    if (isDuplicateAuthError(authError)) return errorResponse('An Auth account already exists for this email address.', 409);
    console.error('Unable to create the employee Auth user.', { code: authError?.code, message: authError?.message });
    return errorResponse('The employee login account could not be created.', 500);
  }

  const { data: employee, error: employeeError } = await adminClient
    .from('employees')
    .insert({
      auth_user_id: authUser.id,
      name: validation.value.name,
      email: validation.value.email,
      mobile: validation.value.mobile,
      role: validation.value.role,
      active: validation.value.active,
      must_change_password: true,
    })
    .select('id,auth_user_id,name,email,mobile,role,active,must_change_password')
    .single();

  if (employeeError || !employee) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(authUser.id);
    if (cleanupError) {
      console.error('Employee row creation failed and Auth cleanup also failed.', { employeeError: employeeError?.message, cleanupError: cleanupError.message, authUserId: authUser.id });
      return errorResponse('Employee creation failed, and the login cleanup needs administrator attention.', 500);
    }
    console.error('Employee row creation failed; the new Auth user was cleaned up.', { code: employeeError?.code, message: employeeError?.message });
    return errorResponse('The employee record could not be created. No login account was left behind.', 500);
  }

  return Response.json({ employee }, { status: 201 });
}

export async function DELETE(request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) return errorResponse('You must be signed in to delete an employee.', 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('A valid employee deletion request is required.', 400);
  }

  const employeeId = typeof payload?.employee_id === 'string' ? payload.employee_id.trim() : '';
  if (!uuidPattern.test(employeeId)) return errorResponse('A valid employee is required.', 400);

  let userClient;
  let adminClient;
  try {
    userClient = createSupabaseUserClient(accessToken);
    adminClient = createSupabaseAdminClient();
  } catch {
    return errorResponse('Employee deletion is not configured on the server.', 503);
  }

  const { data: { user } = {}, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !user) return errorResponse('Your session is invalid or has expired. Please sign in again.', 401);

  const { data: requester, error: requesterError } = await adminClient
    .from('employees')
    .select('id,role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (requesterError) return errorResponse('Your employee permissions could not be verified.', 500);
  if (!requester || !managerRoles.has(requester.role)) return errorResponse('Only authorized workspace managers can delete employees.', 403);
  if (requester.id === employeeId) return errorResponse('You cannot delete your own employee account.', 409);

  const { data: targetEmployee, error: targetError } = await adminClient
    .from('employees')
    .select('id,name,role,auth_user_id')
    .eq('id', employeeId)
    .maybeSingle();
  if (targetError) return errorResponse('Unable to load the employee.', 500);
  if (!targetEmployee) return errorResponse('Employee not found.', 404);

  if (targetEmployee.role === 'super_admin') {
    const { count, error: superAdminCountError } = await adminClient
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin');
    if (superAdminCountError) return errorResponse('Unable to verify Super Admin protection.', 500);
    if ((count || 0) <= 1) return errorResponse('The last Super Admin cannot be deleted.', 409);
  }

  const transferOperations = [
    ['assigned tasks', () => adminClient.from('tasks').update({ assignee_id: requester.id }).eq('assignee_id', employeeId)],
    ['followed tasks', () => adminClient.from('tasks').update({ follower_ea_id: requester.id }).eq('follower_ea_id', employeeId)],
    ['checklist templates', () => adminClient.from('checklist_templates').update({ employee_id: requester.id }).eq('employee_id', employeeId)],
    ['generated checklist items', () => adminClient.from('checklist_items').update({ employee_id: requester.id }).eq('employee_id', employeeId)],
    ['checklist audit records', () => adminClient.from('checklist_non_working_day_operations').update({ performed_by: requester.id }).eq('performed_by', employeeId)],
  ];
  if (targetEmployee.auth_user_id) {
    transferOperations.push(
      ['tasks created by this login', () => adminClient.from('tasks').update({ created_by: user.id }).eq('created_by', targetEmployee.auth_user_id)],
      ['task updates authored by this login', () => adminClient.from('task_updates').update({ author_user_id: user.id }).eq('author_user_id', targetEmployee.auth_user_id)],
      ['checklist templates created by this login', () => adminClient.from('checklist_templates').update({ created_by: user.id }).eq('created_by', targetEmployee.auth_user_id)],
      ['checklist items completed by this login', () => adminClient.from('checklist_items').update({ completed_by: user.id }).eq('completed_by', targetEmployee.auth_user_id)],
      ['leave records created by this login', () => adminClient.from('employee_leave_periods').update({ created_by: user.id }).eq('created_by', targetEmployee.auth_user_id)],
      ['non-working dates created by this login', () => adminClient.from('employee_non_working_days').update({ created_by: user.id }).eq('created_by', targetEmployee.auth_user_id)],
    );
  }

  for (const [label, operation] of transferOperations) {
    const { error: transferError } = await operation();
    if (transferError) {
      console.error(`Unable to transfer ${label} before employee deletion.`, { code: transferError.code, message: transferError.message, employeeId });
      return errorResponse(`The employee could not be deleted because related ${label} could not be transferred.`, 409);
    }
  }

  const { data: deletedEmployee, error: deleteError } = await adminClient
    .from('employees')
    .delete()
    .eq('id', employeeId)
    .select('id')
    .maybeSingle();
  if (deleteError) {
    console.error('Unable to delete employee record.', { code: deleteError.code, message: deleteError.message, employeeId });
    return errorResponse('The employee could not be deleted. Related records may still reference this employee.', 409);
  }
  if (!deletedEmployee) return errorResponse('Employee deletion did not affect the requested employee.', 404);

  if (targetEmployee.auth_user_id) {
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(targetEmployee.auth_user_id);
    if (authDeleteError) {
      console.error('Employee was deleted but the linked Auth user could not be removed.', { code: authDeleteError.code, message: authDeleteError.message, authUserId: targetEmployee.auth_user_id, employeeId });
      return errorResponse('The employee was deleted, but the linked login cleanup failed. Contact an administrator.', 500);
    }
  }

  return Response.json({ success: true, employee_id: employeeId });
}
