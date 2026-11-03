import { createSupabaseAdminClient } from '../../../../lib/supabase-server';

function errorResponse(message, status) {
  return Response.json({ error: message }, { status });
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse('A valid login identifier is required.', 400);
  }

  const username = typeof payload?.username === 'string' ? payload.username.trim().toLowerCase() : '';
  if (!/^[a-z]{2}-\d{3}$/.test(username)) return errorResponse('Enter a valid username such as ea-001.', 400);

  let adminClient;
  try {
    adminClient = createSupabaseAdminClient();
  } catch (error) {
    console.error('Unable to initialize login lookup.', error.message);
    return errorResponse('Login is not configured on the server.', 503);
  }

  const { data: employee, error } = await adminClient
    .from('employees')
    .select('email')
    .ilike('username', username)
    .maybeSingle();

  if (error) {
    console.error('Unable to resolve employee username.', { code: error.code, message: error.message });
    return errorResponse('Unable to sign in. Please try again.', 500);
  }
  if (!employee?.email) return errorResponse('Invalid username/email or password.', 401);

  return Response.json({ email: employee.email });
}
