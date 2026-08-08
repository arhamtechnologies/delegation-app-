import { createSupabaseAdminClient, createSupabaseUserClient, getBearerToken } from '../../../../lib/supabase-server';

const managerRoles = new Set(['super_admin', 'assigner', 'ea']);
const employeeRoles = new Set(['super_admin', 'assigner', 'ea', 'doer']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
