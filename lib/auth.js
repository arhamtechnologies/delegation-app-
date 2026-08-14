import { supabaseBrowser } from './supabase-browser';

let authenticatedUserResultRequest = null;
let currentEmployeeRequest = null;

function getAuthenticatedUserResult() {
  if (!authenticatedUserResultRequest) {
    authenticatedUserResultRequest = (async () => {
      const { data: { session } = {}, error } = await supabaseBrowser().auth.getSession();
      return { user: session?.user || null, error };
    })().finally(() => {
      authenticatedUserResultRequest = null;
    });
  }
  return authenticatedUserResultRequest;
}

export async function getAuthenticatedUser() {
  const { user } = await getAuthenticatedUserResult();
  return user;
}

export function getCurrentEmployee() {
  if (!currentEmployeeRequest) {
    currentEmployeeRequest = (async () => {
      const supabase = supabaseBrowser();
      const { user, error: userError } = await getAuthenticatedUserResult();
      if (userError || !user) return { user: null, employee: null, error: userError };
      const { data: employee, error } = await supabase.from('employees').select('id,name,email,role,active,must_change_password').eq('auth_user_id', user.id).maybeSingle();
      return { user, employee, error };
    })().finally(() => {
      currentEmployeeRequest = null;
    });
  }
  return currentEmployeeRequest;
}

export function canCreateTasks(role) {
  return ['super_admin', 'assigner', 'ea'].includes(role);
}
