import { supabaseBrowser } from './supabase-browser';

export async function getAuthenticatedUser() {
  const { data: { user } = {} } = await supabaseBrowser().auth.getUser();
  return user || null;
}

export async function getCurrentEmployee() {
  const supabase = supabaseBrowser();
  const { data: { user } = {}, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { user: null, employee: null, error: userError };
  const { data: employee, error } = await supabase.from('employees').select('id,name,email,role,active,must_change_password').eq('auth_user_id', user.id).maybeSingle();
  return { user, employee, error };
}

export function canCreateTasks(role) {
  return ['super_admin', 'assigner', 'ea'].includes(role);
}
